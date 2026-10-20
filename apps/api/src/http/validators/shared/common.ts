import { AppError } from "../../errors.js";

// Checks every role uses. Each check collects problems into `fields` and throws one 400 with all of them.

export const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
export const USERNAME_HELP = "must be 3-32 characters: letters, digits, dot, dash or underscore";

export type Fields = Record<string, string>;

export function validationError(fields: Fields): AppError {
  return new AppError(400, "validation_error", "Request validation failed", { fields });
}

export function throwIfInvalid(fields: Fields): void {
  if (Object.keys(fields).length > 0) throw validationError(fields);
}

export function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw validationError({ body: "must be a JSON object" });
  }
  return body as Record<string, unknown>;
}

/** A path parameter that must be a UUID. Checked here so the database never sees a malformed id. */
export function parseUuidParam(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw validationError({ [name]: "must be a UUID" });
  return value.toLowerCase();
}

export function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** Login only checks that a password was sent and is not absurdly long. */
export function checkLoginPassword(value: unknown, fields: Fields): string {
  if (typeof value !== "string" || value.length === 0) {
    fields.password = "is required";
    return "";
  }
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    fields.password = `must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  return value;
}

/** Policy for creating or changing a password. Returns an error message or null. */
export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== "string") return "must be a string";
  if (password.length < 8) return "must be at least 8 characters";
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return `must be at most ${MAX_PASSWORD_BYTES} bytes`;
  if (!/[A-Za-z]/.test(password)) return "must contain a letter";
  if (!/\d/.test(password)) return "must contain a digit";
  return null;
}

/** A display name: 1-100 characters after trimming, no control characters. */
export function checkName(value: unknown, field: string, fields: Fields): string {
  const name = typeof value === "string" ? value.trim() : "";
  // eslint-disable-next-line no-control-regex
  if (name.length < 1 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
    fields[field] = "must be 1-100 characters, without control characters";
  }
  return name;
}

export interface PageQuery {
  limit: number;
  offset: number;
  search?: string;
}

function singleValue(value: unknown): unknown {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

/** `?limit=50&offset=0&q=text` for list endpoints. */
export function parsePageQuery(query: Record<string, unknown>): PageQuery {
  const fields: Fields = {};
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = singleValue(query[key]);
    if (raw === undefined || raw === "") return fallback;
    const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < min || value > max) {
      fields[key] = `must be an integer between ${min} and ${max}`;
      return fallback;
    }
    return value;
  };
  const limit = integer("limit", 50, 1, 100);
  const offset = integer("offset", 0, 0, 1_000_000);

  const rawSearch = singleValue(query.q);
  let search: string | undefined;
  if (rawSearch !== undefined && rawSearch !== "") {
    if (typeof rawSearch !== "string" || rawSearch.trim().length > 100) fields.q = "must be text of at most 100 characters";
    else search = rawSearch.trim() || undefined;
  }

  throwIfInvalid(fields);
  return { limit, offset, search };
}

/** An optional `?name=<uuid>` filter. */
export function parseOptionalUuidQuery(query: Record<string, unknown>, name: string): string | undefined {
  const raw = singleValue(query[name]);
  if (raw === undefined || raw === "") return undefined;
  return parseUuidParam(raw, name);
}
