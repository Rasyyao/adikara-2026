import type { AccountRecord } from "../auth.types.js";

export interface StudentAuthRepository {
  findByUsername(username: string): Promise<AccountRecord | null>;
}
