import type { Router } from "express";
import type { AccessGuards } from "../http/middleware/access.js";
import type { RouteDefinition } from "./types.js";

/** Mounts route definitions; the access guard always runs first, then the route's own middleware. */
export function registerRoutes(router: Router, access: AccessGuards, routes: RouteDefinition[]): Router {
  for (const route of routes) {
    router[route.method](route.path, ...access[route.access], ...(route.middleware ?? []), route.handler);
  }
  return router;
}
