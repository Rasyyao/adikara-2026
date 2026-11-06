"use server";

import { ApiError } from "@/lib/api/errors";
import { studentQuizzesApi, teacherQuizzesApi } from "@/lib/api/endpoints";
import type { NewQuiz, QuizChoiceChange, QuizResults, QuizView, StudentQuiz } from "@/lib/api/types";
import { requireActionToken } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";
import type { ActionResult } from "./sessions";

// Quizzes in a live session. Every action re-checks who calls it: Server Actions are public HTTP endpoints.

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network_error":
        return "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.";
      case "quiz_closed":
        return "Kuis ini sudah ditutup guru.";
      case "quiz_not_found":
        return "Kuis tidak ditemukan.";
      case "quiz_not_started":
        return "Mulai kuisnya dulu.";
      case "quiz_submitted":
        return "Jawaban kuis ini sudah dikumpulkan.";
      case "session_ended":
        return "Sesi sudah berakhir.";
      case "not_joined":
        return "Masuk ke sesi dulu dengan PIN dari guru, lalu buka kuisnya lagi.";
      case "kicked":
        return "Anda dikeluarkan dari sesi ini.";
      case "validation_error":
        return "Soal kuis tidak lengkap: setiap soal butuh pertanyaan, pilihan, dan kunci jawaban.";
      case "unauthorized":
      case "forbidden":
        return "Sesi masuk telah berakhir. Muat ulang halaman.";
    }
  }
  return "Terjadi kesalahan di server. Coba lagi sebentar lagi.";
}

async function call<T>(role: "staff" | "student", ids: string[], run: (token: string) => Promise<T>): Promise<ActionResult<{ data: T }>> {
  if (!ids.every(isUuid)) return { ok: false, message: "Kuis tidak valid." };
  try {
    const token = await requireActionToken(role);
    return { ok: true, data: await run(token) };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

// ---- Teacher ------------------------------------------------------------------------------

export async function createQuizAction(sessionId: string, quiz: NewQuiz): Promise<ActionResult<{ data: { quiz: QuizView } }>> {
  return call("staff", [sessionId], (token) => teacherQuizzesApi.create(token, sessionId, quiz));
}

export async function listQuizzesAction(sessionId: string) {
  return call("staff", [sessionId], (token) => teacherQuizzesApi.list(token, sessionId));
}

export async function closeQuizAction(sessionId: string, quizId: string) {
  return call("staff", [sessionId, quizId], (token) => teacherQuizzesApi.close(token, sessionId, quizId));
}

export async function quizResultsAction(sessionId: string, quizId: string): Promise<ActionResult<{ data: QuizResults }>> {
  return call("staff", [sessionId, quizId], (token) => teacherQuizzesApi.results(token, sessionId, quizId));
}

export async function quizExportAction(sessionId: string, quizId: string) {
  return call("staff", [sessionId, quizId], (token) => teacherQuizzesApi.exportData(token, sessionId, quizId));
}

// ---- Student ------------------------------------------------------------------------------

export async function playQuizAction(sessionId: string, quizId: string): Promise<ActionResult<{ data: StudentQuiz }>> {
  return call("student", [sessionId, quizId], (token) => studentQuizzesApi.play(token, sessionId, quizId));
}

export async function startQuizAction(sessionId: string, quizId: string, entry: "board" | "qr" | "link", client: Record<string, unknown>) {
  return call("student", [sessionId, quizId], (token) => studentQuizzesApi.start(token, sessionId, quizId, { entry, client }));
}

export async function answerQuizAction(
  sessionId: string,
  quizId: string,
  answer: { question_id: number; choice: string; time_ms: number; visits: number; changes: QuizChoiceChange[] },
) {
  return call("student", [sessionId, quizId], (token) => studentQuizzesApi.answer(token, sessionId, quizId, answer));
}

export async function submitQuizAction(sessionId: string, quizId: string) {
  return call("student", [sessionId, quizId], (token) => studentQuizzesApi.submit(token, sessionId, quizId));
}
