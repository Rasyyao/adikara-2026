import type { AuthService } from "../services/auth.service.js";
import { createLimits, createRouteGroups } from "../routes/index.js";
import type { RouteGroup } from "../routes/types.js";

const unavailable = async (): Promise<never> => {
  throw new Error("not available in tooling mode");
};

/** The real route table with inert services, for the route list and the OpenAPI export. No database or env needed. */
export function loadRouteGroupsForTooling(): RouteGroup[] {
  const authService: AuthService = { loginTeacher: unavailable, loginStudent: unavailable, getProfile: unavailable };
  return createRouteGroups({
    authService,
    limits: createLimits({ loginRateLimitMax: 10, loginRateLimitWindowMinutes: 15 }),
  });
}
