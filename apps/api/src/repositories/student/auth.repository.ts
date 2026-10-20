import type { PrismaClient } from "../../generated/prisma/client.js";
import type { StudentAuthRepository } from "../../types/student/auth.types.js";

export function createStudentAuthRepository(prisma: PrismaClient): StudentAuthRepository {
  return {
    async findByUsername(username) {
      const row = await prisma.student.findUnique({ where: { username } });
      return row ? { id: row.id, role: row.role, name: row.alias, passwordHash: row.passwordHash } : null;
    },
  };
}
