import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";

describe("API docs endpoints", () => {
  describe("success: docs enabled", () => {
    it("GET /docs/openapi.json returns the spec", async () => {
      const { app } = await buildTestApp({ config: { docsEnabled: true } });
      const res = await request(app).get("/docs/openapi.json");

      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe("3.0.3");
      expect(res.body.paths["/auth/login"]).toBeDefined();
    });

    it("GET /docs/ serves the Swagger UI page", async () => {
      const { app } = await buildTestApp({ config: { docsEnabled: true } });
      const res = await request(app).get("/docs/");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/html/);
      expect(res.text).toContain("swagger-ui");
    });

    it("lets the UI run its scripts (CSP is relaxed only under /docs)", async () => {
      const { app } = await buildTestApp({ config: { docsEnabled: true } });
      const docs = await request(app).get("/docs/");
      const api = await request(app).get("/healthz");

      expect(docs.headers["content-security-policy"]).toBeUndefined();
      expect(api.headers["content-security-policy"]).toBeDefined();
    });
  });

  describe("failure: docs disabled", () => {
    it("GET /docs/openapi.json is 404", async () => {
      const { app } = await buildTestApp({ config: { docsEnabled: false } });
      expect((await request(app).get("/docs/openapi.json")).status).toBe(404);
    });

    it("GET /docs/ is 404", async () => {
      const { app } = await buildTestApp({ config: { docsEnabled: false } });
      expect((await request(app).get("/docs/")).status).toBe(404);
    });
  });
});
