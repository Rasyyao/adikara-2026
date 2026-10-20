import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { parseJoinSession } from "../../src/http/validators/student/session.js";

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

describe("parseJoinSession", () => {
  it("accepts 6 digits and trims spaces", () => {
    expect(parseJoinSession({ code: " 004217 " })).toEqual({ code: "004217" });
  });
  it.each(["12345", "1234567", "12345a", "", 123456, null, undefined, "12 345"])("rejects code %j", (value) => {
    expect(fieldsOf(() => parseJoinSession({ code: value }))).toHaveProperty("code");
  });
});
