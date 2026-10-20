import { describe, expect, it } from "vitest";
import { parseStudentLogin } from "../../src/http/validators/student/auth.js";

function fieldsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    return (err as { details: { fields: Record<string, string> } }).details.fields;
  }
  throw new Error("expected validation to throw");
}

describe("parseStudentLogin", () => {
  it("trims and lowercases the username", () => {
    expect(parseStudentLogin({ username: " Siswa.Satu ", password: "x" }).identifier).toBe("siswa.satu");
  });

  it.each(["", "ab", "has space", "semi;colon", "a".repeat(33), "emoji😀name", 5, null])(
    "rejects username %j",
    (username) => {
      expect(fieldsOf(() => parseStudentLogin({ username, password: "x" }))).toHaveProperty("username");
    },
  );

  it("rejects a missing password", () => {
    expect(fieldsOf(() => parseStudentLogin({ username: "siswa1" }))).toHaveProperty("password");
  });

  it("rejects a non-object body", () => {
    expect(fieldsOf(() => parseStudentLogin("x"))).toHaveProperty("body");
  });
});
