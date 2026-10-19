import { describe, expect, it } from "vitest";
import { realRouteGroups } from "../helpers/route-groups.js";

const groups = realRouteGroups();
const routes = groups.flatMap((group) => group.routes.map((route) => ({ feature: group.feature, ...route })));

describe("route table integrity (real routes)", () => {
  it("has at least one feature group with a description", () => {
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.feature).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(group.description.length).toBeGreaterThan(0);
    }
  });

  it("has unique feature names", () => {
    const names = groups.map((group) => group.feature);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has no duplicate method + path", () => {
    const keys = routes.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(routes.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const))(
    "%s is declared correctly",
    (_name, route) => {
      expect(route.path.startsWith("/")).toBe(true);
      expect(route.path.startsWith(`/${route.feature}`)).toBe(true);
      expect(route.doc.summary.length).toBeGreaterThan(0);
      expect(Object.keys(route.doc.responses).some((code) => code.startsWith("2"))).toBe(true);
    },
  );

  it("documents a request body for every POST/PUT/PATCH route", () => {
    for (const route of routes.filter((r) => ["post", "put", "patch"].includes(r.method))) {
      expect(route.doc.requestBody, `${route.method} ${route.path}`).toBeDefined();
    }
  });
});
