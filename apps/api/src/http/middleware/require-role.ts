import type { RequestHandler } from "express";
import type { Role } from "../../types/auth.types.js";
import { AppError } from "../errors.js";

/** Allows only the listed roles. Must run after authenticate(); fails closed with 401 if it did not. */
export function requireRole(...roles: Role[]): RequestHandler {
  if (roles.length === 0) throw new Error("requireRole() needs at least one role");

  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(401, "unauthenticated", "Authentication required"));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, "forbidden", "You do not have access to this resource"));
      return;
    }
    next();
  };
}
