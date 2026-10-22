// Mirrors the OpenAPI components in apps/api/docs/openapi.json. Keep in sync when the API changes.

export type Role = "ADMIN" | "TEACHER" | "USER";
export type SessionStatus = "LOBBY" | "ACTIVE" | "ENDED";
export type ParticipantState = "joined" | "left" | "kicked";
export type AttendanceStatus = "present" | "late" | "absent" | "kicked";

export interface PublicUser {
  id: string;
  role: Role;
  name: string | null;
}

export interface LoginResult {
  access_token: string;
  token_type: "Bearer";
  /** Lifetime in seconds. */
  expires_in: number;
  user: PublicUser;
}

export interface ClassView {
  id: string;
  name: string;
  class_code: string;
  teacher: { id: string; name: string };
  archived: boolean;
  student_count: number;
  created_at: string;
}

export interface SessionView {
  id: string;
  class_id: string;
  /** The 6-digit PIN; null once the session has ended. */
  join_code: string | null;
  status: SessionStatus;
  locked: boolean;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface StudentSessionView {
  id: string;
  class_id: string;
  status: SessionStatus;
  locked: boolean;
  started_at: string | null;
}

export interface ParticipantView {
  student_id: string;
  name: string | null;
  username: string | null;
  state: ParticipantState;
  joined_at: string;
  left_at: string | null;
  kicked_at: string | null;
}

export interface SessionDetail {
  session: SessionView;
  participants: ParticipantView[];
}

export interface JoinResult {
  session: StudentSessionView;
  participant: ParticipantView;
}

export interface Attendance {
  session_id: string;
  class_id: string;
  summary: { present: number; late: number; absent: number; kicked: number; total: number };
  students: Array<{
    student_id: string;
    name: string | null;
    username: string | null;
    status: AttendanceStatus;
    joined_at: string | null;
  }>;
}

export interface EndSessionResponse {
  session: SessionView;
  attendance: Attendance;
}
