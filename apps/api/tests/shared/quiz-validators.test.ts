import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { parseAnswer, parseNewQuiz, parseStart } from "../../src/http/validators/shared/quiz.js";

function fieldsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(400);
    return (err as AppError).details?.fields as Record<string, string>;
  }
  throw new Error("expected a validation error");
}

const question = (overrides: Record<string, unknown> = {}) => ({
  question: "x = 5 lalu x = 7. Isi x?",
  options: [
    { key: "A", text: "5" },
    { key: "B", text: "7" },
  ],
  answer: "B",
  explanation: "Nilai baru menimpa nilai lama.",
  ...overrides,
});
const quiz = (overrides: Record<string, unknown> = {}) => ({ title: "Pre-Test", kind: "pretest", questions: [question()], ...overrides });

describe("parseNewQuiz", () => {
  describe("success", () => {
    it("numbers the questions 1, 2, 3 and keeps answer key, explanation and source", () => {
      const parsed = parseNewQuiz(quiz({ questions: [question(), question({ source: "Modul hal. 3", answer: "a" })] }));
      expect(parsed.questions.map((q) => q.id)).toEqual([1, 2]);
      expect(parsed.questions[0]).toMatchObject({ answer: "B", explanation: "Nilai baru menimpa nilai lama.", source: null });
      expect(parsed.questions[1]).toMatchObject({ answer: "A", source: "Modul hal. 3" }); // the key is read case-insensitively
    });
    it("trims the title and accepts every kind", () => {
      for (const kind of ["pretest", "posttest", "quiz"]) expect(parseNewQuiz(quiz({ kind, title: "  Kuis  " }))).toMatchObject({ kind, title: "Kuis" });
    });
    it("keeps the AI reply it came from", () => {
      const id = "00000000-0000-4000-8000-000000000123";
      expect(parseNewQuiz(quiz({ source_chat_id: id, source_message_id: id }))).toMatchObject({ sourceChatId: id, sourceMessageId: id });
    });
  });

  describe("failure: 400", () => {
    it.each([undefined, "", "   ", "x".repeat(201)])("rejects title %j", (title) => {
      expect(fieldsOf(() => parseNewQuiz(quiz({ title })))).toHaveProperty("title");
    });
    it.each(["exam", "", 1, undefined])("rejects kind %j", (kind) => {
      expect(fieldsOf(() => parseNewQuiz(quiz({ kind })))).toHaveProperty("kind");
    });
    it.each([undefined, [], "soal", Array.from({ length: 51 }, () => question())])("rejects questions %#", (questions) => {
      expect(fieldsOf(() => parseNewQuiz(quiz({ questions })))).toHaveProperty("questions");
    });
    it.each([
      ["no question text", { question: "" }],
      ["one option", { options: [{ key: "A", text: "5" }] }],
      ["seven options", { options: "ABCDEFG".split("").map((key) => ({ key, text: key })) }],
      ["repeated keys", { options: [{ key: "A", text: "5" }, { key: "A", text: "7" }], answer: "A" }],
      ["an answer that is not an option", { answer: "D" }],
      ["a key that is not one letter", { options: [{ key: "AA", text: "5" }, { key: "B", text: "7" }] }],
    ])("rejects a question with %s", (_name, overrides) => {
      expect(fieldsOf(() => parseNewQuiz(quiz({ questions: [question(), question(overrides)] })))).toHaveProperty("questions[1]");
    });
    it.each(["not-a-uuid", 5])("rejects source_message_id %j", (value) => {
      expect(fieldsOf(() => parseNewQuiz(quiz({ source_message_id: value })))).toHaveProperty("source_message_id");
    });
  });
});

describe("parseStart", () => {
  it("keeps the entry and the known device details, and drops anything else", () => {
    const parsed = parseStart({
      entry: "qr",
      client: { user_agent: "Mozilla", platform: "Android", screen_width: 412, screen_height: 915, touch: true, password: "x", screen_depth: 24 },
    });
    expect(parsed).toEqual({ entry: "qr", client: { user_agent: "Mozilla", platform: "Android", screen_width: 412, screen_height: 915, touch: true } });
  });
  it("cuts long strings and ignores impossible sizes", () => {
    const parsed = parseStart({ client: { user_agent: "x".repeat(500), screen_width: -1 } });
    expect((parsed.client?.user_agent as string).length).toBe(300);
    expect(parsed.client).not.toHaveProperty("screen_width");
  });
  it.each([undefined, null, {}, { entry: "email" }])("an empty or unknown body is still a start: %j", (body) => {
    expect(parseStart(body).entry).toBeNull();
  });
});

describe("parseAnswer", () => {
  const answer = (overrides: Record<string, unknown> = {}) => ({ question_id: 1, choice: "B", time_ms: 8200, visits: 2, changes: [{ choice: "A", at_ms: 3000 }, { choice: "B", at_ms: 8200 }], ...overrides });

  describe("success", () => {
    it("reads the pick with its history", () => {
      expect(parseAnswer(answer())).toEqual({ questionId: 1, choice: "B", timeMs: 8200, visits: 2, changes: [{ choice: "A", at_ms: 3000 }, { choice: "B", at_ms: 8200 }] });
    });
    it("defaults to one visit and no history", () => {
      expect(parseAnswer({ question_id: 2, choice: "A", time_ms: 0 })).toMatchObject({ visits: 1, changes: [] });
    });
    it("caps time left open for hours at one hour, so an idle tab does not count as thinking", () => {
      expect(parseAnswer(answer({ time_ms: 10 * 60 * 60 * 1000 })).timeMs).toBe(60 * 60 * 1000);
    });
    it("drops malformed history entries instead of failing the answer", () => {
      expect(parseAnswer(answer({ changes: [{ choice: "z", at_ms: 1 }, { choice: "A", at_ms: -5 }, { choice: "C", at_ms: 10 }] })).changes).toEqual([{ choice: "C", at_ms: 10 }]);
    });
  });

  describe("failure: 400", () => {
    it.each([0, 51, 1.5, "1", undefined])("rejects question_id %j", (question_id) => {
      expect(fieldsOf(() => parseAnswer(answer({ question_id })))).toHaveProperty("question_id");
    });
    it.each(["b", "AB", "", 1, undefined])("rejects choice %j", (choice) => {
      expect(fieldsOf(() => parseAnswer(answer({ choice })))).toHaveProperty("choice");
    });
    it.each([-1, 1.5, "100", undefined])("rejects time_ms %j", (time_ms) => {
      expect(fieldsOf(() => parseAnswer(answer({ time_ms })))).toHaveProperty("time_ms");
    });
    it.each([0, 1001, "2"])("rejects visits %j", (visits) => {
      expect(fieldsOf(() => parseAnswer(answer({ visits })))).toHaveProperty("visits");
    });
    it("rejects a history longer than 50 picks", () => {
      const changes = Array.from({ length: 51 }, (_, i) => ({ choice: "A", at_ms: i }));
      expect(fieldsOf(() => parseAnswer(answer({ changes })))).toHaveProperty("changes");
    });
  });
});
