import { describe, expect, it } from "vitest";
import { formatRouteTable, toRows } from "../../src/cli/format-routes.js";
import { labelled, labelOf } from "../../src/http/middleware/label.js";
import type { RouteGroup } from "../../src/routes/types.js";
import { route } from "../helpers/route.js";
import { realRouteGroups } from "../helpers/route-groups.js";

const ok = (_req: unknown, res: { json: (v: unknown) => void }) => res.json({});

const groups: RouteGroup[] = [
  {
    feature: "auth",
    description: "Login",
    routes: [
      route({ method: "post", path: "/auth/login", access: "public", middleware: [labelled("rate-limit:login", (_q, _s, n) => n())], handler: ok as never }),
    ],
  },
  {
    feature: "classes",
    description: "Classes",
    routes: [
      route({ method: "get", path: "/classes", access: "staff", handler: ok as never }),
      route({ method: "delete", path: "/classes/:id", access: "admin", handler: ok as never }),
    ],
  },
];

describe("route list formatting", () => {
  describe("success", () => {
    it("groups routes by feature in declaration order", () => {
      const text = formatRouteTable(groups);
      expect(text.indexOf("auth")).toBeLessThan(text.indexOf("classes"));
    });

    it("shows method, full URI, access and middleware per route", () => {
      const text = formatRouteTable(groups);
      expect(text).toMatch(/POST\s+\/api\/v1\/auth\/login\s+public\s+rate-limit:login/);
      expect(text).toMatch(/DELETE\s+\/api\/v1\/classes\/:id\s+admin\s+-/);
    });

    it("prints a total", () => {
      expect(formatRouteTable(groups)).toContain("3 routes in 2 features");
    });

    it("adds colours only when asked", () => {
      expect(formatRouteTable(groups, { color: false })).not.toContain("\x1b[");
      expect(formatRouteTable(groups, { color: true })).toContain("\x1b[");
    });

    it("filters by feature", () => {
      const text = formatRouteTable(groups, { feature: "classes" });
      expect(text).toContain("/api/v1/classes");
      expect(text).not.toContain("/auth/login");
    });

    it("filters by access", () => {
      const rows = toRows(groups, { access: "admin" });
      expect(rows.map((r) => r.uri)).toEqual(["/api/v1/classes/:id"]);
    });

    it("lists the real route table", () => {
      const text = formatRouteTable(realRouteGroups());
      expect(text).toContain("/api/v1/auth/login");
      expect(text).toContain("/api/v1/auth/me");
    });
  });

  describe("failure: nothing to show", () => {
    it("says so when a filter matches nothing", () => {
      expect(formatRouteTable(groups, { access: "student" })).toBe("No routes found.");
    });

    it("says so for an unknown feature", () => {
      expect(formatRouteTable(groups, { feature: "nope" })).toBe("No routes found.");
    });
  });
});

describe("middleware labels", () => {
  it("returns the label when set", () => {
    expect(labelOf(labelled("my-label", (_q, _s, n) => n()))).toBe("my-label");
  });

  it("falls back to the function name, then a generic name", () => {
    function namedMiddleware() {}
    expect(labelOf(namedMiddleware as never)).toBe("namedMiddleware");
    expect(labelOf((() => {}) as never)).toBe("middleware");
  });
});
