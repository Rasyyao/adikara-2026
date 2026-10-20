import { describe, expect, it } from "vitest";
import { parseTeacherLogin } from "../../src/http/validators/teacher/auth.js";

function fieldsOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    return (err as { details: { fields: Record<string, string> } }).details.fields;
  }
  throw new Error("expected validation to throw");
}

describe("parseTeacherLogin", () => {
  describe("success cases", () => {
    it("trims and lowercases the email", () => {
      expect(parseTeacherLogin({ email: "  Guru@Example.COM ", password: "x" })).toEqual({
        identifier: "guru@example.com",
        password: "x",
      });
    });

    it("keeps the password untouched", () => {
      expect(parseTeacherLogin({ email: "a@b.co", password: "  spaced  " }).password).toBe("  spaced  ");
    });
  });

  describe("failure cases", () => {
    it.each([undefined, null, "text", 42, []])("rejects body %j", (body) => {
      expect(fieldsOf(() => parseTeacherLogin(body))).toHaveProperty("body");
    });

    it.each(["", "no-at-sign", "a@b", "a b@c.com", 123, null])("rejects email %j", (email) => {
      expect(fieldsOf(() => parseTeacherLogin({ email, password: "x" }))).toHaveProperty("email");
    });

    it("rejects an over-long email", () => {
      const email = `${"a".repeat(250)}@b.co`;
      expect(fieldsOf(() => parseTeacherLogin({ email, password: "x" }))).toHaveProperty("email");
    });

    it.each([undefined, "", 123, {}])("rejects password %j", (password) => {
      expect(fieldsOf(() => parseTeacherLogin({ email: "a@b.co", password }))).toHaveProperty("password");
    });

    it("rejects a password over 72 bytes", () => {
      expect(fieldsOf(() => parseTeacherLogin({ email: "a@b.co", password: "a".repeat(73) }))).toHaveProperty("password");
    });

    it("reports all invalid fields together", () => {
      expect(Object.keys(fieldsOf(() => parseTeacherLogin({})))).toEqual(["email", "password"]);
    });
  });
});
