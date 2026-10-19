import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5433/db",
  JWT_SECRET: "x".repeat(32),
};

describe("loadConfig", () => {
  describe("success cases", () => {
    it("applies defaults when optional variables are missing", () => {
      const config = loadConfig(valid);
      expect(config).toMatchObject({
        port: 8080,
        jwtTtlMinutes: 60,
        bcryptCost: 12,
        loginRateLimitMax: 10,
        corsOrigins: [],
      });
    });

    it("parses explicit values and a comma separated origin list", () => {
      const config = loadConfig({
        ...valid,
        PORT: "9000",
        JWT_TTL_MINUTES: "15",
        CORS_ALLOWED_ORIGINS: "http://a.test, http://b.test",
      });
      expect(config.port).toBe(9000);
      expect(config.jwtTtlMinutes).toBe(15);
      expect(config.corsOrigins).toEqual(["http://a.test", "http://b.test"]);
    });
  });

  describe("failure cases", () => {
    it("fails when DATABASE_URL is missing", () => {
      expect(() => loadConfig({ JWT_SECRET: valid.JWT_SECRET })).toThrow(/DATABASE_URL is required/);
    });

    it("fails when JWT_SECRET is missing", () => {
      expect(() => loadConfig({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/JWT_SECRET/);
    });

    it("fails when JWT_SECRET is shorter than 32 characters", () => {
      expect(() => loadConfig({ ...valid, JWT_SECRET: "short" })).toThrow(/at least 32 characters/);
    });

    it("reports every problem at once", () => {
      expect(() => loadConfig({ PORT: "abc" })).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*PORT/);
    });

    it.each([["PORT", "0"], ["PORT", "70000"], ["JWT_TTL_MINUTES", "-5"], ["BCRYPT_COST", "2"], ["BCRYPT_COST", "1.5"]])(
      "rejects %s=%s",
      (key, value) => {
        expect(() => loadConfig({ ...valid, [key]: value })).toThrow(new RegExp(key));
      },
    );

    it("rejects a wildcard CORS origin", () => {
      expect(() => loadConfig({ ...valid, CORS_ALLOWED_ORIGINS: "*" })).toThrow(/not \*/);
    });
  });
});
