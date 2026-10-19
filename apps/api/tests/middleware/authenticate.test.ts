import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authenticate, extractBearerToken, requireAuth } from "../../src/http/middleware/authenticate.js";
import { errorHandler } from "../../src/http/middleware/error-handler.js";
import { createTokenService } from "../../src/lib/token.js";
import { STUDENT, TEACHER, bearer, testTokens } from "../helpers/identities.js";

function buildApp() {
  const app = express();
  app.get("/protected", authenticate(testTokens), (req, res) => {
    res.json(requireAuth(req));
  });
  app.use(errorHandler);
  return app;
}

describe("extractBearerToken", () => {
  it.each([
    ["Bearer abc.def.ghi", "abc.def.ghi"],
    ["bearer abc", "abc"],
    ["BEARER   abc", "abc"],
  ])("reads the token from %j", (header, token) => {
    expect(extractBearerToken(header)).toBe(token);
  });

  it.each([undefined, "", "Bearer", "Bearer ", "Basic dXNlcjpwYXNz", "Token abc", "Bearer a b", "abc"])(
    "returns null for %j",
    (header) => {
      expect(extractBearerToken(header)).toBeNull();
    },
  );
});

describe("authenticate", () => {
  describe("success", () => {
    it("puts the token's identity on req.auth", async () => {
      const res = await request(buildApp()).get("/protected").set("Authorization", bearer(TEACHER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(TEACHER);
    });

    it("works for a student token too", async () => {
      const res = await request(buildApp()).get("/protected").set("Authorization", bearer(STUDENT));
      expect(res.body).toEqual(STUDENT);
    });
  });

  describe("failure: no usable token", () => {
    it("answers 401 unauthenticated without an Authorization header", async () => {
      const res = await request(buildApp()).get("/protected");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("unauthenticated");
    });

    it("tells the client to use Bearer auth (WWW-Authenticate)", async () => {
      const res = await request(buildApp()).get("/protected");
      expect(res.headers["www-authenticate"]).toMatch(/^Bearer/);
    });

    it.each(["Basic dXNlcjpwYXNz", "Bearer", "Token abc"])("answers 401 for the header %j", async (header) => {
      const res = await request(buildApp()).get("/protected").set("Authorization", header);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("unauthenticated");
    });
  });

  describe("failure: bad token", () => {
    it("answers 401 invalid_token for a malformed token", async () => {
      const res = await request(buildApp()).get("/protected").set("Authorization", "Bearer not.a.token");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("invalid_token");
    });

    it("answers 401 for a token signed with another secret", async () => {
      const forged = createTokenService({ secret: "z".repeat(40), ttlSeconds: 60 }).sign(TEACHER);
      const res = await request(buildApp()).get("/protected").set("Authorization", `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it("answers 401 for an expired token", async () => {
      const expired = createTokenService({ secret: "x".repeat(40), ttlSeconds: -5 }).sign(TEACHER);
      const res = await request(buildApp()).get("/protected").set("Authorization", `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });
  });
});

describe("requireAuth", () => {
  it("throws 401 when authenticate did not run", () => {
    expect(() => requireAuth({} as express.Request)).toThrow(/Authentication required/);
  });
});
