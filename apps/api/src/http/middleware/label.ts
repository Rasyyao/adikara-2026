import type { RequestHandler } from "express";

export type LabelledHandler = RequestHandler & { label?: string };

/** Gives a middleware a readable name for the route list and the API docs. */
export function labelled(label: string, handler: RequestHandler): LabelledHandler {
  return Object.assign(handler, { label });
}

export function labelOf(handler: RequestHandler): string {
  return (handler as LabelledHandler).label ?? (handler.name || "middleware");
}
