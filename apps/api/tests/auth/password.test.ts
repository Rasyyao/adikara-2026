import { describe, expect, it } from "vitest";
import { validatePasswordStrength } from "../../src/http/validators/auth.js";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";

describe("password hashing", () => {
  describe("success cases", () => {
    it("produces a bcrypt hash that is not the plain text", async () => {
      const hash = await hashPassword("Secret-123", 4);
      expect(hash).not.toContain("Secret-123");
      expect(hash).toMatch(/^\$2[aby]\$04\$/);
    });

    it("uses a different salt every time", async () => {
      expect(await hashPassword("Secret-123", 4)).not.toBe(await hashPassword("Secret-123", 4));
    });

    it("verifies the correct password", async () => {
      const hash = await hashPassword("Secret-123", 4);
      expect(await verifyPassword("Secret-123", hash)).toBe(true);
    });
  });

  describe("failure cases", () => {
    it("rejects a wrong password", async () => {
      const hash = await hashPassword("Secret-123", 4);
      expect(await verifyPassword("secret-123", hash)).toBe(false);
    });

    it("rejects an empty password", async () => {
      const hash = await hashPassword("Secret-123", 4);
      expect(await verifyPassword("", hash)).toBe(false);
    });

    it("returns false (does not throw) for a malformed hash", async () => {
      expect(await verifyPassword("Secret-123", "not-a-hash")).toBe(false);
    });
  });
});

describe("validatePasswordStrength", () => {
  it("accepts a password with letters and digits", () => {
    expect(validatePasswordStrength("Abcdefg1")).toBeNull();
  });

  it.each([
    ["too short", "Abc1", /at least 8/],
    ["no digit", "Abcdefgh", /digit/],
    ["no letter", "12345678", /letter/],
    ["over 72 bytes", "a1".repeat(40), /at most 72/],
    ["multi-byte over 72 bytes", "é1".repeat(40), /at most 72/],
  ])("rejects %s", (_name, value, message) => {
    expect(validatePasswordStrength(value)).toMatch(message);
  });

  it("rejects non-string values", () => {
    expect(validatePasswordStrength(12345678)).toBe("must be a string");
    expect(validatePasswordStrength(undefined)).toBe("must be a string");
  });
});
