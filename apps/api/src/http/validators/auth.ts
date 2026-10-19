import { AppError } from "../errors.js";

const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;

type Fields = Record<string, string>;

function validationError(fields: Fields): AppError {
  return new AppError(400, "validation_error", "Request validation failed", { fields });
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw validationError({ body: "must be a JSON object" });
  }
  return body as Record<string, unknown>;
}

function checkLoginPassword(value: unknown, fields: Fields): string {
  if (typeof value !== "string" || value.length === 0) {
    fields.password = "is required";
    return "";
  }
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    fields.password = `must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  return value;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export function parseTeacherLogin(body: unknown): LoginInput {
  const record = asRecord(body);
  const fields: Fields = {};
  const email = parseEmail(record.email);
  if (!email) fields.email = "must be a valid email address";
  const password = checkLoginPassword(record.password, fields);
  if (Object.keys(fields).length > 0) throw validationError(fields);
  return { identifier: email as string, password };
}

export function parseStudentLogin(body: unknown): LoginInput {
  const record = asRecord(body);
  const fields: Fields = {};
  const username = typeof record.username === "string" ? record.username.trim().toLowerCase() : "";
  if (!USERNAME_PATTERN.test(username)) {
    fields.username = "must be 3-32 characters: letters, digits, dot, dash or underscore";
  }
  const password = checkLoginPassword(record.password, fields);
  if (Object.keys(fields).length > 0) throw validationError(fields);
  return { identifier: username, password };
}

/** Policy for creating or changing a password (login only checks length). Returns an error message or null. */
export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== "string") return "must be a string";
  if (password.length < 8) return "must be at least 8 characters";
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return `must be at most ${MAX_PASSWORD_BYTES} bytes`;
  if (!/[A-Za-z]/.test(password)) return "must contain a letter";
  if (!/\d/.test(password)) return "must contain a digit";
  return null;
}
