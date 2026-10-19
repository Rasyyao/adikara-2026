import type { RequestHandler } from "express";
import type { TokenService } from "../../lib/token.js";
import { authenticate } from "./authenticate.js";
import { requireRole } from "./require-role.js";

/**
 * Who may call a route. Routes declare one of these instead of wiring middleware themselves.
 *
 * public         anyone, no token
 * authenticated  any logged-in account (admin, teacher or student)
 * student        students only (role USER)
 * staff          teachers and admins
 * admin          admins only
 */
export type Access = "public" | "authenticated" | "student" | "staff" | "admin";

export type AccessGuards = Record<Access, RequestHandler[]>;

const allowAnyone: RequestHandler = (_req, _res, next) => next();

export function createAccessGuards(tokens: TokenService): AccessGuards {
  const authenticated = authenticate(tokens);
  return {
    public: [allowAnyone],
    authenticated: [authenticated],
    student: [authenticated, requireRole("USER")],
    staff: [authenticated, requireRole("ADMIN", "TEACHER")],
    admin: [authenticated, requireRole("ADMIN")],
  };
}
