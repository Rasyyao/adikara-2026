import "server-only";
import { apiFetch } from "./client";
import type {
  Attendance,
  ChatDetail,
  ChatMessagesResponse,
  ChatView,
  ClassView,
  ClassDetail,
  StudentView,
  BoardResponse,
  BoardScene,
  EndSessionResponse,
  JoinResult,
  LiveSession,
  LoginResult,
  MessageView,
  NewQuiz,
  Problem,
  ProblemMaterial,
  ProblemSummary,
  ProblemAttemptView,
  ProblemResults,
  PuzzleGrade,
  PuzzleNode,
  Challenge,
  SessionProblemView,
  StudentProblem,
  PublicUser,
  QuizChoiceChange,
  QuizResults,
  QuizView,
  StudentQuiz,
  TeacherInsights,
  ClassInsights,
  ClassReport,
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
  get: (token: string, id: string) => apiFetch<ClassDetail>(`/classes/${id}`, { token }),
  create: (token: string, body: { name: string; class_code?: string }) =>
    apiFetch<{ class: ClassView }>("/classes", { method: "POST", token, body }),
  update: (token: string, id: string, body: { name?: string; archived?: boolean }) =>
    apiFetch<{ class: ClassView }>(`/classes/${id}`, { method: "PATCH", token, body }),
  remove: (token: string, id: string) => apiFetch<void>(`/classes/${id}`, { method: "DELETE", token }),
  addStudent: (token: string, classId: string, body: { username: string; name: string; password: string }) =>
    apiFetch<{ student: StudentView }>(`/classes/${classId}/students`, { method: "POST", token, body }),
  updateStudent: (token: string, classId: string, studentId: string, body: { username?: string; name?: string; password?: string; class_id?: string }) =>
    apiFetch<{ student: StudentView }>(`/classes/${classId}/students/${studentId}`, { method: "PATCH", token, body }),
  removeStudent: (token: string, classId: string, studentId: string) =>
    apiFetch<void>(`/classes/${classId}/students/${studentId}`, { method: "DELETE", token }),
};

export const insightsApi = {
  overview: (token: string) => apiFetch<TeacherInsights>("/insights", { token }),
  forClass: (token: string, classId: string) => apiFetch<ClassInsights>(`/insights/classes/${classId}`, { token }),
  requestFeedback: (token: string, classId: string) =>
    apiFetch<{ report: ClassReport }>(`/insights/classes/${classId}/feedback`, { method: "POST", token, body: {} }),
  feedback: (token: string, classId: string) => apiFetch<{ report: ClassReport | null }>(`/insights/classes/${classId}/feedback`, { token }),
};

export const problemsApi = {
  /** `material`: one material's (its id), or "none" for problems without one. */
  list: (token: string, material?: string) =>
    apiFetch<{ items: ProblemSummary[] }>(material ? `/problems?material=${encodeURIComponent(material)}` : "/problems", { token }),
  materials: (token: string) => apiFetch<{ items: ProblemMaterial[] }>("/problems/materials", { token }),
  get: (token: string, id: string) => apiFetch<{ problem: Problem }>(`/problems/${id}`, { token }),
  create: (token: string, title: string, story: string, materialId: string | null) =>
    apiFetch<{ problem: Problem }>("/problems", { method: "POST", token, body: { title, story, material_id: materialId } }),
  generate: (token: string, materialId: string, focus: string | null, count: number) =>
    apiFetch<{ items: Problem[] }>("/problems/generate", { method: "POST", token, body: { material_id: materialId, focus, count } }),
  regenerate: (token: string, id: string, focus?: string | null) =>
    apiFetch<{ problem: Problem }>(`/problems/${id}/regenerate`, { method: "POST", token, body: focus === undefined ? {} : { focus } }),
  save: (token: string, id: string, body: { title: string; story: string; challenge: Challenge; material_id?: string | null }) =>
    apiFetch<{ problem: Problem }>(`/problems/${id}`, { method: "PUT", token, body }),
  setStatus: (token: string, id: string, status: Problem["status"]) => apiFetch<{ problem: Problem }>(`/problems/${id}/status`, { method: "POST", token, body: { status } }),
  duplicate: (token: string, id: string) => apiFetch<{ problem: Problem }>(`/problems/${id}/duplicate`, { method: "POST", token, body: {} }),
  remove: (token: string, id: string) => apiFetch<void>(`/problems/${id}`, { method: "DELETE", token }),
  check: (token: string, id: string, answer: PuzzleNode[]) => apiFetch<PuzzleGrade>(`/problems/${id}/check`, { method: "POST", token, body: { answer } }),
};

export const teacherSessionsApi = {
  /** The caller's sessions that have not ended (an admin gets every teacher's). */
  listLive: (token: string) => apiFetch<{ items: LiveSession[] }>("/sessions?status=live", { token }),
  create: (token: string, classCode: string, chatId?: string) =>
    apiFetch<SessionDetail>("/sessions", {
      method: "POST",
      token,
      body: chatId ? { class_code: classCode, chat_id: chatId } : { class_code: classCode },
    }),
  board: (token: string, id: string) => apiFetch<BoardResponse>(`/sessions/${id}/board`, { token }),
  saveBoard: (token: string, id: string, scene: BoardScene) =>
    apiFetch<{ updated_at: string }>(`/sessions/${id}/board`, { method: "PUT", token, body: scene }),
  /** Assigns a prepared material to the session; null removes it. */
  assignMaterial: (token: string, id: string, chatId: string | null) =>
    apiFetch<SessionDetail>(`/sessions/${id}/material`, { method: "PUT", token, body: { chat_id: chatId } }),
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

export const teacherQuizzesApi = {
  create: (token: string, sessionId: string, quiz: NewQuiz) => apiFetch<{ quiz: QuizView }>(`/sessions/${sessionId}/quizzes`, { method: "POST", token, body: quiz }),
  list: (token: string, sessionId: string) => apiFetch<{ items: (QuizView & { started: number; submitted: number })[] }>(`/sessions/${sessionId}/quizzes`, { token }),
  close: (token: string, sessionId: string, quizId: string) => apiFetch<{ quiz: QuizView }>(`/sessions/${sessionId}/quizzes/${quizId}/close`, { method: "POST", token, body: {} }),
  results: (token: string, sessionId: string, quizId: string) => apiFetch<QuizResults>(`/sessions/${sessionId}/quizzes/${quizId}/results`, { token }),
  exportData: (token: string, sessionId: string, quizId: string) => apiFetch<Record<string, unknown>>(`/sessions/${sessionId}/quizzes/${quizId}/export`, { token }),
};

export const studentQuizzesApi = {
  play: (token: string, sessionId: string, quizId: string) => apiFetch<StudentQuiz>(`/sessions/${sessionId}/quizzes/${quizId}`, { token }),
  start: (token: string, sessionId: string, quizId: string, body: { entry: string; client: Record<string, unknown> }) =>
    apiFetch<StudentQuiz>(`/sessions/${sessionId}/quizzes/${quizId}/attempt`, { method: "POST", token, body }),
  answer: (token: string, sessionId: string, quizId: string, body: { question_id: number; choice: string; time_ms: number; visits: number; changes: QuizChoiceChange[] }) =>
    apiFetch<{ answered: number; total: number }>(`/sessions/${sessionId}/quizzes/${quizId}/attempt/answers`, { method: "PUT", token, body }),
  submit: (token: string, sessionId: string, quizId: string) => apiFetch<StudentQuiz>(`/sessions/${sessionId}/quizzes/${quizId}/attempt/submit`, { method: "POST", token, body: {} }),
};

export const teacherSessionProblemsApi = {
  send: (token: string, sessionId: string, problemId: string) =>
    apiFetch<{ problem: SessionProblemView }>(`/sessions/${sessionId}/problems`, { method: "POST", token, body: { problem_id: problemId } }),
  list: (token: string, sessionId: string) => apiFetch<{ items: (SessionProblemView & { opened: number; solved: number })[] }>(`/sessions/${sessionId}/problems`, { token }),
  results: (token: string, sessionId: string, id: string) => apiFetch<ProblemResults>(`/sessions/${sessionId}/problems/${id}/results`, { token }),
  close: (token: string, sessionId: string, id: string) => apiFetch<{ problem: SessionProblemView }>(`/sessions/${sessionId}/problems/${id}/close`, { method: "POST", token, body: {} }),
};

export const studentSessionProblemsApi = {
  open: (token: string, sessionId: string) => apiFetch<{ items: (SessionProblemView & { solved: boolean })[] }>(`/sessions/${sessionId}/open-problems`, { token }),
  play: (token: string, sessionId: string, id: string) => apiFetch<StudentProblem>(`/sessions/${sessionId}/problems/${id}`, { token }),
  check: (token: string, sessionId: string, id: string, answer: PuzzleNode[]) =>
    apiFetch<{ grade: PuzzleGrade; attempt: ProblemAttemptView }>(`/sessions/${sessionId}/problems/${id}/check`, { method: "POST", token, body: { answer } }),
  code: (token: string, sessionId: string, id: string, body: { code: string; passed: number; total: number }) =>
    apiFetch<{ solved: boolean; attempt: ProblemAttemptView }>(`/sessions/${sessionId}/problems/${id}/code`, { method: "POST", token, body }),
};

export const teacherChatsApi = {
  list: (token: string) => apiFetch<{ items: ChatView[] }>("/chats", { token }),
  create: (token: string, title?: string) =>
    apiFetch<{ chat: ChatView }>("/chats", { method: "POST", token, body: title ? { title } : {} }),
  get: (token: string, id: string) => apiFetch<ChatDetail>(`/chats/${id}`, { token }),
  editMessage: (token: string, id: string, messageId: string, content: string) =>
    apiFetch<{ message: MessageView }>(`/chats/${id}/messages/${messageId}`, { method: "PATCH", token, body: { content } }),
  stop: (token: string, id: string) => apiFetch<void>(`/chats/${id}/stop`, { method: "POST", token }),
  remove: (token: string, id: string) => apiFetch<void>(`/chats/${id}`, { method: "DELETE", token }),
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
