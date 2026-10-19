import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { PASSWORDS } from "../helpers/fake-repository.js";
import { PATHS, loginTeacher } from "../helpers/requests.js";

describe("HTTP hardening", () => {
  describe("headers", () => {
    it("sends helmet's nosniff header", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get("/healthz");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("does not advertise Express", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get("/healthz");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });
  });

  describe("CORS", () => {
    it("allows a configured origin", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get("/healthz").set("Origin", "http://localhost:3000");
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    });

    it("does not allow an unknown origin", async () => {
      const { app } = await buildTestApp();
      const res = await request(app).get("/healthz").set("Origin", "http://evil.test");
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });
});

describe("login rate limiting", () => {
  it("blocks attempts over the limit with 429 and the standard error body", async () => {
    const { app } = await buildTestApp({ config: { loginRateLimitMax: 3 } });
    const attempt = () => loginTeacher(app, "teacher@example.com", "wrong-pass-1");

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("too_many_requests");
  });

  it("also blocks a correct password once the limit is used up", async () => {
    const { app } = await buildTestApp({ config: { loginRateLimitMax: 2 } });
    await loginTeacher(app, "teacher@example.com", "wrong-pass-1");
    await loginTeacher(app, "teacher@example.com", "wrong-pass-1");

    const res = await loginTeacher(app, "teacher@example.com", PASSWORDS.teacher);
    expect(res.status).toBe(429);
  });

  it("shares one counter between teacher and student login", async () => {
    const { app } = await buildTestApp({ config: { loginRateLimitMax: 2 } });
    await request(app).post(PATHS.studentLogin).send({ username: "siswa.satu", password: "wrong-pass-1" });
    await loginTeacher(app, "teacher@example.com", "wrong-pass-1");

    const res = await loginTeacher(app, "teacher@example.com", "wrong-pass-1");
    expect(res.status).toBe(429);
  });

  it("does not rate limit /me", async () => {
    const { app } = await buildTestApp({ config: { loginRateLimitMax: 1 } });
    for (let i = 0; i < 5; i++) expect((await request(app).get(PATHS.me)).status).toBe(401);
  });
});
