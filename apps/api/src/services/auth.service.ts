import { AppError } from "../http/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import type { TokenService } from "../lib/token.js";
import {
  roleAllowedForKind,
  type AccountKind,
  type AccountRecord,
  type AuthContext,
  type AuthRepository,
  type Role,
} from "../types/auth.types.js";

export interface PublicUser {
  id: string;
  role: Role;
  name: string | null;
}

export interface LoginResult {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: PublicUser;
}

export interface AuthService {
  loginTeacher(email: string, password: string): Promise<LoginResult>;
  loginStudent(username: string, password: string): Promise<LoginResult>;
  getProfile(context: AuthContext): Promise<PublicUser>;
}

function invalidCredentials(): AppError {
  // One message for every failure so callers cannot tell which part was wrong.
  return new AppError(401, "invalid_credentials", "Invalid credentials");
}

function toPublicUser(account: AccountRecord): PublicUser {
  return { id: account.id, role: account.role, name: account.name };
}

export async function createAuthService(
  repository: AuthRepository,
  tokens: TokenService,
  options: { bcryptCost: number },
): Promise<AuthService> {
  // Compared against when the account does not exist, so a miss costs the same as a wrong password.
  const dummyHash = await hashPassword("not-a-real-password", options.bcryptCost);

  async function login(kind: AccountKind, account: AccountRecord | null, password: string): Promise<LoginResult> {
    const passwordOk = await verifyPassword(password, account?.passwordHash ?? dummyHash);
    if (!account || !account.passwordHash || !passwordOk || !roleAllowedForKind(kind, account.role)) {
      throw invalidCredentials();
    }
    const access_token = tokens.sign({ userId: account.id, role: account.role, kind });
    return { access_token, token_type: "Bearer", expires_in: tokens.ttlSeconds, user: toPublicUser(account) };
  }

  return {
    async loginTeacher(email, password) {
      return login("teacher", await repository.findTeacherByEmail(email), password);
    },

    async loginStudent(username, password) {
      return login("student", await repository.findStudentByUsername(username), password);
    },

    async getProfile({ userId, kind }) {
      const account =
        kind === "teacher" ? await repository.findTeacherById(userId) : await repository.findStudentById(userId);
      if (!account || !roleAllowedForKind(kind, account.role)) {
        throw new AppError(401, "invalid_token", "Invalid or expired token");
      }
      return toPublicUser(account);
    },
  };
}
