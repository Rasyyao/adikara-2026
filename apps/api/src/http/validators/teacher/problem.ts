import { BLOCK_KINDS, IDENTIFIER, LIMITS, readArrangement, readCodeTask, type BlockKind, type Challenge, type CodeTask, type CodeTest, type Json, type PuzzleBlock, type PuzzleNode } from "../../../lib/block-puzzle.js";
import { asRecord, validationError, type Fields } from "../shared/common.js";

const BLOCK_ID = /^[A-Za-z0-9_-]{1,32}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function plainText(value: unknown, max: number, field: string, fields: Fields, required = false): string {
  if (value === undefined || value === null) {
    if (required) fields[field] = "is required";
    return "";
  }
  if (typeof value !== "string" || value.length > max || CONTROL.test(value) || (required && !value.trim())) {
    fields[field] = `must be ${required ? "1" : "0"}-${max} characters of plain text`;
    return "";
  }
  return value.trim();
}

function parseBlocks(raw: unknown, fields: Fields): PuzzleBlock[] {
  const list = Array.isArray(raw) ? raw : null;
  if (!list || list.length > LIMITS.blocks) fields["challenge.blocks"] = `must be a list of at most ${LIMITS.blocks} blocks`;
  const ids = new Set<string>();
  const blocks: PuzzleBlock[] = [];
  (list ?? []).forEach((item, i) => {
    const b = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const id = typeof b.id === "string" && BLOCK_ID.test(b.id) && !ids.has(b.id) ? b.id : null;
    const kind = BLOCK_KINDS.includes(b.kind as BlockKind) ? (b.kind as BlockKind) : null;
    const text = plainText(b.text, LIMITS.text, `challenge.blocks[${i}].text`, fields, true);
    if (!id) fields[`challenge.blocks[${i}].id`] = "must be a unique id of 1-32 letters, digits, dash or underscore";
    if (!kind) fields[`challenge.blocks[${i}].kind`] = `must be one of ${BLOCK_KINDS.join(", ")}`;
    if (id && kind && text) {
      ids.add(id);
      blocks.push({ id, kind, text });
    }
  });
  return blocks;
}

/** Code is free text (tabs and newlines included); only its size is limited. */
function codeText(value: unknown, field: string, fields: Fields): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > LIMITS.code) {
    fields[field] = `must be at most ${LIMITS.code} characters`;
    return "";
  }
  return value;
}

function parseCode(raw: unknown, fields: Fields): CodeTask | null {
  if (raw === undefined || raw === null) return null;
  const c = typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!c) {
    fields["challenge.code"] = "must be an object or null";
    return null;
  }
  const fn = typeof c.fn === "string" && IDENTIFIER.test(c.fn) ? c.fn : null;
  if (!fn) fields["challenge.code.fn"] = "must be a JavaScript function name";
  const rawParams = Array.isArray(c.params) ? c.params : null;
  const params = (rawParams ?? []).filter((p): p is string => typeof p === "string" && IDENTIFIER.test(p));
  if (!rawParams || params.length !== rawParams.length || params.length > LIMITS.params || new Set(params).size !== params.length) {
    fields["challenge.code.params"] = `must be at most ${LIMITS.params} distinct parameter names`;
  }
  const rawTests = Array.isArray(c.tests) ? c.tests : null;
  if (!rawTests || rawTests.length > LIMITS.tests) fields["challenge.code.tests"] = `must be a list of at most ${LIMITS.tests} tests`;
  const tests = (rawTests ?? []).flatMap((t, i): CodeTest[] => {
    const r = typeof t === "object" && t !== null ? (t as Record<string, unknown>) : {};
    const ok = Array.isArray(r.args) && "expected" in r && JSON.stringify(r.args).length <= LIMITS.testJson && JSON.stringify(r.expected ?? null).length <= LIMITS.testJson;
    if (!ok) {
      fields[`challenge.code.tests[${i}]`] = `must be { args: [...], expected } of at most ${LIMITS.testJson} characters each`;
      return [];
    }
    if (Array.isArray(r.args) && r.args.length !== params.length) fields[`challenge.code.tests[${i}].args`] = `must give ${params.length} argument(s)`;
    return [{ args: r.args as Json[], expected: (r.expected ?? null) as Json }];
  });
  // JSON keeps only JSON values; anything else (functions, undefined) is dropped by the round trip
  const task = readCodeTask({ fn, params, tests, starter: codeText(c.starter, "challenge.code.starter", fields), reference: codeText(c.reference, "challenge.code.reference", fields) });
  if (task && task.tests.length !== tests.length) fields["challenge.code.tests"] = "must hold JSON values only";
  return task;
}

function parseChallenge(raw: unknown, fields: Fields): Challenge {
  const s = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!s) fields.challenge = "is required";
  const c = s ?? {};
  const prompt = plainText(c.prompt, LIMITS.prompt, "challenge.prompt", fields);
  const hint = plainText(c.hint, LIMITS.prompt, "challenge.hint", fields);
  if (typeof c.ordered !== "boolean") fields["challenge.ordered"] = "must be true or false";
  const blocks = parseBlocks(c.blocks ?? [], fields);
  let solution: PuzzleNode[] = [];
  const read = readArrangement(c.solution ?? [], blocks);
  if ("error" in read) fields["challenge.solution"] = read.error;
  else solution = read.nodes;
  return { prompt, hint, ordered: c.ordered === true, blocks, solution, code: parseCode(c.code, fields) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `material_id`: a UUID, null to detach, or left out (undefined). */
function materialId(value: unknown, fields: Fields, field = "material_id"): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value === "string" && UUID.test(value)) return value.toLowerCase();
  fields[field] = "must be a UUID or null";
  return undefined;
}

/** A new draft only needs a title; the challenge starts empty. */
export function parseNewProblem(body: unknown): { title: string; story: string; chatId: string | null } {
  const record = asRecord(body);
  const fields: Fields = {};
  const title = plainText(record.title, LIMITS.title, "title", fields, true);
  const story = plainText(record.story, LIMITS.story, "story", fields);
  const chatId = materialId(record.material_id, fields);
  if (Object.keys(fields).length) throw validationError(fields);
  return { title, story, chatId: chatId ?? null };
}

/** What the AI should make: from which material, how many (1-3), and optionally which part to focus on. */
export function parseGenerate(body: unknown, max: number): { chatId: string; focus: string | null; count: number } {
  const record = asRecord(body);
  const fields: Fields = {};
  const chatId = materialId(record.material_id, fields);
  if (!chatId) fields.material_id ??= "is required";
  const focus = parseFocus(record.focus, fields);
  const count = record.count ?? 1;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > max) fields.count = `must be 1-${max}`;
  if (Object.keys(fields).length) throw validationError(fields);
  return { chatId: chatId!, focus: focus ?? null, count: count as number };
}

/** Optional focus for the AI: a topic or concept in the material. Undefined when left out. */
function parseFocus(value: unknown, fields: Fields): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = plainText(value, 300, "focus", fields);
  return text || null;
}

export function parseRegenerate(body: unknown): { focus: string | null | undefined } {
  const record = body === undefined || body === null ? {} : asRecord(body);
  const fields: Fields = {};
  const focus = parseFocus(record.focus, fields);
  if (Object.keys(fields).length) throw validationError(fields);
  return { focus };
}

export function parseMaterialQuery(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === "none") return null;
  const fields: Fields = {};
  const id = materialId(value, fields, "material");
  if (Object.keys(fields).length || !id) throw validationError({ material: "must be a material UUID or none" });
  return id;
}

/** The whole draft as the editor holds it. A draft may be unfinished; only its shape is checked here. */
export function parseProblemUpdate(body: unknown): { title: string; story: string; challenge: Challenge; chatId?: string | null } {
  const record = asRecord(body);
  const fields: Fields = {};
  const chatId = materialId(record.material_id, fields);
  const title = plainText(record.title, LIMITS.title, "title", fields, true);
  const story = plainText(record.story, LIMITS.story, "story", fields);
  const challenge = parseChallenge(record.challenge, fields);
  if (Object.keys(fields).length) throw validationError(fields);
  return { title, story, challenge, ...(chatId !== undefined ? { chatId } : {}) };
}

export function parseProblemStatus(body: unknown): "draft" | "ready" {
  const status = asRecord(body).status;
  if (status !== "draft" && status !== "ready") throw validationError({ status: "must be draft or ready" });
  return status;
}

/** A block arrangement to grade; the blocks are checked against the problem in the service. */
export function parseCheck(body: unknown): { answer: unknown } {
  const record = asRecord(body);
  if (!Array.isArray(record.answer)) throw validationError({ answer: "must be a list of { block, children? }" });
  return { answer: record.answer };
}
