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
        joinRateLimitMax: 10,
        joinRateLimitWindowMinutes: 1,
        sessionTtlMinutes: 240,
        sessionPresenceGraceSeconds: 10,
        corsOrigins: [],
      });
    });

    it("reads the live session settings", () => {
      const config = loadConfig({ ...valid, SESSION_TTL_MINUTES: "90", SESSION_PRESENCE_GRACE_SECONDS: "0", JOIN_RATE_LIMIT_MAX: "5" });
      expect(config).toMatchObject({ sessionTtlMinutes: 90, sessionPresenceGraceSeconds: 0, joinRateLimitMax: 5 });
    });

    it.each([
      ["SESSION_TTL_MINUTES", "1"],
      ["SESSION_TTL_MINUTES", "abc"],
      ["SESSION_PRESENCE_GRACE_SECONDS", "-1"],
      ["JOIN_RATE_LIMIT_MAX", "0"],
    ])("rejects %s=%s", (key, value) => {
      expect(() => loadConfig({ ...valid, [key]: value })).toThrow(new RegExp(key));
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

  describe("docs flag", () => {
    it("enables the docs outside production by default", () => {
      expect(loadConfig({ ...valid, NODE_ENV: "development" }).docsEnabled).toBe(true);
    });

    it("disables the docs in production by default", () => {
      expect(loadConfig({ ...valid, NODE_ENV: "production" }).docsEnabled).toBe(false);
    });

    it("lets DOCS_ENABLED override the default both ways", () => {
      expect(loadConfig({ ...valid, NODE_ENV: "production", DOCS_ENABLED: "true" }).docsEnabled).toBe(true);
      expect(loadConfig({ ...valid, NODE_ENV: "development", DOCS_ENABLED: "false" }).docsEnabled).toBe(false);
    });

    it("rejects any other DOCS_ENABLED value", () => {
      expect(() => loadConfig({ ...valid, DOCS_ENABLED: "yes" })).toThrow(/DOCS_ENABLED/);
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

  describe("file uploads", () => {
    const r2 = { R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "bucket" };

    it("storage is off and the limit is 20 MB by default", () => {
      expect(loadConfig(valid)).toMatchObject({ storage: null, uploadMaxBytes: 20 * 1024 * 1024 });
    });

    it("reads the four R2 settings together, and the upload limit in MB", () => {
      expect(loadConfig({ ...valid, ...r2, UPLOAD_MAX_MB: "5" })).toMatchObject({
        storage: { accountId: "acc", accessKeyId: "id", secretAccessKey: "secret", bucket: "bucket" },
        uploadMaxBytes: 5 * 1024 * 1024,
      });
    });

    it.each(Object.keys(r2))("refuses a half-set R2 config (only %s set)", (key) => {
      expect(() => loadConfig({ ...valid, [key]: r2[key as keyof typeof r2] })).toThrow(/must be set together/);
    });

    it("refuses R2 config with one value missing, listing it among the problems", () => {
      const { R2_BUCKET: _omit, ...three } = r2;
      expect(() => loadConfig({ ...valid, ...three })).toThrow(/R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET/);
    });

    it.each(["0", "101", "abc", "1.5"])("rejects UPLOAD_MAX_MB=%s", (value) => {
      expect(() => loadConfig({ ...valid, UPLOAD_MAX_MB: value })).toThrow(/UPLOAD_MAX_MB/);
    });

    it("never prints the secret key in an error", () => {
      try {
        loadConfig({ ...valid, R2_SECRET_ACCESS_KEY: "super-secret-value" });
      } catch (err) {
        expect(String(err)).not.toContain("super-secret-value");
        return;
      }
      throw new Error("expected a config error");
    });
  });
});
