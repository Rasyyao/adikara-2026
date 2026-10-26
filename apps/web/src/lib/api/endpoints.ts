import "server-only";
import { apiFetch } from "./client";
import type {
  Attendance,
  ChatDetail,
  ChatMessagesResponse,
  ChatView,
  ClassView,
  EndSessionResponse,
  JoinResult,
  LiveSession,
  LoginResult,
  PublicUser,
  SendMessageResult,
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
  /** The caller's sessions that have not ended (an admin gets every teacher's). */
  listLive: (token: string) => apiFetch<{ items: LiveSession[] }>("/sessions?status=live", { token }),
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

export const teacherChatsApi = {
  list: (token: string) => apiFetch<{ items: ChatView[] }>("/chats", { token }),
  create: (token: string, title?: string) =>
    apiFetch<{ chat: ChatView }>("/chats", { method: "POST", token, body: title ? { title } : {} }),
  get: (token: string, id: string) => apiFetch<ChatDetail>(`/chats/${id}`, { token }),
  messages: (token: string, id: string, query?: { limit?: number; after?: string }) => {
    const params = new URLSearchParams();
    if (query?.limit) params.set("limit", String(query.limit));
    if (query?.after) params.set("after", query.after);
    const qs = params.toString();
    return apiFetch<ChatMessagesResponse>(`/chats/${id}/messages${qs ? `?${qs}` : ""}`, { token });
  },
  send: (token: string, id: string, payload: FormData | { text: string }) =>
    apiFetch<SendMessageResult>(`/chats/${id}/messages`, { method: "POST", token, body: payload }),
};
