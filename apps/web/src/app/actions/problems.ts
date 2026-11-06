"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api/errors";
import { problemsApi } from "@/lib/api/endpoints";
import type { Challenge, Problem, PuzzleGrade, PuzzleNode } from "@/lib/api/types";
import { requireActionToken } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";
import type { ActionResult } from "./sessions";

// Problem-solving drafts. Every action re-checks who calls it: Server Actions are public HTTP endpoints.

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network_error":
        return "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.";
      case "problem_not_found":
        return "Soal tidak ditemukan. Mungkin sudah dihapus.";
      case "problem_incomplete":
        return "Soal belum lengkap. Selesaikan daftar yang belum lengkap dulu.";
      case "problem_generating":
        return "AI masih menyusun soal ini. Tunggu sampai selesai.";
      case "material_not_found":
        return "Materi tidak ditemukan. Mungkin sudah dihapus.";
      case "material_not_ready": {
        const pending = Number(error.details.pending_files ?? 0);
        return pending > 0
          ? "Berkas materi ini masih dibaca AI. Tunggu sebentar, lalu coba lagi."
          : "Materi ini belum punya berkas yang berhasil dibaca. Unggah berkas materi dulu di halaman Materi.";
      }
      case "problem_without_material":
        return "Pilih materi untuk soal ini dulu, baru AI bisa membuatnya.";
      case "validation_error":
        if (error.fields.title) return "Judul soal wajib diisi (maksimal 120 karakter).";
        if (Object.keys(error.fields).some((f) => f.startsWith("challenge.code"))) return "Tugas JavaScript belum sesuai. Periksa nama fungsi, parameter, dan kasus uji.";
        return "Ada isian yang belum sesuai. Periksa teks blok dan susunan jawaban.";
      case "unauthorized":
      case "forbidden":
        return "Sesi masuk telah berakhir. Muat ulang halaman.";
    }
  }
  return "Terjadi kesalahan di server. Coba lagi sebentar lagi.";
}

async function call<T>(ids: string[], run: (token: string) => Promise<T>): Promise<ActionResult<{ data: T }>> {
  if (!ids.every(isUuid)) return { ok: false, message: "Soal tidak valid." };
  try {
    const token = await requireActionToken("staff");
    return { ok: true, data: await run(token) };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

/** A new draft; with `challenge` (a starter example) it is saved with it straight away. */
export async function createProblemAction(title: string, story: string, challenge?: Challenge, materialId: string | null = null): Promise<ActionResult<{ data: Problem }>> {
  const result = await call(materialId ? [materialId] : [], async (token) => {
    const { problem } = await problemsApi.create(token, title.trim(), story.trim(), materialId);
    return challenge ? (await problemsApi.save(token, problem.id, { title: problem.title, story: problem.story, challenge })).problem : problem;
  });
  if (result.ok) revalidatePath("/teacher/problems");
  return result;
}

export async function saveProblemAction(id: string, body: { title: string; story: string; challenge: Challenge; material_id?: string | null }) {
  return call([id, ...(body.material_id ? [body.material_id] : [])], async (token) => (await problemsApi.save(token, id, body)).problem);
}

/** Asks the AI for 1-3 drafts from one material; they come back pending. */
export async function generateProblemsAction(materialId: string, focus: string, count: number) {
  const result = await call([materialId], async (token) => (await problemsApi.generate(token, materialId, focus.trim().slice(0, 300) || null, count)).items);
  if (result.ok) revalidatePath("/teacher/problems");
  return result;
}

/** Makes an AI draft again; `focus` undefined keeps the previous one. */
export async function regenerateProblemAction(id: string, focus?: string) {
  const result = await call([id], async (token) => (await problemsApi.regenerate(token, id, focus === undefined ? undefined : focus.trim().slice(0, 300) || null)).problem);
  if (result.ok) revalidatePath("/teacher/problems");
  return result;
}

/** The current state of a draft, to follow an AI draft while it is written. */
export async function getProblemAction(id: string) {
  return call([id], async (token) => (await problemsApi.get(token, id)).problem);
}

/** The caller's problems that can be sent to a class: ready and not being written by the AI. */
export async function listReadyProblemsAction() {
  return call([], async (token) => (await problemsApi.list(token)).items.filter((p) => p.status === "ready" && p.generation === null));
}

export async function setProblemStatusAction(id: string, status: Problem["status"]) {
  const result = await call([id], async (token) => (await problemsApi.setStatus(token, id, status)).problem);
  if (result.ok) revalidatePath("/teacher/problems");
  return result;
}

export async function duplicateProblemAction(id: string) {
  const result = await call([id], async (token) => (await problemsApi.duplicate(token, id)).problem);
  if (result.ok) revalidatePath("/teacher/problems");
  return result;
}

export async function deleteProblemAction(id: string) {
  const result = await call([id], (token) => problemsApi.remove(token, id));
  if (result.ok) revalidatePath("/teacher/problems");
  return result;
}

export async function checkProblemAction(id: string, answer: PuzzleNode[]): Promise<ActionResult<{ data: PuzzleGrade }>> {
  return call([id], (token) => problemsApi.check(token, id, answer));
}
