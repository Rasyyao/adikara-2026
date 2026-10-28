"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { studentSessionsApi, teacherSessionsApi } from "@/lib/api/endpoints";
import type { Attendance, BoardScene, SessionMaterial } from "@/lib/api/types";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid, validateClassCode, validatePin, cleanText, normalizePin, type FieldErrors } from "@/lib/validation/auth";

// Every action re-checks who is calling. Server Actions are public HTTP endpoints, so the page that
// renders a button is no protection by itself.

export interface FormState {
  fieldErrors?: FieldErrors;
  message?: string;
  /** Set when the class already has a live session, so the teacher can go back to it. */
  existingSessionId?: string;
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network_error":
        return "Tidak bisa terhubung ke server. Periksa koneksi Anda, lalu coba lagi.";
      case "session_ended":
        return "Sesi ini sudah berakhir.";
      case "session_not_found":
        return "Sesi tidak ditemukan, atau sudah berakhir.";
      case "session_already_started":
        return "Sesi sudah dimulai.";
      case "participant_not_found":
        return "Siswa itu tidak ada di sesi ini.";
      case "class_not_found":
        return "Kelas tidak ditemukan.";
      case "material_not_found":
        return "Materi tidak ditemukan. Mungkin sudah dihapus.";
    }
    if (error.status === 429) return "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.";
  }
  return "Terjadi kesalahan di server. Coba lagi sebentar lagi.";
}

// ---- Teacher ------------------------------------------------------------------------------

export async function createSessionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { token } = await requireViewer("staff");

  const classCode = cleanText(formData.get("class_code")).toUpperCase();
  const problem = validateClassCode(classCode);
  if (problem) return { fieldErrors: { classCode: problem } };

  const chatId = cleanText(formData.get("chat_id"));
  if (chatId && !isUuid(chatId)) return { message: "Materi tidak valid." };

  let sessionId: string;
  try {
    sessionId = (await teacherSessionsApi.create(token, classCode, chatId || undefined)).session.id;
  } catch (error) {
    if (error instanceof ApiError && error.code === "session_already_active") {
      const existing = error.details.session_id;
      return {
        message: "Kelas ini masih punya sesi yang berjalan.",
        existingSessionId: isUuid(existing) ? existing : undefined,
      };
    }
    return { message: describe(error) };
  }
  redirect(`/teacher/sessions/${sessionId}`);
}

async function teacherCall<T>(sessionId: string, call: (token: string) => Promise<T>): Promise<ActionResult<{ data: T }>> {
  const { token } = await requireViewer("staff");
  if (!isUuid(sessionId)) return { ok: false, message: "Sesi tidak valid." };
  try {
    return { ok: true, data: await call(token) };
  } catch (error) {
    return { ok: false, message: describe(error) };
  }
}

export async function startSessionAction(sessionId: string): Promise<ActionResult> {
  const result = await teacherCall(sessionId, (token) => teacherSessionsApi.start(token, sessionId));
  return result.ok ? { ok: true } : result;
}

export async function setLockedAction(sessionId: string, locked: boolean): Promise<ActionResult> {
  const result = await teacherCall(sessionId, (token) => teacherSessionsApi.setLocked(token, sessionId, locked === true));
  return result.ok ? { ok: true } : result;
}

/** Assigns the teacher's prepared material to the session (null removes it); returns the material now assigned. */
export async function assignMaterialAction(sessionId: string, chatId: string | null): Promise<ActionResult<{ material: SessionMaterial | null }>> {
  if (chatId !== null && !isUuid(chatId)) return { ok: false, message: "Materi tidak valid." };
  const result = await teacherCall(sessionId, (token) => teacherSessionsApi.assignMaterial(token, sessionId, chatId));
  return result.ok ? { ok: true, material: result.data.material } : result;
}

/** Saves the whiteboard; the latest save wins. Returns when it was stored. */
export async function saveBoardAction(sessionId: string, scene: BoardScene): Promise<ActionResult<{ updatedAt: string }>> {
  const result = await teacherCall(sessionId, (token) => teacherSessionsApi.saveBoard(token, sessionId, scene));
  return result.ok ? { ok: true, updatedAt: result.data.updated_at } : result;
}

export async function endSessionAction(sessionId: string): Promise<ActionResult<{ attendance: Attendance }>> {
  const result = await teacherCall(sessionId, (token) => teacherSessionsApi.end(token, sessionId));
  return result.ok ? { ok: true, attendance: result.data.attendance } : result;
}

export async function kickParticipantAction(sessionId: string, studentId: string): Promise<ActionResult> {
  if (!isUuid(studentId)) return { ok: false, message: "Siswa tidak valid." };
  const result = await teacherCall(sessionId, (token) => teacherSessionsApi.kick(token, sessionId, studentId));
  return result.ok ? { ok: true } : result;
}

// ---- Student ------------------------------------------------------------------------------

export async function joinSessionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { token } = await requireViewer("student");

  const code = normalizePin(formData.get("code"));
  const problem = validatePin(code);
  if (problem) return { fieldErrors: { code: problem } };

  let sessionId: string;
  try {
    sessionId = (await studentSessionsApi.join(token, code)).session.id;
  } catch (error) {
    if (error instanceof ApiError) {
      switch (error.code) {
        case "session_not_found":
          return { message: "PIN tidak ditemukan atau sesi sudah berakhir. Cek lagi PIN di papan guru." };
        case "not_in_class":
          return { message: "Akun Anda bukan anggota kelas ini. Tanyakan pada guru." };
        case "kicked":
          return { message: "Anda dikeluarkan dari sesi ini oleh guru." };
        case "session_locked":
          return { message: "Pintu sesi sedang dikunci guru. Minta guru membukanya, lalu coba lagi." };
      }
    }
    return { message: describe(error) };
  }
  redirect(`/student/sessions/${sessionId}`);
}
