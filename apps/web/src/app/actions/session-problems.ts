"use server";

import { ApiError } from "@/lib/api/errors";
import { studentSessionProblemsApi, teacherSessionProblemsApi } from "@/lib/api/endpoints";
import type { PuzzleNode } from "@/lib/api/types";
import { requireActionToken } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";
import type { ActionResult } from "./sessions";

// Problems sent to a live session. Every action re-checks who calls it: Server Actions are public HTTP endpoints.

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network_error":
        return "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.";
      case "problem_not_ready":
        return "Soal ini belum siap. Buka soalnya, lengkapi, lalu tandai siap.";
      case "problem_not_found":
        return "Soal tidak ditemukan.";
      case "problem_closed":
        return "Guru sudah menutup soal ini.";
      case "session_ended":
        return "Sesi sudah berakhir.";
      case "not_joined":
        return "Masuk ke sesi dulu dengan PIN dari guru.";
      case "kicked":
        return "Anda dikeluarkan dari sesi ini.";
      case "mode_unavailable":
        return "Cara menjawab ini tidak tersedia untuk soal ini.";
      case "validation_error":
        return "Jawaban tidak valid. Muat ulang soal, lalu coba lagi.";
      case "unauthorized":
      case "forbidden":
        return "Sesi masuk telah berakhir. Muat ulang halaman.";
    }
  }
  return "Terjadi kesalahan di server. Coba lagi sebentar lagi.";
}

async function call<T>(role: "staff" | "student", ids: string[], run: (token: string) => Promise<T>): Promise<ActionResult<{ data: T }>> {
  if (!ids.every(isUuid)) return { ok: false, message: "Soal tidak valid." };
  try {
    const token = await requireActionToken(role);
    return { ok: true, data: await run(token) };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

// ---- Teacher ------------------------------------------------------------------------------

export async function sendProblemAction(sessionId: string, problemId: string) {
  return call("staff", [sessionId, problemId], (token) => teacherSessionProblemsApi.send(token, sessionId, problemId));
}

export async function listSessionProblemsAction(sessionId: string) {
  return call("staff", [sessionId], (token) => teacherSessionProblemsApi.list(token, sessionId));
}

export async function problemResultsAction(sessionId: string, id: string) {
  return call("staff", [sessionId, id], (token) => teacherSessionProblemsApi.results(token, sessionId, id));
}

export async function closeSessionProblemAction(sessionId: string, id: string) {
  return call("staff", [sessionId, id], (token) => teacherSessionProblemsApi.close(token, sessionId, id));
}

// ---- Student ------------------------------------------------------------------------------

export async function openProblemsAction(sessionId: string) {
  return call("student", [sessionId], (token) => studentSessionProblemsApi.open(token, sessionId));
}

export async function playProblemAction(sessionId: string, id: string) {
  return call("student", [sessionId, id], (token) => studentSessionProblemsApi.play(token, sessionId, id));
}

export async function checkSessionBlocksAction(sessionId: string, id: string, answer: PuzzleNode[]) {
  return call("student", [sessionId, id], (token) => studentSessionProblemsApi.check(token, sessionId, id, answer));
}

export async function reportSessionCodeAction(sessionId: string, id: string, body: { code: string; passed: number; total: number }) {
  return call("student", [sessionId, id], (token) => studentSessionProblemsApi.code(token, sessionId, id, { code: body.code.slice(0, 8000), passed: body.passed, total: body.total }));
}
