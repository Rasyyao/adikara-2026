import type { StudentAuthRepository } from "../../types/student/auth.types.js";
import type { CredentialChecker, LoginResult } from "../shared/credentials.js";

export interface StudentAuthService {
  login(username: string, password: string): Promise<LoginResult>;
}

export function createStudentAuthService(repository: StudentAuthRepository, credentials: CredentialChecker): StudentAuthService {
  return {
    async login(username, password) {
      return credentials.login("student", await repository.findByUsername(username), password);
    },
  };
}
