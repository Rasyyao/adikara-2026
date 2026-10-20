import { asRecord, checkLoginPassword, parseEmail, throwIfInvalid, type Fields } from "../shared/common.js";

export interface LoginInput {
  identifier: string;
  password: string;
}

export function parseTeacherLogin(body: unknown): LoginInput {
  const record = asRecord(body);
  const fields: Fields = {};
  const email = parseEmail(record.email);
  if (!email) fields.email = "must be a valid email address";
  const password = checkLoginPassword(record.password, fields);
  throwIfInvalid(fields);
  return { identifier: email as string, password };
}
