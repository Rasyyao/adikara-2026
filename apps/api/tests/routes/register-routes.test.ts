import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createAccessGuards } from "../../src/http/middleware/access.js";
import { errorHandler } from "../../src/http/middleware/error-handler.js";
import { registerRoutes } from "../../src/routes/register.js";
import type { RouteDefinition } from "../../src/routes/types.js";
import { route } from "../helpers/route.js";
import { ADMIN, STUDENT, TEACHER, bearer, testTokens } from "../helpers/identities.js";

function buildApp(routes: Omit<RouteDefinition, "doc">[]) {
  const app = express();
  app.use(registerRoutes(express.Router(), createAccessGuards(testTokens), routes.map(route)));
  app.use(errorHandler);
  return app;
}

const ok: express.RequestHandler = (_req, res) => {
  res.json({ ok: true });
};

describe("registerRoutes", () => {
  describe("success: access type picks the middleware", () => {
    const app = buildApp([
      { method: "get", path: "/open", access: "public", handler: ok },
      { method: "get", path: "/private", access: "authenticated", handler: ok },
      { method: "get", path: "/staff", access: "staff", handler: ok },
      { method: "post", path: "/admin", access: "admin", handler: ok },
    ]);

    it("serves a public route without a token", async () => {
      expect((await request(app).get("/open")).status).toBe(200);
    });

    it("protects an authenticated route", async () => {
      expect((await request(app).get("/private")).status).toBe(401);
      expect((await request(app).get("/private").set("Authorization", bearer(STUDENT))).status).toBe(200);
    });

    it("enforces the role of a staff route", async () => {
      expect((await request(app).get("/staff").set("Authorization", bearer(STUDENT))).status).toBe(403);
      expect((await request(app).get("/staff").set("Authorization", bearer(TEACHER))).status).toBe(200);
    });

    it("respects the HTTP method of the definition", async () => {
      expect((await request(app).post("/admin").set("Authorization", bearer(ADMIN))).status).toBe(200);
      expect((await request(app).get("/admin").set("Authorization", bearer(ADMIN))).status).toBe(404);
    });
  });

  describe("success: extra middleware", () => {
    it("runs route middleware after the access guard, before the handler", async () => {
      const order: string[] = [];
      const app = buildApp([
        {
          method: "get",
          path: "/ordered",
          access: "authenticated",
          middleware: [
            (_req, _res, next) => {
              order.push("limit");
              next();
            },
          ],
          handler: (_req, res) => {
            order.push("handler");
            res.json({ ok: true });
          },
        },
      ]);

      await request(app).get("/ordered").set("Authorization", bearer(STUDENT));
      expect(order).toEqual(["limit", "handler"]);
    });
  });

  describe("failure: the guard stops the request first", () => {
    it("does not run route middleware or the handler for an unauthenticated caller", async () => {
      const calls: string[] = [];
      const app = buildApp([
        {
          method: "get",
          path: "/guarded",
          access: "admin",
          middleware: [
            (_req, _res, next) => {
              calls.push("middleware");
              next();
            },
          ],
          handler: (_req, res) => {
            calls.push("handler");
            res.json({ ok: true });
          },
        },
      ]);

      expect((await request(app).get("/guarded")).status).toBe(401);
      expect((await request(app).get("/guarded").set("Authorization", bearer(TEACHER))).status).toBe(403);
      expect(calls).toEqual([]);
    });
  });
});
