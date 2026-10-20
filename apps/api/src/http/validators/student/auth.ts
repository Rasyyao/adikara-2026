import { USERNAME_HELP, USERNAME_PATTERN, asRecord, checkLoginPassword, throwIfInvalid, type Fields } from "../shared/common.js";
import type { LoginInput } from "../teacher/auth.js";

export function parseStudentLogin(body: unknown): LoginInput {
  const record = asRecord(body);
  const fields: Fields = {};
  const username = typeof record.username === "string" ? record.username.trim().toLowerCase() : "";
  if (!USERNAME_PATTERN.test(username)) fields.username = USERNAME_HELP;
  const password = checkLoginPassword(record.password, fields);
  throwIfInvalid(fields);
  return { identifier: username, password };
}
