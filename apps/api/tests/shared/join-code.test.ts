import { describe, expect, it, vi } from "vitest";
import { JOIN_CODE_PATTERN, generateJoinCode } from "../../src/lib/join-code.js";

describe("generateJoinCode", () => {
  describe("success", () => {
    it("always returns exactly 6 digits", () => {
      for (let i = 0; i < 500; i += 1) expect(generateJoinCode()).toMatch(JOIN_CODE_PATTERN);
    });

    it("keeps leading zeros", async () => {
      vi.resetModules();
      vi.doMock("node:crypto", () => ({ randomInt: () => 42 }));
      try {
        const { generateJoinCode: mocked } = await import("../../src/lib/join-code.js");
        expect(mocked()).toBe("000042");
      } finally {
        vi.doUnmock("node:crypto");
        vi.resetModules();
      }
    });

    it("is not constant (codes vary)", () => {
      const codes = new Set(Array.from({ length: 50 }, generateJoinCode));
      expect(codes.size).toBeGreaterThan(40);
    });
  });

  describe("pattern", () => {
    it.each(["000000", "482913", "999999"])("accepts %s", (code) => expect(JOIN_CODE_PATTERN.test(code)).toBe(true));
    it.each(["12345", "1234567", "12a456", "", " 12345", "١٢٣٤٥٦"])("rejects %j", (code) =>
      expect(JOIN_CODE_PATTERN.test(code)).toBe(false),
    );
  });
});
