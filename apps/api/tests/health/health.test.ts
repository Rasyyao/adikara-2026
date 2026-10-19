import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";

describe("health endpoints", () => {
  describe("success cases", () => {
    it("GET /healthz returns ok", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get("/healthz");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });

    it("GET /readyz returns ok when the database answers", async () => {
      const { app } = await buildTestApp({ pingDb: async () => {} });
      const res = await request(app).get("/readyz");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  describe("failure cases", () => {
    it("GET /readyz returns 503 with the error shape when the database is down", async () => {
      const { app } = await buildTestApp({
        pingDb: async () => {
          throw new Error("connection refused");
        },
      });
      const res = await request(app).get("/readyz");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: { code: "db_unavailable", message: "Database is not reachable" } });
    });

    it("does not leak the underlying database error", async () => {
      const { app } = await buildTestApp({
        pingDb: async () => {
          throw new Error("password authentication failed for user secret");
        },
      });
      const res = await request(app).get("/readyz");
      expect(JSON.stringify(res.body)).not.toContain("secret");
    });

    it("unknown route returns 404 with the error shape", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get("/nope");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    });
  });
});
