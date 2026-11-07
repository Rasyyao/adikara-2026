"use server";

import { ApiError } from "@/lib/api/errors";
import { insightsApi } from "@/lib/api/endpoints";
import type { ClassReport } from "@/lib/api/types";
import { requireActionToken } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";
import type { ActionResult } from "./sessions";

// AI feedback on a class. Every action re-checks who calls it: Server Actions are public HTTP endpoints.

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network_error":
        return "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.";
      case "class_not_found":
        return "Kelas tidak ditemukan.";
      case "no_results":
        return "Belum ada kuis yang dikumpulkan di kelas ini, jadi belum ada yang bisa dianalisis.";
      case "unauthorized":
      case "forbidden":
        return "Sesi masuk telah berakhir. Muat ulang halaman.";
    }
  }
  return "Terjadi kesalahan di server. Coba lagi sebentar lagi.";
}

async function call<T>(classId: string, run: (token: string) => Promise<T>): Promise<ActionResult<{ data: T }>> {
  if (!isUuid(classId)) return { ok: false, message: "Kelas tidak ditemukan." };
  try {
    const token = await requireActionToken("staff");
    return { ok: true, data: await run(token) };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/** Asks the AI to analyse the class's results; the report comes back pending. */
export async function requestClassFeedbackAction(classId: string) {
  return call<ClassReport>(classId, async (token) => (await insightsApi.requestFeedback(token, classId)).report);
}

export async function getClassFeedbackAction(classId: string) {
  return call<ClassReport | null>(classId, async (token) => (await insightsApi.feedback(token, classId)).report);
}
