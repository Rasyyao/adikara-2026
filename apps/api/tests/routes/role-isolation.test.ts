import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import { API_PREFIX } from "../../src/routes/index.js";
import { ADMIN_AUTH, TEACHER_AUTH, auth, studentAuth } from "../helpers/sessions.js";
import { realRouteGroups } from "../helpers/route-groups.js";

/**
 * Calls EVERY real route with an admin, a teacher, a student and no token, and checks the answer against the
 * route's access type. New routes are picked up automatically, so a route that is more open than it declares fails here.
 */
const ID = "00000000-0000-4000-8000-00000000dead";
const routes = realRouteGroups().flatMap((g) => g.routes.map((r) => ({ role: g.role, ...r })));

const CALLERS = {
  admin: { headers: auth(ADMIN_AUTH), kind: "ADMIN" },
  teacher: { headers: auth(TEACHER_AUTH), kind: "TEACHER" },
  student: { headers: auth(studentAuth("satu")), kind: "USER" },
  none: { headers: {}, kind: "none" },
} as const;

/** Which callers an access type lets through. */
const ALLOWED: Record<string, string[]> = {
  public: ["admin", "teacher", "student", "none"],
  authenticated: ["admin", "teacher", "student"],
  student: ["student"],
  staff: ["admin", "teacher"],
  admin: ["admin"],
};

const cases = routes.flatMap((route) => (Object.keys(CALLERS) as (keyof typeof CALLERS)[]).map((caller) => [route, caller] as const));

describe("every route against every kind of caller", () => {
  it.each(cases.map(([route, caller]) => [`${route.method.toUpperCase()} ${route.path} as ${caller}`, route, caller] as const))(
    "%s",
    async (_name, route, caller) => {
      // SSE routes would stay open when allowed; those are only called by callers that must be refused
      const allowed = ALLOWED[route.access].includes(caller);
      if (allowed && route.path.endsWith("/events")) return;

      const { app } = await buildTestApp();
      const path = `${API_PREFIX}${route.path.replace(/:\w+/g, ID)}`;
      const res = await request(app)[route.method](path).set(CALLERS[caller].headers).send({});

      if (allowed) {
        expect([401, 403], "an allowed caller must get past the guard").not.toContain(res.status);
      } else if (caller === "none") {
        expect(res.status).toBe(401);
      } else {
        expect(res.status).toBe(403);
      }
    },
  );
});
