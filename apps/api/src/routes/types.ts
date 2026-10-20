import type { RequestHandler } from "express";
import type { Access } from "../http/middleware/access.js";

/**
 * Who owns a group of routes, and so which folder its route, service and repository files live in:
 * admin (admin-only), teacher (teachers and admins), student, or shared (used by more than one role).
 */
export type RouteRole = "admin" | "teacher" | "student" | "shared";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** JSON Schema / OpenAPI schema object. */
export type SchemaObject = Record<string, unknown>;

export interface ResponseDoc {
  description: string;
  schema?: SchemaObject;
  example?: unknown;
  /** Defaults to application/json. Use text/event-stream for streams. */
  contentType?: string;
}

/**
 * What the API docs say about a route. Standard errors are added automatically:
 * 400 when there is a request body, a query or a path parameter, 401/403 from the access type, 429 for rate-limited routes, 500 always.
 * List a status here only for success responses or to override a standard one.
 */
export interface RouteDoc {
  summary: string;
  description?: string;
  requestBody?: { description?: string; schema: SchemaObject; example?: unknown };
  /** Query string parameters, e.g. filters and paging of a list. */
  query?: { name: string; description?: string; schema: SchemaObject }[];
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

/** All routes of one feature of one role (e.g. teacher/sessions). Role + feature is the group in the route list and the docs. */
export interface RouteGroup {
  role: RouteRole;
  feature: string;
  description: string;
  routes: RouteDefinition[];
}
