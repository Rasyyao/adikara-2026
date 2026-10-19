import jwt from "jsonwebtoken";
import { AppError } from "../http/errors.js";
import { ROLES, roleAllowedForKind, type AccountKind, type AuthContext, type Role } from "../types/auth.types.js";

const ISSUER = "adikara-api";
const AUDIENCE = "adikara-web";
const ALGORITHM = "HS256";

export interface TokenService {
  ttlSeconds: number;
  sign(context: AuthContext): string;
  verify(token: string): AuthContext;
}

function invalidToken(): AppError {
  return new AppError(401, "invalid_token", "Invalid or expired token");
}

export function createTokenService(options: { secret: string; ttlSeconds: number }): TokenService {
  const { secret, ttlSeconds } = options;

  return {
    ttlSeconds,

    sign({ userId, role, kind }) {
      return jwt.sign({ role, kind }, secret, {
        algorithm: ALGORITHM,
        subject: userId,
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: ttlSeconds,
      });
    },

    verify(token) {
      let payload: jwt.JwtPayload;
      try {
        const decoded = jwt.verify(token, secret, {
          algorithms: [ALGORITHM],
          issuer: ISSUER,
          audience: AUDIENCE,
        });
        if (typeof decoded === "string") throw invalidToken();
        payload = decoded;
      } catch {
        throw invalidToken();
      }

      const { sub, role, kind } = payload;
      if (
        typeof sub !== "string" ||
        !ROLES.includes(role as Role) ||
        (kind !== "teacher" && kind !== "student") ||
        !roleAllowedForKind(kind as AccountKind, role as Role)
      ) {
        throw invalidToken();
      }
      return { userId: sub, role: role as Role, kind: kind as AccountKind };
    },
  };
}
