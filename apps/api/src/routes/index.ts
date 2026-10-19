import { Router } from "express";
import type { Config } from "../config/index.js";
import { createAccessGuards } from "../http/middleware/access.js";
import { createLoginLimiter } from "../http/middleware/rate-limit.js";
import type { AuthService } from "../services/auth.service.js";
import type { TokenService } from "../lib/token.js";
import { authRoutes } from "./auth.routes.js";
import { registerRoutes } from "./register.js";
import type { RouteGroup } from "./types.js";

export const API_PREFIX = "/api/v1";

export interface RouteDeps {
  authService: AuthService;
  limits: { login: ReturnType<typeof createLoginLimiter> };
}

export function createLimits(config: Pick<Config, "loginRateLimitMax" | "loginRateLimitWindowMinutes">) {
  return { login: createLoginLimiter(config) };
}

/** Every route of the API, grouped by feature. Add a feature's route group to the list below. */
export function createRouteGroups({ authService, limits }: RouteDeps): RouteGroup[] {
  return [
    authRoutes(authService, limits),
    // classRoutes(classService),
    // adminRoutes(adminService),
  ];
}

/** Express router for the groups; mounted at API_PREFIX by app.ts. */
export function createApiRouter(groups: RouteGroup[], tokens: TokenService): Router {
  return registerRoutes(
    Router(),
    createAccessGuards(tokens),
    groups.flatMap((group) => group.routes),
  );
}
