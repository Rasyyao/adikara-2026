import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { Config } from "../../config/index.js";
import { AppError } from "../errors.js";
import { labelled } from "./label.js";

/** Limits attempts per IP on login endpoints. Each call creates its own counter. */
export function createLoginLimiter(
  config: Pick<Config, "loginRateLimitMax" | "loginRateLimitWindowMinutes">,
): RequestHandler {
  const limiter = rateLimit({
    windowMs: config.loginRateLimitWindowMinutes * 60 * 1000,
    limit: config.loginRateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, "too_many_requests", "Too many login attempts, try again later")),
  });
  return labelled("rate-limit:login", limiter);
}
