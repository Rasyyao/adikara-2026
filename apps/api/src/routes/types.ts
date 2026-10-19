import type { RequestHandler } from "express";
import type { Access } from "../http/middleware/access.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** JSON Schema / OpenAPI schema object. */
export type SchemaObject = Record<string, unknown>;

export interface ResponseDoc {
  description: string;
  schema?: SchemaObject;
  example?: unknown;
}

/**
 * What the API docs say about a route. Standard errors are added automatically:
 * 400 when there is a request body, 401/403 from the access type, 429 for rate-limited routes, 500 always.
 * List a status here only for success responses or to override a standard one.
 */
export interface RouteDoc {
  summary: string;
  description?: string;
  requestBody?: { description?: string; schema: SchemaObject; example?: unknown };
  responses: Record<number, ResponseDoc>;
}

/** One endpoint. `access` picks the auth middleware; `middleware` is for extras such as rate limits. */
export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  access: Access;
  middleware?: RequestHandler[];
  handler: RequestHandler;
  doc: RouteDoc;
}

/** All routes of one feature (auth, classes, ...). The feature name is the group in the route list and the docs. */
export interface RouteGroup {
  feature: string;
  description: string;
  routes: RouteDefinition[];
}
