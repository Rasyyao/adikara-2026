export const SESSION_STATUSES = ["LOBBY", "ACTIVE", "ENDED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface SessionRecord {
  id: string;
  classId: string;
  teacherId: string;
  /** The PIN. NULL once the session has ended. */
  joinCode: string | null;
  status: SessionStatus;
  locked: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface ParticipantRecord {
  studentId: string;
  name: string | null;
  username: string | null;
  joinedAt: Date;
  leftAt: Date | null;
  kickedAt: Date | null;
}

/** Reads and writes both sides of a live session need (teacher and student). */
export interface SharedSessionRepository {
  findSessionById(id: string): Promise<SessionRecord | null>;
  updateSession(id: string, patch: SessionPatch): Promise<SessionRecord>;
  listParticipants(sessionId: string): Promise<ParticipantRecord[]>;
  findParticipant(sessionId: string, studentId: string): Promise<ParticipantRecord | null>;
  updateParticipant(
    sessionId: string,
    studentId: string,
    patch: Partial<Pick<ParticipantRecord, "leftAt" | "kickedAt">>,
  ): Promise<ParticipantRecord>;
}

export type SessionPatch = Partial<Pick<SessionRecord, "status" | "locked" | "startedAt" | "endedAt" | "joinCode">>;
