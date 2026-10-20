import { asRecord, checkName, parseEmail, throwIfInvalid, validatePasswordStrength, validationError, type Fields } from "../shared/common.js";

export function parseCreateTeacher(body: unknown): { email: string; name: string; password: string } {
  const record = asRecord(body);
  const fields: Fields = {};
  const email = parseEmail(record.email);
  if (!email) fields.email = "must be a valid email address";
  const name = checkName(record.name, "name", fields);
  const weakness = validatePasswordStrength(record.password);
  if (weakness) fields.password = weakness;
  throwIfInvalid(fields);
  return { email: email as string, name, password: record.password as string };
}

/** At least one of email, name, password. */
export function parseUpdateTeacher(body: unknown): { email?: string; name?: string; password?: string } {
  const record = asRecord(body);
  const fields: Fields = {};
  const patch: { email?: string; name?: string; password?: string } = {};

  if (record.email !== undefined) {
    const email = parseEmail(record.email);
    if (email) patch.email = email;
    else fields.email = "must be a valid email address";
  }
  if (record.name !== undefined) patch.name = checkName(record.name, "name", fields);
  if (record.password !== undefined) {
    const weakness = validatePasswordStrength(record.password);
    if (weakness) fields.password = weakness;
    else patch.password = record.password as string;
  }
  throwIfInvalid(fields);
  if (Object.keys(patch).length === 0) throw validationError({ body: "send at least one of email, name, password" });
  return patch;
}
