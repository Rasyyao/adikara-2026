import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { buildOpenApi, toOpenApiPath } from "../../src/docs/openapi.js";
import { realRouteGroups } from "../helpers/route-groups.js";

const groups = realRouteGroups();
const spec = buildOpenApi(groups) as any;

describe("OpenAPI document", () => {
  describe("success: valid and complete", () => {
    it("is a valid OpenAPI 3 document (including every $ref)", async () => {
      await expect(SwaggerParser.validate(structuredClone(spec))).resolves.toBeDefined();
    });

    it("lists every real route under its method", () => {
      for (const group of groups) {
        for (const route of group.routes) {
          expect(spec.paths[toOpenApiPath(route.path)]?.[route.method], `${route.method} ${route.path}`).toBeDefined();
        }
      }
    });

    it("has one tag per feature with its description", () => {
      expect(spec.tags).toEqual(groups.map((g) => ({ name: g.feature, description: g.description })));
    });

    it("uses /api/v1 as the server base", () => {
      expect(spec.servers[0].url).toBe("/api/v1");
    });

    it("gives every operation a unique operationId", () => {
      const ids = Object.values<any>(spec.paths).flatMap((item) => Object.values<any>(item).map((op) => op.operationId));
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("security follows the access type", () => {
    it("public routes need no token", () => {
      expect(spec.paths["/auth/login"].post.security).toEqual([]);
      expect(spec.paths["/auth/login"].post["x-access"]).toBe("public");
    });

    it("protected routes require the bearer token", () => {
      expect(spec.paths["/auth/me"].get.security).toEqual([{ bearerAuth: [] }]);
      expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    });
  });

  describe("standard error responses are added automatically", () => {
    it("login has 400 (body), 401 (explicit), 429 (rate limit) and 500, but no 403", () => {
      const responses = spec.paths["/auth/login"].post.responses;
      expect(Object.keys(responses).sort()).toEqual(["200", "400", "401", "429", "500"]);
    });

    it("keeps the explicit 401 text of the route instead of the generic one", () => {
      const description = spec.paths["/auth/login"].post.responses["401"].description;
      expect(description).toMatch(/Wrong credentials/);
    });

    it("/me has 401 and 500 but no 400 or 429", () => {
      const responses = spec.paths["/auth/me"].get.responses;
      expect(Object.keys(responses).sort()).toEqual(["200", "401", "500"]);
    });

    it("mentions the rate-limit middleware in the description", () => {
      expect(spec.paths["/auth/login"].post.description).toContain("rate-limit:login");
    });
  });

  describe("path helpers", () => {
    it.each([
      ["/classes", "/classes"],
      ["/classes/:id", "/classes/{id}"],
      ["/classes/:classId/students/:studentId", "/classes/{classId}/students/{studentId}"],
    ])("converts %s to %s", (input, output) => {
      expect(toOpenApiPath(input)).toBe(output);
    });
  });
});
