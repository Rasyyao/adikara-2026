import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { createTokenService } from "../../src/lib/token.js";
import { TEST_SECRET } from "../helpers/config.js";

const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 60 });
const context = { userId: "u-1", role: "TEACHER", kind: "teacher" } as const;

describe("token service", () => {
  describe("success cases", () => {
    it("round-trips a signed token", () => {
      expect(tokens.verify(tokens.sign(context))).toEqual(context);
    });

    it("signs HS256 with an expiry equal to the ttl", () => {
      const decoded = jwt.decode(tokens.sign(context), { complete: true }) as jwt.Jwt;
      const payload = decoded.payload as jwt.JwtPayload;
      expect(decoded.header.alg).toBe("HS256");
      expect(payload.exp! - payload.iat!).toBe(60);
    });
  });

  describe("failure cases", () => {
    it("rejects an expired token", () => {
      const expired = createTokenService({ secret: TEST_SECRET, ttlSeconds: -10 }).sign(context);
      expect(() => tokens.verify(expired)).toThrow(/Invalid or expired token/);
    });

    it("rejects a token signed with another secret", () => {
      const other = createTokenService({ secret: "y".repeat(40), ttlSeconds: 60 }).sign(context);
      expect(() => tokens.verify(other)).toThrow(/Invalid or expired token/);
    });

    it("rejects an unsigned (alg none) token", () => {
      const forged = jwt.sign({ role: "ADMIN", kind: "teacher" }, "", {
        algorithm: "none",
        subject: "u-1",
        issuer: "adikara-api",
        audience: "adikara-web",
      });
      expect(() => tokens.verify(forged)).toThrow(/Invalid or expired token/);
    });

    it("rejects a token with the wrong issuer", () => {
      const bad = jwt.sign({ role: "TEACHER", kind: "teacher" }, TEST_SECRET, {
        subject: "u-1",
        issuer: "someone-else",
        audience: "adikara-web",
      });
      expect(() => tokens.verify(bad)).toThrow(/Invalid or expired token/);
    });

    it("rejects a tampered payload", () => {
      const [header, , signature] = tokens.sign(context).split(".");
      const payload = Buffer.from(JSON.stringify({ sub: "u-1", role: "ADMIN", kind: "teacher" })).toString("base64url");
      expect(() => tokens.verify(`${header}.${payload}.${signature}`)).toThrow(/Invalid or expired token/);
    });

    it("rejects a student token claiming an admin role", () => {
      const bad = jwt.sign({ role: "ADMIN", kind: "student" }, TEST_SECRET, {
        subject: "u-1",
        issuer: "adikara-api",
        audience: "adikara-web",
      });
      expect(() => tokens.verify(bad)).toThrow(/Invalid or expired token/);
    });

    it("rejects a token without a subject", () => {
      const bad = jwt.sign({ role: "TEACHER", kind: "teacher" }, TEST_SECRET, {
        issuer: "adikara-api",
        audience: "adikara-web",
      });
      expect(() => tokens.verify(bad)).toThrow(/Invalid or expired token/);
    });

    it.each(["", "garbage", "a.b.c"])("rejects malformed token %j", (value) => {
      expect(() => tokens.verify(value)).toThrow(/Invalid or expired token/);
    });
  });
});
