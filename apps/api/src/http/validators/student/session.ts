import { JOIN_CODE_PATTERN } from "../../../lib/join-code.js";
import { asRecord, validationError } from "../shared/common.js";

export function parseJoinSession(body: unknown): { code: string } {
  const record = asRecord(body);
  const code = typeof record.code === "string" ? record.code.trim() : "";
  if (!JOIN_CODE_PATTERN.test(code)) throw validationError({ code: "must be 6 digits" });
  return { code };
}
