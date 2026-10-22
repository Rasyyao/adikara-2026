import { describe, expect, it } from "vitest";
import { labelOf } from "../../src/http/middleware/label.js";
import { realRouteGroups } from "../helpers/route-groups.js";

/**
 * The role and access type of EVERY route, written out. The services check the role again, so a wrong
 * access type would not always show up as a failing request; this table catches it.
 * When you add a route, add a line here.
 */
const TABLE: Record<string, [role: string, access: string]> = {
  "post /auth/login": ["teacher", "public"],
  "post /auth/student/login": ["student", "public"],
  "get /auth/me": ["shared", "authenticated"],

  "get /admin/teachers": ["admin", "admin"],
  "post /admin/teachers": ["admin", "admin"],
  "get /admin/teachers/:id": ["admin", "admin"],
  "patch /admin/teachers/:id": ["admin", "admin"],
  "delete /admin/teachers/:id": ["admin", "admin"],
  "get /admin/students": ["admin", "admin"],
  "post /admin/students": ["admin", "admin"],
  "get /admin/students/:id": ["admin", "admin"],
  "patch /admin/students/:id": ["admin", "admin"],
  "delete /admin/students/:id": ["admin", "admin"],
  "get /admin/classes": ["admin", "admin"],
  "post /admin/classes": ["admin", "admin"],
  "get /admin/classes/:id": ["admin", "admin"],
  "patch /admin/classes/:id": ["admin", "admin"],
  "delete /admin/classes/:id": ["admin", "admin"],

  "get /classes": ["teacher", "staff"],
  "get /classes/:id": ["teacher", "staff"],
  "get /sessions": ["teacher", "staff"],
  "post /sessions": ["teacher", "staff"],
  "get /sessions/:id": ["teacher", "staff"],
  "post /sessions/:id/start": ["teacher", "staff"],
  "post /sessions/:id/lock": ["teacher", "staff"],
  "post /sessions/:id/end": ["teacher", "staff"],
  "delete /sessions/:id/participants/:studentId": ["teacher", "staff"],
  "get /sessions/:id/attendance": ["teacher", "staff"],

  "post /sessions/join": ["student", "student"],

  "get /sessions/:id/events": ["shared", "authenticated"],
};

const routes = realRouteGroups().flatMap((g) => g.routes.map((r) => ({ role: g.role, ...r, name: `${r.method} ${r.path}` })));

describe("route table: role and access of every route", () => {
  it("lists exactly the routes of the API", () => {
    expect(routes.map((r) => r.name).sort()).toEqual(Object.keys(TABLE).sort());
  });

  it.each(Object.entries(TABLE))("%s is [%s, %s]", (name, [role, access]) => {
    const route = routes.find((r) => r.name === name)!;
    expect([route.role, route.access]).toEqual([role, access]);
  });

  it("only the login routes are public", () => {
    expect(routes.filter((r) => r.access === "public").map((r) => r.name).sort()).toEqual(["post /auth/login", "post /auth/student/login"]);
  });

  it("rate limits: logins use the login limiter, joining uses the join limiter, nothing else is limited", () => {
    const limited = Object.fromEntries(
      routes.filter((r) => (r.middleware ?? []).length > 0).map((r) => [r.name, (r.middleware ?? []).map(labelOf)]),
    );
    expect(limited).toEqual({
      "post /auth/login": ["rate-limit:login"],
      "post /auth/student/login": ["rate-limit:login"],
      "post /sessions/join": ["rate-limit:join"],
    });
  });
});
