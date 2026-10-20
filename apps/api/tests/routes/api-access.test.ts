import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { PATHS } from "../helpers/requests.js";

/**
 * Real route table, called without a token. Public routes must not ask for a token;
 * every other route must answer 401. Add a line here when you add a route.
 */
const PUBLIC_ROUTES = [
  ["post", PATHS.teacherLogin],
  ["post", PATHS.studentLogin],
] as const;

const ID = "00000000-0000-4000-8000-000000000001";
const PROTECTED_ROUTES = [
  ["get", PATHS.me],
  ["post", "/api/v1/sessions"],
  ["post", "/api/v1/sessions/join"],
  ["get", `/api/v1/sessions/${ID}`],
  ["post", `/api/v1/sessions/${ID}/start`],
  ["post", `/api/v1/sessions/${ID}/lock`],
  ["post", `/api/v1/sessions/${ID}/end`],
  ["delete", `/api/v1/sessions/${ID}/participants/${ID}`],
  ["get", `/api/v1/sessions/${ID}/attendance`],
  ["get", `/api/v1/sessions/${ID}/events`],
] as const;

describe("API route access (real route table)", () => {
  it.each(PUBLIC_ROUTES)("%s %s does not require a token", async (method, path) => {
    const { app } = await buildTestApp();
    const res = await request(app)[method](path).send({});
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400); // reached validation, so no auth gate in front
  });

  it.each(PROTECTED_ROUTES)("%s %s requires a token", async (method, path) => {
    const { app } = await buildTestApp();
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("unknown paths under /api/v1 answer 404, not 401", async () => {
    const { app } = await buildTestApp();
    expect((await request(app).get("/api/v1/does-not-exist")).status).toBe(404);
  });
});
