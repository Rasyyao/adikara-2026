import "server-only";
import { apiFetch } from "./client";
import type {
  Attendance,
  ClassView,
  EndSessionResponse,
  JoinResult,
  LoginResult,
  PublicUser,
  SessionDetail,
  SessionView,
} from "./types";

export type AccountKind = "teacher" | "student";

export const authApi = {
  loginTeacher: (email: string, password: string) =>
    apiFetch<LoginResult>("/auth/login", { method: "POST", body: { email, password } }),
  loginStudent: (username: string, password: string) =>
    apiFetch<LoginResult>("/auth/student/login", { method: "POST", body: { username, password } }),
  me: (token: string) => apiFetch<{ user: PublicUser }>("/auth/me", { token }),
};

export const classesApi = {
  list: (token: string) => apiFetch<{ items: ClassView[] }>("/classes", { token }),
};

export const teacherSessionsApi = {
  create: (token: string, classCode: string) =>
    apiFetch<SessionDetail>("/sessions", { method: "POST", token, body: { class_code: classCode } }),
  get: (token: string, id: string) => apiFetch<SessionDetail>(`/sessions/${id}`, { token }),
  start: (token: string, id: string) => apiFetch<{ session: SessionView }>(`/sessions/${id}/start`, { method: "POST", token }),
  setLocked: (token: string, id: string, locked: boolean) =>
    apiFetch<{ session: SessionView }>(`/sessions/${id}/lock`, { method: "POST", token, body: { locked } }),
  end: (token: string, id: string) => apiFetch<EndSessionResponse>(`/sessions/${id}/end`, { method: "POST", token }),
  kick: (token: string, id: string, studentId: string) =>
    apiFetch<unknown>(`/sessions/${id}/participants/${studentId}`, { method: "DELETE", token }),
  attendance: (token: string, id: string) => apiFetch<Attendance>(`/sessions/${id}/attendance`, { token }),
};

export const studentSessionsApi = {
  join: (token: string, code: string) => apiFetch<JoinResult>("/sessions/join", { method: "POST", token, body: { code } }),
};
