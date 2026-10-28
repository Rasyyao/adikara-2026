import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { buildOpenApi } from "../../src/docs/openapi.js";
import { realRouteGroups } from "../helpers/route-groups.js";

const spec = buildOpenApi(realRouteGroups()) as any;
const sessionGroups = realRouteGroups().filter((g) => g.feature === "sessions");
const sessionRoutes = sessionGroups.flatMap((g) => g.routes);

describe("OpenAPI: sessions", () => {
  it("the document with the session routes is valid (every $ref resolves)", async () => {
    await expect(SwaggerParser.validate(structuredClone(spec))).resolves.toBeDefined();
  });

  it("has a Teacher, a Student and a Shared 'sessions' tag, and the teacher one explains the flow", () => {
    const names = spec.tags.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Teacher · sessions", "Student · sessions", "Shared · sessions"]));
    const teacher = spec.tags.find((t: { name: string }) => t.name === "Teacher · sessions");
    expect(teacher.description).toMatch(/POST \/sessions/);
  });

  it("documents all 13 endpoints with {braces} in the paths", () => {
    expect(sessionRoutes).toHaveLength(13);
    for (const path of [
      "/sessions",
      "/sessions/join",
      "/sessions/{id}",
      "/sessions/{id}/board",
      "/sessions/{id}/material",
      "/sessions/{id}/start",
      "/sessions/{id}/lock",
      "/sessions/{id}/end",
      "/sessions/{id}/participants/{studentId}",
      "/sessions/{id}/attendance",
      "/sessions/{id}/events",
    ]) {
      expect(spec.paths[path], path).toBeDefined();
    }
  });

  it("declares the path parameters", () => {
    const params = spec.paths["/sessions/{id}/participants/{studentId}"].delete.parameters.map((p: { name: string }) => p.name);
    expect(params).toEqual(["id", "studentId"]);
  });

  it.each([
    ["/sessions", "post", "staff"],
    ["/sessions/join", "post", "student"],
    ["/sessions/{id}/events", "get", "authenticated"],
    ["/sessions/{id}/end", "post", "staff"],
  ])("%s %s is marked with access '%s'", (path, method, access) => {
    expect(spec.paths[path][method]["x-access"]).toBe(access);
    expect(spec.paths[path][method].security).toEqual([{ bearerAuth: [] }]);
  });

  it("join documents the 429 from its rate limiter and the 403 for students only", () => {
    const responses = spec.paths["/sessions/join"].post.responses;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(["200", "400", "401", "403", "404", "429", "500"]));
    expect(spec.paths["/sessions/join"].post.description).toContain("rate-limit:join");
  });

  it("the event stream is documented as text/event-stream, not JSON", () => {
    const ok = spec.paths["/sessions/{id}/events"].get.responses["200"];
    expect(Object.keys(ok.content)).toEqual(["text/event-stream"]);
    expect(ok.content["text/event-stream"].example).toContain("event: snapshot");
  });

  it("request examples match the request schemas' required fields", () => {
    expect(spec.paths["/sessions"].post.requestBody.content["application/json"].example).toEqual({ class_code: "KELAS7A" });
    expect(spec.paths["/sessions/join"].post.requestBody.content["application/json"].example).toEqual({ code: "482913" });
    expect(spec.paths["/sessions/{id}/lock"].post.requestBody.content["application/json"].example).toEqual({ locked: true });
  });

  it("start and end have no request body, but can still answer 400 for a malformed id", () => {
    for (const path of ["/sessions/{id}/start", "/sessions/{id}/end"]) {
      const op = spec.paths[path].post;
      expect(op.requestBody).toBeUndefined();
      expect(op.responses["400"]).toBeDefined();
    }
  });

  it("every session schema used by a response exists in components", () => {
    for (const name of ["SessionView", "SessionDetail", "SessionResponse", "ParticipantView", "ParticipantResponse", "Attendance", "EndSessionResponse", "JoinResult", "StudentSessionView"]) {
      expect(spec.components.schemas[name], name).toBeDefined();
    }
  });
});
