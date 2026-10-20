import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ProfileRepository } from "../../types/shared/profile.types.js";

export function createProfileRepository(prisma: PrismaClient): ProfileRepository {
  return {
    async findTeacherById(id) {
      const row = await prisma.teacher.findUnique({ where: { id } });
      return row ? { id: row.id, role: row.role, name: row.name, passwordHash: row.passwordHash } : null;
    },
    async findStudentById(id) {
      const row = await prisma.student.findUnique({ where: { id } });
      return row ? { id: row.id, role: row.role, name: row.alias, passwordHash: row.passwordHash } : null;
    },
  };
}
