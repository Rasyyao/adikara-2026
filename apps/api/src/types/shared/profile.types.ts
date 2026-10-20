import type { AccountRecord } from "../auth.types.js";

/** Reads the current account behind a token, for any role. */
export interface ProfileRepository {
  findTeacherById(id: string): Promise<AccountRecord | null>;
  findStudentById(id: string): Promise<AccountRecord | null>;
}
