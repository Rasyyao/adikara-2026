import { AppError } from "../../http/errors.js";
import type { ParticipantRecord, SessionRecord } from "../../types/shared/session.types.js";

// What the session endpoints return (snake_case, dates as ISO strings), and the mappers from records.

export interface SessionView {
  id: string;
  class_id: string;
  join_code: string | null;
  status: SessionRecord["status"];
  locked: boolean;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string;
  created_at: string;
  /** The material prepared for this class; see `SessionDetail.material`. */
  chat_id: string | null;
}

/** The prepared material (chat workspace) assigned to a session. */
export interface SessionMaterialView {
  id: string;
  title: string;
}

/** What a student sees of a session: no PIN, no list of classmates. */
export interface StudentSessionView {
  id: string;
  class_id: string;
  status: SessionRecord["status"];
  locked: boolean;
  started_at: string | null;
}

export interface ParticipantView {
  student_id: string;
  name: string | null;
  username: string | null;
  state: "joined" | "left" | "kicked";
  joined_at: string;
  left_at: string | null;
  kicked_at: string | null;
}

export interface SessionDetail {
  session: SessionView;
  material: SessionMaterialView | null;
  participants: ParticipantView[];
}

export const sessionNotFound = () => new AppError(404, "session_not_found", "Session not found");
export const sessionEnded = () => new AppError(409, "session_ended", "The session has ended");

export const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

export function toSessionView(s: SessionRecord): SessionView {
  return {
    id: s.id,
    class_id: s.classId,
    join_code: s.joinCode,
    status: s.status,
    locked: s.locked,
    started_at: iso(s.startedAt),
    ended_at: iso(s.endedAt),
    expires_at: s.expiresAt.toISOString(),
    created_at: s.createdAt.toISOString(),
    chat_id: s.chatId,
  };
}

export function toStudentSessionView(s: SessionRecord): StudentSessionView {
  return { id: s.id, class_id: s.classId, status: s.status, locked: s.locked, started_at: iso(s.startedAt) };
}

export function toParticipantView(p: ParticipantRecord): ParticipantView {
  return {
    student_id: p.studentId,
    name: p.name,
    username: p.username,
    state: p.kickedAt ? "kicked" : p.leftAt ? "left" : "joined",
    joined_at: p.joinedAt.toISOString(),
    left_at: iso(p.leftAt),
    kicked_at: iso(p.kickedAt),
  };
}
