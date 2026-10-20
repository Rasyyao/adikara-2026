import type { TeacherAuthRepository } from "../../types/teacher/auth.types.js";
import type { CredentialChecker, LoginResult } from "../shared/credentials.js";

/** Login for teachers and admins (one `teachers` table; the role in the result says which). */
export interface TeacherAuthService {
  login(email: string, password: string): Promise<LoginResult>;
}

export function createTeacherAuthService(repository: TeacherAuthRepository, credentials: CredentialChecker): TeacherAuthService {
  return {
    async login(email, password) {
      return credentials.login("teacher", await repository.findByEmail(email), password);
    },
  };
}
