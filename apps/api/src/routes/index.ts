import { Router } from "express";
import type { Config } from "../config/index.js";
import { createAccessGuards } from "../http/middleware/access.js";
import { createLoginLimiter } from "../http/middleware/rate-limit.js";
import { authRoutes } from "./auth.routes.js";
import type { AuthService } from "../services/auth.service.js";
import type { TokenService } from "../lib/token.js";
import { registerRoutes } from "./register.js";

export interface RouteDeps {
  config: Config;
  tokens: TokenService;
  authService: AuthService;
}

/** Every API route, mounted under /api/v1 by app.ts. Add new module route lists to `routes` below. */
export function createRoutes({ config, tokens, authService }: RouteDeps): Router {
  const access = createAccessGuards(tokens);
  const limits = { login: createLoginLimiter(config) };

  return registerRoutes(Router(), access, [
    ...authRoutes(authService, limits),
    // ...classRoutes(classService),
    // ...adminRoutes(adminService),
  ]);
}
