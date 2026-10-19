import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/http/errors.js";
import { errorHandler, notFoundHandler } from "../../src/http/middleware/error-handler.js";

function buildApp(handler: express.RequestHandler) {
  const app = express();
  app.get("/boom", handler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

afterEach(() => vi.restoreAllMocks());

describe("error handler", () => {
  describe("success: known errors are rendered as the standard error body", () => {
    it("renders an AppError with status, code, message and details", async () => {
      const app = buildApp(() => {
        throw new AppError(418, "teapot", "I am a teapot", { hint: "tea" });
      });
      const res = await request(app).get("/boom");

      expect(res.status).toBe(418);
      expect(res.body).toEqual({ error: { code: "teapot", message: "I am a teapot", details: { hint: "tea" } } });
    });

    it("catches rejected async handlers (Express 5)", async () => {
      const app = buildApp(async () => {
        throw new AppError(409, "conflict", "Conflict");
      });
      expect((await request(app).get("/boom")).status).toBe(409);
    });

    it("renders unknown routes as 404 not_found", async () => {
      const res = await request(buildApp(() => {})).get("/missing");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    });
  });

  describe("failure: unexpected errors are hidden", () => {
    it("answers a generic 500 without leaking the message", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const app = buildApp(() => {
        throw new Error("secret detail: db password is hunter2");
      });
      const res = await request(app).get("/boom");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: { code: "internal_error", message: "Internal server error" } });
      expect(res.text).not.toContain("hunter2");
    });

    it("still logs the real error on the server", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      await request(
        buildApp(() => {
          throw new Error("kaboom");
        }),
      ).get("/boom");
      expect(spy).toHaveBeenCalled();
    });
  });
});
