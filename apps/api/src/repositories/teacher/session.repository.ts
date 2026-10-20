import type { PrismaClient } from "../../generated/prisma/client.js";
import type { TeacherSessionRepository } from "../../types/teacher/session.types.js";
import { isUniqueViolation } from "../prisma-errors.js";

export function createTeacherSessionRepository(prisma: PrismaClient): TeacherSessionRepository {
  return {
    async findClassroomByCode(classCode) {
      const row = await prisma.classroom.findUnique({ where: { classCode } });
      if (!row) return null;
      return { id: row.id, teacherId: row.teacherId, name: row.name, classCode: row.classCode, archived: row.archivedAt !== null };
    },

    async listClassStudents(classId) {
      const rows = await prisma.student.findMany({
        where: { classId },
        select: { id: true, alias: true, username: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({ id: row.id, name: row.alias, username: row.username }));
    },

    async findOpenSessionByClass(classId) {
      return prisma.classSession.findFirst({
        where: { classId, status: { not: "ENDED" } },
        orderBy: { createdAt: "desc" },
      });
    },

    async createSession(data) {
      try {
        return await prisma.classSession.create({ data });
      } catch (err) {
        if (isUniqueViolation(err)) return null; // PIN already taken by another open session
        throw err;
      }
    },
  };
}
