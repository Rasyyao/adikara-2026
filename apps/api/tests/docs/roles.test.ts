import { describe, expect, it } from "vitest";
import { buildOpenApi, tagOf } from "../../src/docs/openapi.js";
import { realRouteGroups } from "../helpers/route-groups.js";

const groups = realRouteGroups();
const spec = buildOpenApi(groups) as any;

/** Which tag each real endpoint sits under in Swagger. Written out so a change is a deliberate edit. */
const EXPECTED_TAGS: Record<string, string> = {
  "get /admin/teachers": "Admin · teachers",
  "post /admin/teachers": "Admin · teachers",
  "get /admin/teachers/{id}": "Admin · teachers",
  "patch /admin/teachers/{id}": "Admin · teachers",
  "delete /admin/teachers/{id}": "Admin · teachers",
  "get /admin/students": "Admin · students",
  "post /admin/students": "Admin · students",
  "get /admin/students/{id}": "Admin · students",
  "patch /admin/students/{id}": "Admin · students",
  "delete /admin/students/{id}": "Admin · students",
  "get /admin/classes": "Admin · classes",
  "post /admin/classes": "Admin · classes",
  "get /admin/classes/{id}": "Admin · classes",
  "patch /admin/classes/{id}": "Admin · classes",
  "delete /admin/classes/{id}": "Admin · classes",
  "post /auth/login": "Teacher · auth",
  "get /classes": "Teacher · classes",
  "get /classes/{id}": "Teacher · classes",
  "get /sessions": "Teacher · sessions",
  "post /sessions": "Teacher · sessions",
  "get /sessions/{id}": "Teacher · sessions",
  "post /sessions/{id}/start": "Teacher · sessions",
  "post /sessions/{id}/lock": "Teacher · sessions",
  "post /sessions/{id}/end": "Teacher · sessions",
  "delete /sessions/{id}/participants/{studentId}": "Teacher · sessions",
  "get /sessions/{id}/attendance": "Teacher · sessions",
  "post /auth/student/login": "Student · auth",
  "post /sessions/join": "Student · sessions",
  "get /auth/me": "Shared · auth",
  "get /sessions/{id}/events": "Shared · sessions",
};

describe("Swagger: endpoints are grouped by role", () => {
  it.each(Object.entries(EXPECTED_TAGS))("%s is under '%s'", (name, tag) => {
    const [method, path] = name.split(" ");
    expect(spec.paths[path][method].tags).toEqual([tag]);
  });

  it("covers every endpoint of the API", () => {
    const all = Object.entries<any>(spec.paths).flatMap(([path, item]) => Object.keys(item).map((m) => `${m} ${path}`));
    expect(all.sort()).toEqual(Object.keys(EXPECTED_TAGS).sort());
  });

  it("lists Admin tags first, then Teacher, Student and Shared", () => {
    const order = ["Admin", "Teacher", "Student", "Shared"];
    const labels: string[] = spec.tags.map((t: { name: string }) => t.name.split(" · ")[0]);
    expect(labels).toEqual([...labels].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(labels[0]).toBe("Admin");
  });

  it("every operation uses a declared tag, and every declared tag is used", () => {
    const declared = spec.tags.map((t: { name: string }) => t.name);
    const used = new Set<string>(Object.values<any>(spec.paths).flatMap((item) => Object.values<any>(item).flatMap((op) => op.tags)));
    expect([...used].sort()).toEqual([...declared].sort());
    expect(new Set(declared).size).toBe(declared.length);
  });

  it("states the role in the operation description and in x-role", () => {
    expect(spec.paths["/sessions/join"].post["x-role"]).toBe("student");
    expect(spec.paths["/sessions/join"].post.description).toContain("**For:** Student");
    expect(spec.paths["/sessions"].post.description).toContain("**For:** Teacher");
    expect(spec.paths["/admin/teachers"].post.description).toContain("**For:** Admin");
  });

  it("tagOf is the role label and the feature", () => {
    expect(tagOf({ role: "shared", feature: "auth", description: "", routes: [] })).toBe("Shared · auth");
  });

  it("every admin endpoint requires the admin access type", () => {
    for (const group of groups.filter((g) => g.role === "admin")) {
      for (const route of group.routes) expect(route.access, `${route.method} ${route.path}`).toBe("admin");
    }
  });

  it("no teacher or student endpoint is reachable by a looser role than its group says", () => {
    for (const group of groups) {
      for (const route of group.routes) {
        if (group.role === "student" && route.access !== "public") expect(route.access).toBe("student");
        if (group.role === "teacher" && route.access !== "public") expect(route.access).toBe("staff");
      }
    }
  });
});
