import { asRecord, checkName, parseUuidParam, throwIfInvalid, validationError, type Fields } from "../shared/common.js";

const CLASS_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;
const CLASS_CODE_HELP = "must be 3-32 characters: letters, digits, dash or underscore";

function parseTeacherId(value: unknown, fields: Fields): string {
  try {
    return parseUuidParam(value, "teacher_id");
  } catch {
    fields.teacher_id = "must be a UUID";
    return "";
  }
}

export function parseCreateClass(body: unknown): { name: string; classCode: string; teacherId: string } {
  const record = asRecord(body);
  const fields: Fields = {};
  const name = checkName(record.name, "name", fields);
  const classCode = typeof record.class_code === "string" ? record.class_code.trim().toUpperCase() : "";
  if (!CLASS_CODE_PATTERN.test(classCode)) fields.class_code = CLASS_CODE_HELP;
  const teacherId = parseTeacherId(record.teacher_id, fields);
  throwIfInvalid(fields);
  return { name, classCode, teacherId };
}

/** At least one of name, teacher_id, archived. The class code never changes after creation. */
export function parseUpdateClass(body: unknown): { name?: string; teacherId?: string; archived?: boolean } {
  const record = asRecord(body);
  const fields: Fields = {};
  const patch: { name?: string; teacherId?: string; archived?: boolean } = {};

  if (record.name !== undefined) patch.name = checkName(record.name, "name", fields);
  if (record.teacher_id !== undefined) patch.teacherId = parseTeacherId(record.teacher_id, fields);
  if (record.archived !== undefined) {
    if (typeof record.archived === "boolean") patch.archived = record.archived;
    else fields.archived = "must be true or false";
  }
  if (record.class_code !== undefined) fields.class_code = "cannot be changed";
  throwIfInvalid(fields);
  if (Object.keys(patch).length === 0) throw validationError({ body: "send at least one of name, teacher_id, archived" });
  return patch;
}

/** `?include_archived=true` */
export function parseIncludeArchived(query: Record<string, unknown>): boolean {
  const raw = Array.isArray(query.include_archived) ? query.include_archived.at(-1) : query.include_archived;
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  throw validationError({ include_archived: "must be true or false" });
}
