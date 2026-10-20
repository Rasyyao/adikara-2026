import {
  USERNAME_HELP,
  USERNAME_PATTERN,
  asRecord,
  checkName,
  parseUuidParam,
  throwIfInvalid,
  validatePasswordStrength,
  validationError,
  type Fields,
} from "../shared/common.js";

function parseUsername(value: unknown, fields: Fields): string {
  const username = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!USERNAME_PATTERN.test(username)) fields.username = USERNAME_HELP;
  return username;
}

function parseClassId(value: unknown, fields: Fields): string {
  try {
    return parseUuidParam(value, "class_id");
  } catch {
    fields.class_id = "must be a UUID";
    return "";
  }
}

export function parseCreateStudent(body: unknown): { username: string; name: string; password: string; classId: string } {
  const record = asRecord(body);
  const fields: Fields = {};
  const username = parseUsername(record.username, fields);
  const name = checkName(record.name, "name", fields);
  const weakness = validatePasswordStrength(record.password);
  if (weakness) fields.password = weakness;
  const classId = parseClassId(record.class_id, fields);
  throwIfInvalid(fields);
  return { username, name, password: record.password as string, classId };
}

/** At least one of username, name, password, class_id. `class_id` is how a student is moved to another class. */
export function parseUpdateStudent(body: unknown): { username?: string; name?: string; password?: string; classId?: string } {
  const record = asRecord(body);
  const fields: Fields = {};
  const patch: { username?: string; name?: string; password?: string; classId?: string } = {};

  if (record.username !== undefined) patch.username = parseUsername(record.username, fields);
  if (record.name !== undefined) patch.name = checkName(record.name, "name", fields);
  if (record.password !== undefined) {
    const weakness = validatePasswordStrength(record.password);
    if (weakness) fields.password = weakness;
    else patch.password = record.password as string;
  }
  if (record.class_id !== undefined) patch.classId = parseClassId(record.class_id, fields);
  throwIfInvalid(fields);
  if (Object.keys(patch).length === 0) throw validationError({ body: "send at least one of username, name, password, class_id" });
  return patch;
}
