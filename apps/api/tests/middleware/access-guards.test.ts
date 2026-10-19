import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createAccessGuards, type Access } from "../../src/http/middleware/access.js";
import { errorHandler } from "../../src/http/middleware/error-handler.js";
import { ADMIN, STUDENT, TEACHER, bearer, testTokens } from "../helpers/identities.js";

const guards = createAccessGuards(testTokens);
const ACCESS_TYPES = Object.keys(guards) as Access[];

function buildApp(access: Access) {
  const app = express();
  app.get("/resource", ...guards[access], (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

type Caller = "anonymous" | "student" | "teacher" | "admin";

const HEADERS: Record<Caller, string | undefined> = {
  anonymous: undefined,
  student: bearer(STUDENT),
  teacher: bearer(TEACHER),
  admin: bearer(ADMIN),
};

/** Expected status for every access type and caller. This table is the contract. */
const EXPECTED: Record<Access, Record<Caller, number>> = {
  public:        { anonymous: 200, student: 200, teacher: 200, admin: 200 },
  authenticated: { anonymous: 401, student: 200, teacher: 200, admin: 200 },
  student:       { anonymous: 401, student: 200, teacher: 403, admin: 403 },
  staff:         { anonymous: 401, student: 403, teacher: 200, admin: 200 },
  admin:         { anonymous: 401, student: 403, teacher: 403, admin: 200 },
};

describe("access guards", () => {
  it("defines exactly the documented access types", () => {
    expect(ACCESS_TYPES.sort()).toEqual(["admin", "authenticated", "public", "staff", "student"]);
  });

  for (const access of Object.keys(EXPECTED) as Access[]) {
    describe(`access "${access}"`, () => {
      for (const [caller, status] of Object.entries(EXPECTED[access]) as [Caller, number][]) {
        it(`${caller} gets ${status}`, async () => {
          const req = request(buildApp(access)).get("/resource");
          const header = HEADERS[caller];
          const res = header ? await req.set("Authorization", header) : await req;
          expect(res.status).toBe(status);
        });
      }
    });
  }

  it("public ignores an invalid token instead of rejecting it", async () => {
    const res = await request(buildApp("public")).get("/resource").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(200);
  });
});
