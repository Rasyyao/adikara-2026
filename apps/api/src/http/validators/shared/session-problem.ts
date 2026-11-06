import { LIMITS } from "../../../lib/block-puzzle.js";
import { asRecord, parseUuidParam, validationError } from "./common.js";

export function parseSendProblem(body: unknown): { problemId: string } {
  return { problemId: parseUuidParam(asRecord(body).problem_id, "problem_id") };
}

export function parseBlockAnswer(body: unknown): { answer: unknown } {
  const answer = asRecord(body).answer;
  if (!Array.isArray(answer)) throw validationError({ answer: "must be a list of { block, children? }" });
  return { answer };
}

/** What the student's browser reported after running their code against the tests. */
export function parseCodeReport(body: unknown): { code: string; passed: number; total: number } {
  const record = asRecord(body);
  const fields: Record<string, string> = {};
  if (typeof record.code !== "string" || record.code.length > LIMITS.code) fields.code = `must be at most ${LIMITS.code} characters`;
  const whole = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= LIMITS.tests;
  if (!whole(record.passed)) fields.passed = `must be 0-${LIMITS.tests}`;
  if (!whole(record.total)) fields.total = `must be 0-${LIMITS.tests}`;
  if (Object.keys(fields).length) throw validationError(fields);
  return { code: record.code as string, passed: record.passed as number, total: record.total as number };
}
