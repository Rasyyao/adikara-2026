import { AppError } from "../../http/errors.js";
import type { EventSink, SessionEvent, Viewer } from "../../lib/event-hub.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { SessionRecord } from "../../types/shared/session.types.js";
import type { SessionCore } from "./session-core.js";
import { sessionNotFound, toStudentSessionView } from "./session-views.js";

export interface SessionStream {
  /** First message of the stream: the current state. */
  snapshot: SessionEvent;
  /** The session had already ended: send the snapshot and close. */
  ended: boolean;
  /** Call after the snapshot was written; events that arrived meanwhile are delivered, then new ones pass straight through. */
  activate(): void;
  unsubscribe(): void;
}

/** The live event stream of a session, for teachers (their own sessions) and students (the one they joined). */
export interface SessionStreamService {
  subscribe(auth: AuthContext, sessionId: string, sink: EventSink): Promise<SessionStream>;
}

export function createSessionStreamService(core: SessionCore): SessionStreamService {
  const { hub, sessions } = core;

  return {
    async subscribe(auth, sessionId, sink) {
      let viewer: Viewer;
      let session: SessionRecord;

      if (auth.kind === "teacher") {
        session = await core.loadManaged(auth, sessionId);
        viewer = { kind: "staff" };
      } else {
        const found = await sessions.findSessionById(sessionId);
        if (!found) throw sessionNotFound();
        session = await core.closeIfExpired(found);
        const participant = await sessions.findParticipant(session.id, auth.userId);
        if (!participant) throw new AppError(403, "not_joined", "Join the session with its PIN first");
        if (participant.kickedAt) throw new AppError(403, "kicked", "You were removed from this session");
        viewer = { kind: "student", studentId: auth.userId };
      }

      const snapshotData =
        viewer.kind === "staff"
          ? { ...(await core.detail(session)) }
          : { session: toStudentSessionView(session), participant_count: await core.countJoined(session.id) };
      const snapshot: SessionEvent = { type: "snapshot", data: snapshotData };

      if (session.status === "ENDED") return { snapshot, ended: true, activate() {}, unsubscribe() {} };

      // Events that arrive between subscribing and the snapshot being written wait in a queue.
      let queue: SessionEvent[] | null = [];
      const unsubscribeHub = hub.subscribe(session.id, viewer, {
        send: (event) => (queue ? queue.push(event) : sink.send(event)),
        close: () => sink.close(),
      });

      if (viewer.kind === "student") {
        core.cancelLeave(session.id, viewer.studentId);
        // A student coming back after the grace period is "joined" again.
        const current = await sessions.findParticipant(session.id, viewer.studentId);
        if (current?.leftAt && !current.kickedAt) {
          const back = await sessions.updateParticipant(session.id, viewer.studentId, { leftAt: null });
          hub.publish(session.id, core.joinedEvent(back, await core.countJoined(session.id)), "staff");
        }
      }

      return {
        snapshot,
        ended: false,
        activate() {
          const waiting = queue ?? [];
          queue = null;
          for (const event of waiting) sink.send(event);
        },
        unsubscribe() {
          unsubscribeHub();
          if (viewer.kind === "student" && hub.countStudent(session.id, viewer.studentId) === 0) {
            core.scheduleLeave(session.id, viewer.studentId);
          }
        },
      };
    },
  };
}
