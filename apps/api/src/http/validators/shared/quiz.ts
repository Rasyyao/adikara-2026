import { asRecord, validationError, type Fields } from "./common.js";
import type { AnswerInput, NewQuizInput, StartInput } from "../../../services/shared/quiz.service.js";
import type { QuizQuestion } from "../../../types/shared/quiz.types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["pretest", "posttest", "quiz"];
const MAX_QUESTIONS = 50;
const MAX_TEXT = 2000;
/** A question left open for an hour is a tab left open, not thinking time. */
const MAX_TIME_MS = 60 * 60 * 1000;

const text = (v: unknown, max = MAX_TEXT) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** A test to put on the board: the questions are frozen as sent, numbered 1, 2, 3 … */
export function parseNewQuiz(body: unknown): NewQuizInput {
  const record = asRecord(body);
  const fields: Fields = {};
  const title = text(record.title, 200);
  if (!title) fields.title = "is required (at most 200 characters)";
  const kind = typeof record.kind === "string" && KINDS.includes(record.kind) ? record.kind : null;
  if (!kind) fields.kind = `must be one of ${KINDS.join(", ")}`;
  const raw = Array.isArray(record.questions) ? record.questions : null;
  if (!raw || raw.length === 0 || raw.length > MAX_QUESTIONS) fields.questions = `must be a list of 1-${MAX_QUESTIONS} questions`;
  const questions: QuizQuestion[] = [];
  (raw ?? []).forEach((item, i) => {
    const q = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const question = text(q.question);
    const options = Array.isArray(q.options)
      ? q.options.flatMap((o) => {
          const opt = typeof o === "object" && o !== null ? (o as Record<string, unknown>) : {};
          const key = typeof opt.key === "string" && /^[A-Z]$/.test(opt.key) ? opt.key : null;
          const value = text(opt.text, 500);
          return key && value ? [{ key, text: value }] : [];
        })
      : [];
    const keys = options.map((o) => o.key);
    const answer = typeof q.answer === "string" ? q.answer.toUpperCase() : "";
    if (!question || options.length < 2 || options.length > 6 || new Set(keys).size !== keys.length || !keys.includes(answer)) {
      fields[`questions[${i}]`] = "needs a question, 2-6 options with distinct letter keys, and an answer that is one of them";
      return;
    }
    questions.push({
      id: i + 1,
      question,
      options,
      answer,
      explanation: typeof q.explanation === "string" ? q.explanation.slice(0, MAX_TEXT) : "",
      source: typeof q.source === "string" && q.source.trim() ? q.source.slice(0, 500) : null,
    });
  });
  const chat = record.source_chat_id;
  const message = record.source_message_id;
  if (chat !== undefined && chat !== null && !(typeof chat === "string" && UUID.test(chat))) fields.source_chat_id = "must be a UUID";
  if (message !== undefined && message !== null && !(typeof message === "string" && UUID.test(message))) fields.source_message_id = "must be a UUID";
  if (Object.keys(fields).length) throw validationError(fields);
  return { kind: kind!, title: title!, questions, sourceChatId: (chat as string | undefined) ?? null, sourceMessageId: (message as string | undefined) ?? null };
}

/** How the student opened the quiz, and a little about the device, for the analysis. */
export function parseStart(body: unknown): StartInput {
  const record = body === undefined || body === null ? {} : asRecord(body);
  const entry = typeof record.entry === "string" && ["board", "qr", "link"].includes(record.entry) ? record.entry : null;
  let client: Record<string, unknown> | null = null;
  if (typeof record.client === "object" && record.client !== null && !Array.isArray(record.client)) {
    const c = record.client as Record<string, unknown>;
    client = {};
    for (const key of ["user_agent", "platform", "language", "timezone"]) if (typeof c[key] === "string") client[key] = (c[key] as string).slice(0, 300);
    for (const key of ["screen_width", "screen_height"]) if (isInt(c[key], 0, 20000)) client[key] = c[key];
    if (typeof c.touch === "boolean") client.touch = c.touch;
  }
  return { entry, client };
}

/** One pick: the final choice, its history, the time spent on the question and how often it was opened. */
export function parseAnswer(body: unknown): AnswerInput {
  const record = asRecord(body);
  const fields: Fields = {};
  if (!isInt(record.question_id, 1, MAX_QUESTIONS)) fields.question_id = "must be a question number";
  if (typeof record.choice !== "string" || !/^[A-Z]$/.test(record.choice)) fields.choice = "must be one letter";
  const timeMs = isInt(record.time_ms, 0, Number.MAX_SAFE_INTEGER) ? Math.min(record.time_ms, MAX_TIME_MS) : null;
  if (timeMs === null) fields.time_ms = "must be a whole number of milliseconds";
  const visits = record.visits === undefined ? 1 : isInt(record.visits, 1, 1000) ? record.visits : null;
  if (visits === null) fields.visits = "must be 1-1000";
  const rawChanges = record.changes === undefined ? [] : record.changes;
  const changes = Array.isArray(rawChanges) && rawChanges.length <= 50
    ? rawChanges.flatMap((c) => {
        const item = typeof c === "object" && c !== null ? (c as Record<string, unknown>) : {};
        return typeof item.choice === "string" && /^[A-Z]$/.test(item.choice) && isInt(item.at_ms, 0, Number.MAX_SAFE_INTEGER)
          ? [{ choice: item.choice, at_ms: Math.min(item.at_ms, MAX_TIME_MS) }]
          : [];
      })
    : null;
  if (changes === null) fields.changes = "must be a list of at most 50 picks";
  if (Object.keys(fields).length) throw validationError(fields);
  return { questionId: record.question_id as number, choice: record.choice as string, timeMs: timeMs!, visits: visits!, changes: changes! };
}
