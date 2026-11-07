import type { RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Config } from "../../config/index.js";
import { AppError } from "../errors.js";
import { labelled } from "./label.js";

/**
 * The account a login is for, lower-cased; empty when the body names none. Counting per IP alone would lock a whole class
 * out: a school's students share one IP, and every browser login reaches the API from the web server's own address.
 */
function loginAccount(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const { email, username } = body as Record<string, unknown>;
  const name = typeof email === "string" ? email : typeof username === "string" ? username : "";
  return name.trim().toLowerCase().slice(0, 200);
}

/** Limits login attempts per account and IP, so guessing one account's password is stopped. Each call creates its own counter. */
export function createLoginLimiter(
  config: Pick<Config, "loginRateLimitMax" | "loginRateLimitWindowMinutes">,
): RequestHandler {
  const limiter = rateLimit({
    windowMs: config.loginRateLimitWindowMinutes * 60 * 1000,
    limit: config.loginRateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}|${loginAccount(req.body)}`,
    handler: (_req, _res, next) =>
      next(new AppError(429, "too_many_requests", "Too many login attempts, try again later")),
  });
  return labelled("rate-limit:login", limiter);
}

/** Limits attempts to join a live session. Counted per student (the route is behind the student guard), per IP as a fallback. */
export function createJoinLimiter(
  config: Pick<Config, "joinRateLimitMax" | "joinRateLimitWindowMinutes">,
): RequestHandler {
  const limiter = rateLimit({
    windowMs: config.joinRateLimitWindowMinutes * 60 * 1000,
    limit: config.joinRateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip ?? ""),
    handler: (_req, _res, next) =>
      next(new AppError(429, "too_many_requests", "Too many join attempts, try again later")),
  });
  return labelled("rate-limit:join", limiter);
}
