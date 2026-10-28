import { AppError } from "../../http/errors.js";
import type { EventHub, SessionEvent } from "../../lib/event-hub.js";
import { generateJoinCode } from "../../lib/join-code.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { ParticipantRecord, SessionRecord, SharedSessionRepository } from "../../types/shared/session.types.js";
import { iso, sessionNotFound, toParticipantView, toSessionView, type SessionDetail } from "./session-views.js";

export interface SessionOptions {
  /** How long a session lives before it closes by itself. */
  ttlMs: number;
  /** How long a dropped stream may stay away before the student counts as left. */
  presenceGraceMs: number;
  now: () => Date;
  generateCode: () => string;
}

/**
 * The rules every side of a live session relies on: closing, expiry, who may manage a session, and
 * presence timers. The teacher service, the student service and the event stream all use one core,
 * so they cannot disagree about them.
 */
export interface SessionCore {
  options: SessionOptions;
  hub: EventHub;
  sessions: SharedSessionRepository;
  /** Throws 403 unless the caller is a teacher or admin account. */
  assertStaff(auth: AuthContext): void;
  /** The session if the caller may manage it. Teachers see only their own; a foreign id looks like a missing one. */
  loadManaged(auth: AuthContext, sessionId: string): Promise<SessionRecord>;
  /** A session past its expiry is closed on first contact, so no background job is needed. */
  closeIfExpired(session: SessionRecord): Promise<SessionRecord>;
  endNow(session: SessionRecord): Promise<SessionRecord>;
  detail(session: SessionRecord): Promise<SessionDetail>;
  countJoined(sessionId: string): Promise<number>;
  joinedEvent(participant: ParticipantRecord, count: number): SessionEvent;
  scheduleLeave(sessionId: string, studentId: string): void;
  cancelLeave(sessionId: string, studentId: string): void;
}

export function createSessionCore(
  sessions: SharedSessionRepository,
  hub: EventHub,
  overrides: Partial<SessionOptions> = {},
): SessionCore {
  const options: SessionOptions = {
    ttlMs: 4 * 60 * 60 * 1000,
    presenceGraceMs: 10_000,
    now: () => new Date(),
    generateCode: generateJoinCode,
    ...overrides,
  };

  /** Pending "student left" timers, keyed by session + student. */
  const leaveTimers = new Map<string, NodeJS.Timeout>();
  const timerKey = (sessionId: string, studentId: string) => `${sessionId}:${studentId}`;

  const core: SessionCore = {
    options,
    hub,
    sessions,

    assertStaff(auth) {
      if (auth.kind !== "teacher") throw new AppError(403, "forbidden", "You do not have access to this resource");
    },

    async loadManaged(auth, sessionId) {
      core.assertStaff(auth);
      const found = await sessions.findSessionById(sessionId);
      if (!found || (auth.role === "TEACHER" && found.teacherId !== auth.userId)) throw sessionNotFound();
      return core.closeIfExpired(found);
    },

    async closeIfExpired(session) {
      if (session.status !== "ENDED" && session.expiresAt.getTime() <= options.now().getTime()) {
        return core.endNow(session);
      }
      return session;
    },

    async endNow(session) {
      const ended = await sessions.updateSession(session.id, { status: "ENDED", endedAt: options.now(), joinCode: null });
      hub.publish(session.id, { type: "session_ended", data: { ended_at: iso(ended.endedAt) } }, "all");
      hub.close(session.id);
      return ended;
    },

    async detail(session) {
      const [participants, chat] = await Promise.all([
        sessions.listParticipants(session.id),
        session.chatId ? sessions.findChatSummary(session.chatId) : null,
      ]);
      return {
        session: toSessionView(session),
        material: chat ? { id: chat.id, title: chat.title } : null,
        participants: participants.map(toParticipantView),
      };
    },

    async countJoined(sessionId) {
      return (await sessions.listParticipants(sessionId)).filter((p) => !p.kickedAt).length;
    },

    joinedEvent(participant, count) {
      return { type: "participant_joined", data: { ...toParticipantView(participant), participant_count: count } };
    },

    scheduleLeave(sessionId, studentId) {
      const key = timerKey(sessionId, studentId);
      clearTimeout(leaveTimers.get(key));
      const timer = setTimeout(async () => {
        leaveTimers.delete(key);
        try {
          if (hub.countStudent(sessionId, studentId) > 0) return;
          const session = await sessions.findSessionById(sessionId);
          if (!session || session.status === "ENDED") return;
          const participant = await sessions.findParticipant(sessionId, studentId);
          if (!participant || participant.leftAt || participant.kickedAt) return;
          await sessions.updateParticipant(sessionId, studentId, { leftAt: options.now() });
          hub.publish(sessionId, { type: "participant_left", data: { student_id: studentId, reason: "disconnected" } }, "staff");
        } catch (err) {
          console.error("failed to mark a student as left", err);
        }
      }, options.presenceGraceMs);
      timer.unref();
      leaveTimers.set(key, timer);
    },

    cancelLeave(sessionId, studentId) {
      const key = timerKey(sessionId, studentId);
      clearTimeout(leaveTimers.get(key));
      leaveTimers.delete(key);
    },
  };
  return core;
}
