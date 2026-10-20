import { AppError } from "../../http/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import type { TokenService } from "../../lib/token.js";
import { roleAllowedForKind, type AccountKind, type AccountRecord, type Role } from "../../types/auth.types.js";

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

export function toPublicUser(account: AccountRecord): PublicUser {
  return { id: account.id, role: account.role, name: account.name };
}

export function invalidCredentials(): AppError {
  // One message for every failure so callers cannot tell which part was wrong.
  return new AppError(401, "invalid_credentials", "Invalid credentials");
}

/** The one password check behind every login, so teacher and student login cannot drift apart. */
export interface CredentialChecker {
  login(kind: AccountKind, account: AccountRecord | null, password: string): Promise<LoginResult>;
}

export async function createCredentialChecker(
  tokens: TokenService,
  options: { bcryptCost: number },
): Promise<CredentialChecker> {
  // Compared against when the account does not exist, so a miss costs the same as a wrong password.
  const dummyHash = await hashPassword("not-a-real-password", options.bcryptCost);

  return {
    async login(kind, account, password) {
      const passwordOk = await verifyPassword(password, account?.passwordHash ?? dummyHash);
      if (!account || !account.passwordHash || !passwordOk || !roleAllowedForKind(kind, account.role)) {
        throw invalidCredentials();
      }
      const access_token = tokens.sign({ userId: account.id, role: account.role, kind });
      return { access_token, token_type: "Bearer", expires_in: tokens.ttlSeconds, user: toPublicUser(account) };
    },
  };
}
