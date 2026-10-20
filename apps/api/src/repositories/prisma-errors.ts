const UNIQUE_VIOLATION = "P2002";
const FOREIGN_KEY_VIOLATION = "P2003";
const RECORD_NOT_FOUND = "P2025";

function codeOf(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
}

export const isUniqueViolation = (err: unknown) => codeOf(err) === UNIQUE_VIOLATION;
/** Raised when a row is still referenced by another table (delete) or points at a missing row (insert). */
export const isForeignKeyViolation = (err: unknown) => codeOf(err) === FOREIGN_KEY_VIOLATION;
export const isNotFound = (err: unknown) => codeOf(err) === RECORD_NOT_FOUND;
