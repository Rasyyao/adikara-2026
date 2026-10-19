import type { RequestHandler } from "express";
import type { Access } from "../http/middleware/access.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** One endpoint. `access` picks the auth middleware; `middleware` is for extras such as rate limits. */
export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  access: Access;
  middleware?: RequestHandler[];
  handler: RequestHandler;
}
