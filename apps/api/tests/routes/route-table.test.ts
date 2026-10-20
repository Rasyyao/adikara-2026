import { describe, expect, it } from "vitest";
import { realRouteGroups } from "../helpers/route-groups.js";

const groups = realRouteGroups();
const routes = groups.flatMap((group) => group.routes.map((route) => ({ role: group.role, feature: group.feature, ...route })));

describe("route table integrity (real routes)", () => {
  it("has at least one feature group with a description", () => {
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.feature).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(group.description.length).toBeGreaterThan(0);
    }
  });

  it("has unique role + feature pairs, and a known role on every group", () => {
    const names = groups.map((group) => `${group.role}/${group.feature}`);
    expect(new Set(names).size).toBe(names.length);
    for (const group of groups) expect(["admin", "teacher", "student", "shared"]).toContain(group.role);
  });

  it("has no duplicate method + path", () => {
    const keys = routes.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(routes.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const))(
    "%s is declared correctly",
    (_name, route) => {
      expect(route.path.startsWith("/")).toBe(true);
      // /sessions for a feature "sessions"; admin features sit under their role: /admin/teachers
      const prefixes = [`/${route.feature}`, `/${route.role}/${route.feature}`];
      expect(prefixes.some((prefix) => route.path.startsWith(prefix)), route.path).toBe(true);
      expect(route.doc.summary.length).toBeGreaterThan(0);
      expect(Object.keys(route.doc.responses).some((code) => code.startsWith("2"))).toBe(true);
    },
  );

  // Action endpoints that take no body. Add a route here only when it really has none.
  const BODYLESS_ACTIONS = ["post /sessions/:id/start", "post /sessions/:id/end"];

  it("documents a request body for every POST/PUT/PATCH route", () => {
    for (const route of routes.filter((r) => ["post", "put", "patch"].includes(r.method))) {
      const name = `${route.method} ${route.path}`;
      if (BODYLESS_ACTIONS.includes(name)) continue;
      expect(route.doc.requestBody, name).toBeDefined();
    }
  });
});
