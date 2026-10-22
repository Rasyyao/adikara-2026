import { asRecord, validationError } from "../shared/common.js";

const CLASS_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export function parseCreateSession(body: unknown): { classCode: string } {
  const record = asRecord(body);
  const classCode = typeof record.class_code === "string" ? record.class_code.trim().toUpperCase() : "";
  if (!CLASS_CODE_PATTERN.test(classCode)) {
    throw validationError({ class_code: "must be 3-32 characters: letters, digits, dash or underscore" });
  }
  return { classCode };
}

/** `?status=live` is the only filter so far. It is required, so a later `ended` history can be added without changing meaning. */
export function parseSessionListQuery(query: Record<string, unknown>): { status: "live" } {
  const raw = Array.isArray(query.status) ? query.status[query.status.length - 1] : query.status;
  if (raw !== "live") throw validationError({ status: "must be 'live'" });
  return { status: "live" };
}

export function parseLock(body: unknown): { locked: boolean } {
  const record = asRecord(body);
  if (typeof record.locked !== "boolean") throw validationError({ locked: "must be true or false" });
  return { locked: record.locked };
}
