import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { parseCreateSession, parseLock } from "../../src/http/validators/teacher/session.js";

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

describe("parseCreateSession", () => {
  it("normalizes the class code to upper case", () => {
    expect(parseCreateSession({ class_code: "  kelas7a " })).toEqual({ classCode: "KELAS7A", chatId: null });
  });
  it.each([undefined, "", "ab", "has space", "x".repeat(33), 7, null, ["KELAS7A"]])("rejects class_code %j", (value) => {
    expect(fieldsOf(() => parseCreateSession({ class_code: value }))).toHaveProperty("class_code");
  });
  it.each([null, "text", [], undefined])("rejects a body that is not an object: %j", (body) => {
    expect(fieldsOf(() => parseCreateSession(body))).toHaveProperty("body");
  });
});


describe("parseLock", () => {
  it.each([true, false])("accepts %s", (locked) => expect(parseLock({ locked })).toEqual({ locked }));
  it.each(["true", 1, 0, null, undefined])("rejects %j", (value) => {
    expect(fieldsOf(() => parseLock({ locked: value }))).toHaveProperty("locked");
  });
});
