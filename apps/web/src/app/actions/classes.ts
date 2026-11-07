"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api/errors";
import { classesApi } from "@/lib/api/endpoints";
import { requireActionToken } from "@/lib/auth/dal";
import { cleanText, isUuid } from "@/lib/validation/auth";

// Classes and their students. Every action re-checks who calls it: Server Actions are public HTTP endpoints.

export type ManageResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const FIELD_MESSAGES: Record<string, string> = {
  name: "Nama wajib diisi (maksimal 100 karakter).",
  class_code: "Kode kelas 3-32 karakter: huruf, angka, strip, atau garis bawah.",
  username: "Nama pengguna 3-32 karakter: huruf, angka, titik, strip, atau garis bawah.",
  password: "Kata sandi minimal 8 karakter, dengan huruf dan angka.",
  class_id: "Kelas tidak valid.",
};

function failure(error: unknown): { ok: false; message: string; fieldErrors?: Record<string, string> } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network_error":
        return { ok: false, message: "Tidak bisa terhubung ke server. Periksa koneksi Anda, lalu coba lagi." };
      case "validation_error": {
        const fieldErrors = Object.fromEntries(Object.keys(error.fields).map((key) => [key, FIELD_MESSAGES[key] ?? "Isian ini belum sesuai."]));
        return { ok: false, message: "Ada isian yang belum sesuai.", fieldErrors };
      }
      case "username_taken":
        return { ok: false, message: "Nama pengguna itu sudah dipakai siswa lain.", fieldErrors: { username: "Nama pengguna itu sudah dipakai siswa lain." } };
      case "class_code_taken":
        return { ok: false, message: "Kode kelas itu sudah dipakai.", fieldErrors: { class_code: "Kode kelas itu sudah dipakai." } };
      case "class_not_found":
        return { ok: false, message: "Kelas tidak ditemukan. Mungkin sudah dihapus." };
      case "student_not_found":
        return { ok: false, message: "Siswa tidak ditemukan di kelas ini. Muat ulang halaman." };
      case "class_archived":
        return { ok: false, message: "Kelas ini sudah diarsipkan." };
      case "class_has_live_session":
        return { ok: false, message: "Kelas ini sedang punya sesi langsung. Akhiri sesinya dulu." };
      case "class_in_use":
        return { ok: false, message: "Kelas masih punya siswa atau riwayat sesi, jadi tidak bisa dihapus. Pindahkan siswanya, atau arsipkan kelas ini." };
      case "student_in_live_session":
        return { ok: false, message: "Siswa itu sedang berada di sesi langsung. Coba lagi setelah sesi berakhir." };
      case "student_in_use":
        return { ok: false, message: "Siswa ini sudah punya riwayat belajar, jadi tidak bisa dihapus. Pindahkan ke kelas lain bila perlu." };
      case "unauthorized":
      case "forbidden":
        return { ok: false, message: "Sesi masuk telah berakhir. Muat ulang halaman." };
    }
    if (error.status === 429) return { ok: false, message: "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi." };
  }
  return { ok: false, message: "Terjadi kesalahan di server. Coba lagi sebentar lagi." };
}

/** Class lists feed the dashboard, the new-session dialog and the students page, so all of them are refreshed. */
function refresh() {
  revalidatePath("/teacher", "layout");
}

async function run(ids: string[], work: (token: string) => Promise<unknown>): Promise<ManageResult> {
  if (!ids.every(isUuid)) return { ok: false, message: "Data tidak valid. Muat ulang halaman." };
  try {
    await work(await requireActionToken("staff"));
    refresh();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createClassAction(name: string, classCode: string): Promise<ManageResult> {
  const code = cleanText(classCode).toUpperCase();
  return run([], (token) => classesApi.create(token, { name: cleanText(name), ...(code ? { class_code: code } : {}) }));
}

export async function renameClassAction(classId: string, name: string): Promise<ManageResult> {
  return run([classId], (token) => classesApi.update(token, classId, { name: cleanText(name) }));
}

export async function archiveClassAction(classId: string, archived: boolean): Promise<ManageResult> {
  return run([classId], (token) => classesApi.update(token, classId, { archived }));
}

export async function deleteClassAction(classId: string): Promise<ManageResult> {
  return run([classId], (token) => classesApi.remove(token, classId));
}

export interface StudentFields {
  name: string;
  username: string;
  password: string;
}

export async function addStudentAction(classId: string, fields: StudentFields): Promise<ManageResult> {
  return run([classId], (token) =>
    classesApi.addStudent(token, classId, { name: cleanText(fields.name), username: cleanText(fields.username).toLowerCase(), password: fields.password }),
  );
}

/** Empty `password` keeps the current one; `moveToClassId` moves the student to another of the teacher's classes. */
export async function updateStudentAction(
  classId: string,
  studentId: string,
  fields: Partial<StudentFields> & { moveToClassId?: string },
): Promise<ManageResult> {
  const body: { name?: string; username?: string; password?: string; class_id?: string } = {};
  if (fields.name !== undefined) body.name = cleanText(fields.name);
  if (fields.username !== undefined) body.username = cleanText(fields.username).toLowerCase();
  if (fields.password) body.password = fields.password;
  if (fields.moveToClassId && fields.moveToClassId !== classId) body.class_id = fields.moveToClassId;
  if (Object.keys(body).length === 0) return { ok: true };
  return run([classId, studentId, ...(body.class_id ? [body.class_id] : [])], (token) => classesApi.updateStudent(token, classId, studentId, body));
}

export async function removeStudentAction(classId: string, studentId: string): Promise<ManageResult> {
  return run([classId, studentId], (token) => classesApi.removeStudent(token, classId, studentId));
}
