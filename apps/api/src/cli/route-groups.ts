import { createLimits, createRouteGroups } from "../routes/index.js";
import type { RouteGroup } from "../routes/types.js";
import type { Services } from "../services/index.js";

/** Throws when called. Every method of every service is one of these. */
function inert<T extends object>(): T {
  return new Proxy({} as T, {
    get: () => async () => {
      throw new Error("not available in tooling mode");
    },
  });
}

/** The real route table with inert services, for the route list and the OpenAPI export. No database or env needed. */
export function loadRouteGroupsForTooling(): RouteGroup[] {
  const services: Services = {
    admin: { teachers: inert(), students: inert(), classes: inert() },
    teacher: { auth: inert(), sessions: inert(), classes: inert() },
    student: { auth: inert(), sessions: inert() },
    shared: { profile: inert(), sessionStream: inert() },
  };
  return createRouteGroups(
    services,
    createLimits({
      loginRateLimitMax: 10,
      loginRateLimitWindowMinutes: 15,
      joinRateLimitMax: 10,
      joinRateLimitWindowMinutes: 1,
    }),
  );
}
