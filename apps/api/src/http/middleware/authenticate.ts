import type { Request, RequestHandler } from "express";
import type { AuthContext } from "../../types/auth.types.js";
import type { TokenService } from "../../lib/token.js";
import { AppError } from "../errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by authenticate(). Read it with requireAuth(req) in handlers. */
      auth?: AuthContext;
    }
  }
}

/** Returns the token from `Authorization: Bearer <token>`, or null when the header is absent or malformed. */
export function extractBearerToken(header: string | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

/** Verifies the bearer token and sets req.auth. Responds 401 otherwise. */
export function authenticate(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    res.setHeader("WWW-Authenticate", 'Bearer realm="adikara"');

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      next(new AppError(401, "unauthenticated", "Authentication required"));
      return;
    }
    try {
      req.auth = tokens.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** For handlers behind authenticate(): returns req.auth or throws 401, so no `!` is needed. */
export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new AppError(401, "unauthenticated", "Authentication required");
  return req.auth;
}
