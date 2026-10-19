import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authenticate } from "../../src/http/middleware/authenticate.js";
import { errorHandler } from "../../src/http/middleware/error-handler.js";
import { requireRole } from "../../src/http/middleware/require-role.js";
import { ADMIN, STUDENT, TEACHER, bearer, testTokens } from "../helpers/identities.js";

function buildApp() {
  const app = express();
  const ok: express.RequestHandler = (_req, res) => {
    res.json({ ok: true });
  };
  app.get("/admin-only", authenticate(testTokens), requireRole("ADMIN"), ok);
  app.get("/staff", authenticate(testTokens), requireRole("ADMIN", "TEACHER"), ok);
  app.get("/without-authenticate", requireRole("ADMIN"), ok);
  app.use(errorHandler);
  return app;
}

describe("requireRole", () => {
  describe("success", () => {
    it("lets an admin into an admin-only route", async () => {
      const res = await request(buildApp()).get("/admin-only").set("Authorization", bearer(ADMIN));
      expect(res.status).toBe(200);
    });

    it.each([
      ["admin", ADMIN],
      ["teacher", TEACHER],
    ])("lets a %s into a route listing both roles", async (_name, who) => {
      const res = await request(buildApp()).get("/staff").set("Authorization", bearer(who));
      expect(res.status).toBe(200);
    });
  });

  describe("failure: wrong role (403)", () => {
    it.each([
      ["teacher", "/admin-only", TEACHER],
      ["student", "/admin-only", STUDENT],
      ["student", "/staff", STUDENT],
    ])("blocks a %s on %s", async (_name, path, who) => {
      const res = await request(buildApp()).get(path).set("Authorization", bearer(who));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    });
  });

  describe("failure: not authenticated (401)", () => {
    it("answers 401, not 403, when there is no token", async () => {
      const res = await request(buildApp()).get("/admin-only");
      expect(res.status).toBe(401);
    });

    it("fails closed with 401 when authenticate was forgotten", async () => {
      const res = await request(buildApp()).get("/without-authenticate");
      expect(res.status).toBe(401);
    });
  });

  describe("failure: misconfiguration", () => {
    it("refuses to be created without roles", () => {
      expect(() => requireRole()).toThrow(/at least one role/);
    });
  });
});
