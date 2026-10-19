import type { PrismaClient } from "../generated/prisma/client.js";
import type { AccountRecord, AuthRepository } from "../types/auth.types.js";

export function createAuthRepository(prisma: PrismaClient): AuthRepository {
  const teacher = (row: { id: string; role: AccountRecord["role"]; name: string; passwordHash: string } | null) =>
    row ? { id: row.id, role: row.role, name: row.name, passwordHash: row.passwordHash } : null;
  const student = (row: { id: string; role: AccountRecord["role"]; alias: string | null; passwordHash: string | null } | null) =>
    row ? { id: row.id, role: row.role, name: row.alias, passwordHash: row.passwordHash } : null;

  return {
    async findTeacherByEmail(email) {
      return teacher(await prisma.teacher.findUnique({ where: { email } }));
    },
    async findStudentByUsername(username) {
      return student(await prisma.student.findUnique({ where: { username } }));
    },
    async findTeacherById(id) {
      return teacher(await prisma.teacher.findUnique({ where: { id } }));
    },
    async findStudentById(id) {
      return student(await prisma.student.findUnique({ where: { id } }));
    },
  };
}
