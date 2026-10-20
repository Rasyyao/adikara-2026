export const ROLES = ["ADMIN", "TEACHER", "USER"] as const;
export type Role = (typeof ROLES)[number];

/** teacher = teachers table (roles ADMIN or TEACHER), student = students table (role USER). */
export type AccountKind = "teacher" | "student";

const KIND_ROLES: Record<AccountKind, readonly Role[]> = {
  teacher: ["ADMIN", "TEACHER"],
  student: ["USER"],
};

export function roleAllowedForKind(kind: AccountKind, role: Role): boolean {
  return KIND_ROLES[kind].includes(role);
}

export interface AccountRecord {
  id: string;
  role: Role;
  name: string | null;
  passwordHash: string | null;
}

export interface AuthContext {
  userId: string;
  role: Role;
  kind: AccountKind;
}
