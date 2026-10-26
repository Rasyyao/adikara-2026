import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { buildOpenApi } from "../../src/docs/openapi.js";
import { realRouteGroups } from "../helpers/route-groups.js";

const spec = buildOpenApi(realRouteGroups()) as any;
const send = spec.paths["/chats/{id}/messages"].post;

describe("OpenAPI: chats", () => {
  it("the document is valid (every $ref resolves, including the new chat schemas)", async () => {
    await expect(SwaggerParser.validate(structuredClone(spec))).resolves.toBeDefined();
  });

  it("has a Teacher · chats tag that tells how the reply arrives", () => {
    const tag = spec.tags.find((t: { name: string }) => t.name === "Teacher · chats");
    expect(tag.description).toMatch(/poll/i);
    expect(tag.description).toMatch(/PDF\/DOCX\/PPTX/);
  });

  it("documents the five endpoints with {braces}", () => {
    expect(Object.keys(spec.paths).filter((p) => p.startsWith("/chats")).sort()).toEqual([
      "/chats",
      "/chats/{id}",
      "/chats/{id}/events",
      "/chats/{id}/materials/{materialId}",
      "/chats/{id}/materials/{materialId}/file",
      "/chats/{id}/messages",
      "/chats/{id}/stop",
    ]);
    expect(Object.keys(spec.paths["/chats"]).sort()).toEqual(["get", "post"]);
    expect(Object.keys(spec.paths["/chats/{id}/messages"]).sort()).toEqual(["get", "post"]);
  });

  it("sending a message is documented as multipart with an optional binary file and a required text", () => {
    const body = send.requestBody.content["multipart/form-data"].schema;
    expect(Object.keys(send.requestBody.content)).toEqual(["multipart/form-data"]);
    const schema = spec.components.schemas.SendMessageRequest;
    expect(body.$ref).toMatch(/SendMessageRequest/);
    expect(schema.required).toEqual(["text"]);
    expect(schema.properties.file).toMatchObject({ type: "string", format: "binary" });
  });

  it("sending answers 202 and lists 400, 401, 403, 404, 413 and 503 as errors", () => {
    expect(Object.keys(send.responses).map(Number).sort((a, b) => a - b)).toEqual([202, 400, 401, 403, 404, 413, 500, 503]);
    expect(send.responses[413].content["application/json"].example.error.code).toBe("file_too_large");
  });

  it("the upload middleware is shown on the send route and nowhere else in the chat group", () => {
    expect(send.description).toMatch(/Middleware:\*\* upload:file/);
    expect(spec.paths["/chats/{id}/messages"].get.description).not.toMatch(/upload:file/);
  });

  it("every chat route needs a token and is for staff", () => {
    for (const [path, ops] of Object.entries<any>(spec.paths).filter(([p]) => p.startsWith("/chats"))) {
      for (const op of Object.values<any>(ops)) {
        expect(op["x-access"], path).toBe("staff");
        expect(op.security, path).toEqual([{ bearerAuth: [] }]);
      }
    }
  });

  it("the polling endpoint documents its limit and after parameters", () => {
    const names = spec.paths["/chats/{id}/messages"].get.parameters.map((p: { name: string }) => p.name);
    expect(names).toEqual(expect.arrayContaining(["id", "limit", "after"]));
  });

  it("the message and material views document the fields the worker fills in", () => {
    expect(spec.components.schemas.ChatMaterialView.properties.status.enum).toEqual(["UPLOADED", "EXTRACTED", "FAILED"]);
    expect(spec.components.schemas.ChatMessageView.properties.sources.nullable).toBe(true);
    expect(spec.components.schemas.ChatMessageView.properties.role.enum).toEqual(["USER", "ASSISTANT"]);
  });
});
