import type { RouteDefinition } from "../../src/routes/types.js";

/** Adds the required docs block so tests can declare routes without it. */
export function route(definition: Omit<RouteDefinition, "doc">): RouteDefinition {
  return { ...definition, doc: { summary: "test route", responses: { 200: { description: "ok" } } } };
}
