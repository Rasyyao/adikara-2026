import type { ParticipantRecord, SessionRecord } from "../shared/session.types.js";

/** What a student needs to join a session. */
export interface StudentSessionRepository {
  /** The class a student belongs to, or null when the student does not exist. */
  findStudentClassId(studentId: string): Promise<string | null>;
  findSessionByCode(code: string): Promise<SessionRecord | null>;
  addParticipant(sessionId: string, studentId: string, joinedAt: Date): Promise<ParticipantRecord>;
}
