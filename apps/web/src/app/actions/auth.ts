"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { authApi } from "@/lib/api/endpoints";
import { clearToken, setToken } from "@/lib/auth/cookie";
import {
  isLoginRole,
  normalizeEmail,
  normalizeUsername,
  validateLogin,
  type FieldErrors,
} from "@/lib/validation/auth";

export interface LoginState {
  fieldErrors?: FieldErrors;
  /** A problem with the whole form (wrong credentials, server down). */
  message?: string;
}

const WRONG_CREDENTIALS = {
  teacher: "Email atau kata sandi salah. Periksa lagi, atau pilih \"Siswa\" jika Anda siswa.",
  student: "Nama pengguna atau kata sandi salah. Periksa lagi, atau pilih \"Guru\" jika Anda guru.",
} as const;

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const role = formData.get("role");
  if (!isLoginRole(role)) return { message: "Pilih masuk sebagai guru atau siswa." };

  const rawIdentifier = formData.get(role === "teacher" ? "email" : "username");
  const password = formData.get("password");

  // The same checks as the form, run again here because the browser can be bypassed.
  const fieldErrors = validateLogin(role, rawIdentifier, password);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  let result;
  try {
    result =
      role === "teacher"
        ? await authApi.loginTeacher(normalizeEmail(rawIdentifier), password as string)
        : await authApi.loginStudent(normalizeUsername(rawIdentifier), password as string);
  } catch (error) {
    if (error instanceof ApiError) {
      // One message for "no such account" and "wrong password", so it cannot be used to find accounts.
      if (error.status === 401) return { message: WRONG_CREDENTIALS[role] };
      if (error.status === 429) return { message: "Terlalu banyak percobaan masuk. Tunggu beberapa menit, lalu coba lagi." };
      if (error.status === 400) return { message: "Data yang dikirim belum sesuai. Periksa lagi isian Anda." };
      if (error.code === "network_error") return { message: "Tidak bisa terhubung ke server. Periksa koneksi Anda, lalu coba lagi." };
    }
    return { message: "Terjadi kesalahan di server. Coba lagi sebentar lagi." };
  }

  await setToken(result.access_token, result.expires_in);
  redirect("/home");
}

export async function logoutAction(): Promise<void> {
  await clearToken();
  redirect("/login");
}
