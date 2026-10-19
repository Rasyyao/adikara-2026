import type { AuthContext } from "../../src/types/auth.types.js";
import { createTokenService, type TokenService } from "../../src/lib/token.js";
import { TEST_SECRET } from "./config.js";

/** Callers used across middleware and route tests. */
export const ADMIN: AuthContext = { userId: "admin-1", role: "ADMIN", kind: "teacher" };
export const TEACHER: AuthContext = { userId: "teacher-1", role: "TEACHER", kind: "teacher" };
export const STUDENT: AuthContext = { userId: "student-1", role: "USER", kind: "student" };

export const testTokens: TokenService = createTokenService({ secret: TEST_SECRET, ttlSeconds: 60 });

export function bearer(context: AuthContext, tokens: TokenService = testTokens): string {
  return `Bearer ${tokens.sign(context)}`;
}
