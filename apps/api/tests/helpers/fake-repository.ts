import { hashPassword } from "../../src/lib/password.js";
import type { AccountRecord, AuthRepository, Role } from "../../src/types/auth.types.js";

export const PASSWORDS = {
  admin: "Admin-pass-1",
  teacher: "Teacher-pass-1",
  student: "Student-pass-1",
} as const;

export const IDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  teacher: "00000000-0000-4000-8000-000000000002",
  student: "00000000-0000-4000-8000-000000000003",
  studentNoPassword: "00000000-0000-4000-8000-000000000004",
} as const;

export interface FakeRepository extends AuthRepository {
  teachersById: Map<string, AccountRecord>;
  studentsById: Map<string, AccountRecord>;
}

/** In-memory repository seeded with an admin, a teacher and two students. */
export async function createFakeRepository(): Promise<FakeRepository> {
  const account = async (id: string, role: Role, name: string, password: string | null): Promise<AccountRecord> => ({
    id,
    role,
    name,
    passwordHash: password ? await hashPassword(password, 4) : null,
  });

  const teachersByEmail = new Map<string, AccountRecord>([
    ["admin@example.com", await account(IDS.admin, "ADMIN", "Admin", PASSWORDS.admin)],
    ["teacher@example.com", await account(IDS.teacher, "TEACHER", "Bu Guru", PASSWORDS.teacher)],
  ]);
  const studentsByUsername = new Map<string, AccountRecord>([
    ["siswa.satu", await account(IDS.student, "USER", "Siswa Satu", PASSWORDS.student)],
    ["siswa.anon", await account(IDS.studentNoPassword, "USER", "Anon", null)],
  ]);

  const teachersById = new Map([...teachersByEmail.values()].map((a) => [a.id, a]));
  const studentsById = new Map([...studentsByUsername.values()].map((a) => [a.id, a]));

  return {
    teachersById,
    studentsById,
    async findTeacherByEmail(email) {
      return teachersByEmail.get(email) ?? null;
    },
    async findStudentByUsername(username) {
      return studentsByUsername.get(username) ?? null;
    },
    async findTeacherById(id) {
      return teachersById.get(id) ?? null;
    },
    async findStudentById(id) {
      return studentsById.get(id) ?? null;
    },
  };
}
