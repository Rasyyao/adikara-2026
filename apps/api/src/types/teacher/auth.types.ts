import type { AccountRecord } from "../auth.types.js";

/** Login of teachers and admins (both live in the `teachers` table). */
export interface TeacherAuthRepository {
  findByEmail(email: string): Promise<AccountRecord | null>;
}
