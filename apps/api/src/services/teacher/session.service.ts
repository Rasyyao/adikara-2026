import { AppError } from "../../http/errors.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { ParticipantRecord, SessionRecord } from "../../types/shared/session.types.js";
import type { TeacherSessionRepository } from "../../types/teacher/session.types.js";
import type { SessionCore } from "../shared/session-core.js";
import {
  iso,
  sessionEnded,
  toParticipantView,
  toSessionView,
  type ParticipantView,
  type SessionDetail,
  type SessionView,
} from "../shared/session-views.js";

export type AttendanceStatus = "present" | "late" | "absent" | "kicked";

export interface AttendanceRow {
  student_id: string;
  name: string | null;
  username: string | null;
  status: AttendanceStatus;
  joined_at: string | null;
}

export interface Attendance {
  session_id: string;
  class_id: string;
  summary: Record<AttendanceStatus, number> & { total: number };
  students: AttendanceRow[];
}

/** Managing live sessions: for teachers (their own classes) and admins (any class). */
export interface LiveSession {
  session: SessionView;
  class_name: string;
  joined_count: number;
}

export interface TeacherSessionService {
  /** The caller's sessions that have not ended: all of them for an admin. Expired ones are closed and left out. */
  listLiveSessions(auth: AuthContext): Promise<{ items: LiveSession[] }>;
  createSession(auth: AuthContext, classCode: string): Promise<SessionDetail>;
  getSession(auth: AuthContext, sessionId: string): Promise<SessionDetail>;
  startSession(auth: AuthContext, sessionId: string): Promise<{ session: SessionView }>;
  setLocked(auth: AuthContext, sessionId: string, locked: boolean): Promise<{ session: SessionView }>;
  endSession(auth: AuthContext, sessionId: string): Promise<{ session: SessionView; attendance: Attendance }>;
  kickParticipant(auth: AuthContext, sessionId: string, studentId: string): Promise<{ participant: ParticipantView }>;
  getAttendance(auth: AuthContext, sessionId: string): Promise<Attendance>;
}

const MAX_CODE_ATTEMPTS = 5;

function byName(a: { name: string | null; username: string | null }, b: { name: string | null; username: string | null }) {
  return (a.name ?? a.username ?? "").localeCompare(b.name ?? b.username ?? "");
}

export function createTeacherSessionService(repository: TeacherSessionRepository, core: SessionCore): TeacherSessionService {
  const { options, hub, sessions } = core;

  async function buildAttendance(session: SessionRecord): Promise<Attendance> {
    const [students, participants] = await Promise.all([
      repository.listClassStudents(session.classId),
      sessions.listParticipants(session.id),
    ]);
    const joined = new Map(participants.map((p) => [p.studentId, p]));

    const statusOf = (p: ParticipantRecord | undefined): AttendanceStatus => {
      if (!p) return "absent";
      if (p.kickedAt) return "kicked";
      return session.startedAt && p.joinedAt.getTime() > session.startedAt.getTime() ? "late" : "present";
    };

    // Class roster first, then anyone who joined but has since left the class.
    const people = [
      ...students.map((s) => ({ id: s.id, name: s.name, username: s.username })),
      ...participants
        .filter((p) => !students.some((s) => s.id === p.studentId))
        .map((p) => ({ id: p.studentId, name: p.name, username: p.username })),
    ].sort(byName);

    const rows: AttendanceRow[] = people.map((person) => {
      const p = joined.get(person.id);
      return {
        student_id: person.id,
        name: person.name,
        username: person.username,
        status: statusOf(p),
        joined_at: iso(p?.joinedAt ?? null),
      };
    });

    const summary = { present: 0, late: 0, absent: 0, kicked: 0, total: rows.length };
    for (const row of rows) summary[row.status] += 1;
    return { session_id: session.id, class_id: session.classId, summary, students: rows };
  }

  return {
    async listLiveSessions(auth) {
      core.assertStaff(auth);
      const open = await repository.listOpenSessions(auth.role === "TEACHER" ? auth.userId : undefined);
      const current = await Promise.all(open.map(async (row) => ({ ...row, session: await core.closeIfExpired(row.session) })));
      const live = current.filter((row) => row.session.status !== "ENDED");
      const items = await Promise.all(
        live.map(async ({ session, className }) => ({
          session: toSessionView(session),
          class_name: className,
          joined_count: await core.countJoined(session.id),
        })),
      );
      return { items };
    },

    async createSession(auth, classCode) {
      core.assertStaff(auth);
      const classroom = await repository.findClassroomByCode(classCode);
      if (!classroom || (auth.role === "TEACHER" && classroom.teacherId !== auth.userId)) {
        throw new AppError(404, "class_not_found", "Class not found");
      }
      if (classroom.archived) throw new AppError(409, "class_archived", "The class is archived");

      const open = await repository.findOpenSessionByClass(classroom.id);
      if (open) {
        const current = await core.closeIfExpired(open);
        if (current.status !== "ENDED") {
          throw new AppError(409, "session_already_active", "This class already has a live session", { session_id: current.id });
        }
      }

      const expiresAt = new Date(options.now().getTime() + options.ttlMs);
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const created = await repository.createSession({
          classId: classroom.id,
          teacherId: classroom.teacherId,
          joinCode: options.generateCode(),
          expiresAt,
        });
        if (created) return core.detail(created);
      }
      throw new AppError(503, "join_code_unavailable", "Could not generate a free join code, try again");
    },

    async getSession(auth, sessionId) {
      return core.detail(await core.loadManaged(auth, sessionId));
    },

    async startSession(auth, sessionId) {
      const session = await core.loadManaged(auth, sessionId);
      if (session.status === "ENDED") throw sessionEnded();
      if (session.status === "ACTIVE") throw new AppError(409, "session_already_started", "The session has already started");

      const started = await sessions.updateSession(session.id, { status: "ACTIVE", startedAt: options.now() });
      hub.publish(session.id, { type: "session_started", data: { started_at: iso(started.startedAt) } }, "all");
      return { session: toSessionView(started) };
    },

    async setLocked(auth, sessionId, locked) {
      const session = await core.loadManaged(auth, sessionId);
      if (session.status === "ENDED") throw sessionEnded();
      if (session.locked === locked) return { session: toSessionView(session) };

      const updated = await sessions.updateSession(session.id, { locked });
      hub.publish(session.id, { type: locked ? "session_locked" : "session_unlocked", data: {} }, "all");
      return { session: toSessionView(updated) };
    },

    async endSession(auth, sessionId) {
      const session = await core.loadManaged(auth, sessionId);
      if (session.status === "ENDED") throw sessionEnded();

      const ended = await core.endNow(session);
      return { session: toSessionView(ended), attendance: await buildAttendance(ended) };
    },

    async kickParticipant(auth, sessionId, studentId) {
      const session = await core.loadManaged(auth, sessionId);
      if (session.status === "ENDED") throw sessionEnded();

      const participant = await sessions.findParticipant(session.id, studentId);
      if (!participant) throw new AppError(404, "participant_not_found", "That student is not in this session");
      if (participant.kickedAt) return { participant: toParticipantView(participant) };

      const now = options.now();
      const updated = await sessions.updateParticipant(session.id, studentId, {
        kickedAt: now,
        leftAt: participant.leftAt ?? now,
      });
      core.cancelLeave(session.id, studentId);
      hub.publish(session.id, { type: "kicked", data: {} }, { studentId });
      hub.close(session.id, studentId);
      hub.publish(session.id, { type: "participant_left", data: { student_id: studentId, reason: "kicked" } }, "staff");
      return { participant: toParticipantView(updated) };
    },

    async getAttendance(auth, sessionId) {
      return buildAttendance(await core.loadManaged(auth, sessionId));
    },
  };
}
