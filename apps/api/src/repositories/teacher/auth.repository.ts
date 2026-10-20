import type { PrismaClient } from "../../generated/prisma/client.js";
import type { TeacherAuthRepository } from "../../types/teacher/auth.types.js";

export function createTeacherAuthRepository(prisma: PrismaClient): TeacherAuthRepository {
  return {
    async findByEmail(email) {
      const row = await prisma.teacher.findUnique({ where: { email } });
      return row ? { id: row.id, role: row.role, name: row.name, passwordHash: row.passwordHash } : null;
    },
  };
}
