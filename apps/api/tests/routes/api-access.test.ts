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

const PROTECTED_ROUTES = [["get", PATHS.me]] as const;

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
