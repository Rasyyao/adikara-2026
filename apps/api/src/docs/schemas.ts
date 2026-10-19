import type { SchemaObject } from "../routes/types.js";

export const ref = (name: keyof typeof schemas): SchemaObject => ({ $ref: `#/components/schemas/${name}` });

/** Shared response/request shapes. Keep in sync with the service return types. */
export const schemas = {
  ErrorResponse: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string", example: "validation_error" },
          message: { type: "string", example: "Request validation failed" },
          details: { type: "object", additionalProperties: true },
        },
      },
    },
  },
  PublicUser: {
    type: "object",
    required: ["id", "role", "name"],
    properties: {
      id: { type: "string", format: "uuid" },
      role: { type: "string", enum: ["ADMIN", "TEACHER", "USER"] },
      name: { type: "string", nullable: true },
    },
  },
  LoginResult: {
    type: "object",
    required: ["access_token", "token_type", "expires_in", "user"],
    properties: {
      access_token: { type: "string", description: "JWT. Send as `Authorization: Bearer <token>`." },
      token_type: { type: "string", enum: ["Bearer"] },
      expires_in: { type: "integer", description: "Lifetime in seconds.", example: 3600 },
      user: { $ref: "#/components/schemas/PublicUser" },
    },
  },
  TeacherLoginRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
      password: { type: "string", maxLength: 72, format: "password" },
    },
  },
  StudentLoginRequest: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string", pattern: "^[a-z0-9_.-]{3,32}$", description: "Case-insensitive." },
      password: { type: "string", maxLength: 72, format: "password" },
    },
  },
  MeResponse: {
    type: "object",
    required: ["user"],
    properties: { user: { $ref: "#/components/schemas/PublicUser" } },
  },
} as const satisfies Record<string, SchemaObject>;
