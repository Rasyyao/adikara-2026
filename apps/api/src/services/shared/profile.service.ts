import { AppError } from "../../http/errors.js";
import { roleAllowedForKind, type AuthContext } from "../../types/auth.types.js";
import type { ProfileRepository } from "../../types/shared/profile.types.js";
import { toPublicUser, type PublicUser } from "./credentials.js";

export interface ProfileService {
  getProfile(context: AuthContext): Promise<PublicUser>;
}

export function createProfileService(repository: ProfileRepository): ProfileService {
  return {
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
