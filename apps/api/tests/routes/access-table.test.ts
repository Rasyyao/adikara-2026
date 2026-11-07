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
  "post /classes": ["teacher", "staff"],
  "patch /classes/:id": ["teacher", "staff"],
  "delete /classes/:id": ["teacher", "staff"],
  "post /classes/:id/students": ["teacher", "staff"],
  "patch /classes/:id/students/:studentId": ["teacher", "staff"],
  "delete /classes/:id/students/:studentId": ["teacher", "staff"],
  "get /insights": ["teacher", "staff"],
  "get /insights/classes/:id": ["teacher", "staff"],
  "post /insights/classes/:id/feedback": ["teacher", "staff"],
  "get /insights/classes/:id/feedback": ["teacher", "staff"],
  "get /problems": ["teacher", "staff"],
  "post /problems": ["teacher", "staff"],
  "get /problems/materials": ["teacher", "staff"],
  "post /problems/generate": ["teacher", "staff"],
  "post /problems/:id/regenerate": ["teacher", "staff"],
  "get /problems/:id": ["teacher", "staff"],
  "put /problems/:id": ["teacher", "staff"],
  "post /problems/:id/status": ["teacher", "staff"],
  "post /problems/:id/duplicate": ["teacher", "staff"],
  "delete /problems/:id": ["teacher", "staff"],
  "post /problems/:id/check": ["teacher", "staff"],

  "post /chats": ["teacher", "staff"],
  "get /chats": ["teacher", "staff"],
  "get /chats/:id": ["teacher", "staff"],
  "delete /chats/:id": ["teacher", "staff"],
  "get /chats/:id/messages": ["teacher", "staff"],
  "post /chats/:id/messages": ["teacher", "staff"],
  "post /chats/:id/stop": ["teacher", "staff"],
  "patch /chats/:id/messages/:messageId": ["teacher", "staff"],
  "get /chats/:id/events": ["teacher", "staff"],
  "get /chats/:id/materials/:materialId": ["teacher", "staff"],
  "get /chats/:id/materials/:materialId/file": ["teacher", "staff"],
  "get /sessions": ["teacher", "staff"],
  "post /sessions": ["teacher", "staff"],
  "get /sessions/:id": ["teacher", "staff"],
  "get /sessions/:id/board": ["teacher", "staff"],
  "put /sessions/:id/board": ["teacher", "staff"],
  "put /sessions/:id/material": ["teacher", "staff"],
  "post /sessions/:id/start": ["teacher", "staff"],
  "post /sessions/:id/lock": ["teacher", "staff"],
  "post /sessions/:id/end": ["teacher", "staff"],
  "delete /sessions/:id/participants/:studentId": ["teacher", "staff"],
  "get /sessions/:id/attendance": ["teacher", "staff"],
  "post /sessions/:id/quizzes": ["teacher", "staff"],
  "get /sessions/:id/quizzes": ["teacher", "staff"],
  "post /sessions/:id/quizzes/:quizId/close": ["teacher", "staff"],
  "get /sessions/:id/quizzes/:quizId/results": ["teacher", "staff"],
  "get /sessions/:id/quizzes/:quizId/export": ["teacher", "staff"],
  "post /sessions/:id/problems": ["teacher", "staff"],
  "get /sessions/:id/problems": ["teacher", "staff"],
  "get /sessions/:id/problems/:problemId/results": ["teacher", "staff"],
  "post /sessions/:id/problems/:problemId/close": ["teacher", "staff"],

  "post /sessions/join": ["student", "student"],
  "get /sessions/:id/quizzes/:quizId": ["student", "student"],
  "post /sessions/:id/quizzes/:quizId/attempt": ["student", "student"],
  "put /sessions/:id/quizzes/:quizId/attempt/answers": ["student", "student"],
  "post /sessions/:id/quizzes/:quizId/attempt/submit": ["student", "student"],
  "get /sessions/:id/open-problems": ["student", "student"],
  "get /sessions/:id/problems/:problemId": ["student", "student"],
  "post /sessions/:id/problems/:problemId/check": ["student", "student"],
  "post /sessions/:id/problems/:problemId/code": ["student", "student"],

  "get /sessions/:id/events": ["shared", "authenticated"],
  "post /sessions/:id/live": ["shared", "authenticated"],
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

  it("rate limits: logins use the login limiter, joining uses the join limiter, only sending a chat message reads an upload, nothing else has middleware", () => {
    const limited = Object.fromEntries(
      routes.filter((r) => (r.middleware ?? []).length > 0).map((r) => [r.name, (r.middleware ?? []).map(labelOf)]),
    );
    expect(limited).toEqual({
      "post /auth/login": ["rate-limit:login"],
      "post /auth/student/login": ["rate-limit:login"],
      "post /sessions/join": ["rate-limit:join"],
      "post /chats/:id/messages": ["upload:file"],
    });
  });
});
