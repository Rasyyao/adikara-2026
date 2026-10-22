// Shared by the form (instant feedback) and the Server Actions (the check that counts).
// These rules mirror apps/api/src/http/validators, so the API never has to be the first to say "no".
//
// Why this blocks injection: identifiers are checked against a strict whitelist, so characters like
// < > ' " ; never reach the API. Passwords may contain anything (they are only ever hashed), but they
// are never echoed back or rendered. React escapes all output, and the API uses parameterised queries.

export type FieldErrors = Partial<Record<"email" | "username" | "password" | "code" | "classCode", string>>;

const EMAIL_PATTERN = /^[^\s@<>"'`;,()[\]\\]+@[^\s@<>"'`;,()[\]\\]+\.[^\s@<>"'`;,()[\]\\]+$/;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
const PIN_PATTERN = /^\d{6}$/;
const CLASS_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Removes control characters (null bytes, newlines, escape codes) and surrounding spaces. */
export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(CONTROL_CHARS, "").trim() : "";
}

export function normalizeEmail(value: unknown): string {
  return cleanText(value).toLowerCase();
}

export function normalizeUsername(value: unknown): string {
  return cleanText(value).toLowerCase();
}

/** "482 913" or "482-913" pasted from the board becomes "482913". */
export function normalizePin(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 6) : "";
}

export function validateEmail(raw: unknown): string | undefined {
  const email = normalizeEmail(raw);
  if (!email) return "Isi email Anda.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Format email belum benar, contoh: nama@sekolah.sch.id";
  return undefined;
}

export function validateUsername(raw: unknown): string | undefined {
  const username = normalizeUsername(raw);
  if (!username) return "Isi nama pengguna Anda.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Nama pengguna 3-32 karakter: huruf, angka, titik, strip, atau garis bawah.";
  }
  return undefined;
}

/** Login only checks that a password exists and fits; strength rules apply when it is created. */
export function validateLoginPassword(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) return "Isi kata sandi Anda.";
  if (new TextEncoder().encode(raw).length > MAX_PASSWORD_BYTES) return "Kata sandi terlalu panjang (maksimal 72 karakter).";
  return undefined;
}

export function validatePin(raw: unknown): string | undefined {
  const pin = normalizePin(raw);
  if (!pin) return "Isi PIN dari papan guru.";
  if (!PIN_PATTERN.test(pin)) return "PIN terdiri dari 6 angka.";
  return undefined;
}

export function validateClassCode(raw: unknown): string | undefined {
  const code = cleanText(raw).toUpperCase();
  if (!CLASS_CODE_PATTERN.test(code)) return "Pilih kelas terlebih dahulu.";
  return undefined;
}

export type LoginRole = "teacher" | "student";

export function isLoginRole(value: unknown): value is LoginRole {
  return value === "teacher" || value === "student";
}

export function validateLogin(role: LoginRole, identifier: unknown, password: unknown): FieldErrors {
  const errors: FieldErrors = {};
  const identifierError = role === "teacher" ? validateEmail(identifier) : validateUsername(identifier);
  if (identifierError) errors[role === "teacher" ? "email" : "username"] = identifierError;
  const passwordError = validateLoginPassword(password);
  if (passwordError) errors.password = passwordError;
  return errors;
}

/** UUID path parameters (session ids, student ids) are checked before they are put in a URL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
