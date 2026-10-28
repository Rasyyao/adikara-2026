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
  /** The prepared material (a chat workspace) assigned to this session; null when none. */
  chatId: string | null;
}

/** The part of a chat a session needs to show and check: who owns it and what it is called. */
export interface ChatSummary {
  id: string;
  teacherId: string;
  title: string;
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
  findChatSummary(chatId: string): Promise<ChatSummary | null>;
  updateSession(id: string, patch: SessionPatch): Promise<SessionRecord>;
  listParticipants(sessionId: string): Promise<ParticipantRecord[]>;
  findParticipant(sessionId: string, studentId: string): Promise<ParticipantRecord | null>;
  updateParticipant(
    sessionId: string,
    studentId: string,
    patch: Partial<Pick<ParticipantRecord, "leftAt" | "kickedAt">>,
  ): Promise<ParticipantRecord>;
}

export type SessionPatch = Partial<Pick<SessionRecord, "status" | "locked" | "startedAt" | "endedAt" | "joinCode" | "chatId">>;
