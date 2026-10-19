import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../errors.js";

function body(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "not_found", "Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    res.status(err.status).json(body(err.code, err.message, err.details));
    return;
  }
  // body-parser errors
  if (err?.type === "entity.parse.failed") {
    res.status(400).json(body("invalid_json", "Request body is not valid JSON"));
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json(body("payload_too_large", "Request body is too large"));
    return;
  }

  console.error(err);
  res.status(500).json(body("internal_error", "Internal server error"));
};
