import type { PrismaClient } from "../../generated/prisma/client.js";
import type { StudentSessionRepository } from "../../types/student/session.types.js";
import { toParticipant, withStudent } from "../shared/session.repository.js";

export function createStudentSessionRepository(prisma: PrismaClient): StudentSessionRepository {
  return {
    async findStudentClassId(studentId) {
      const row = await prisma.student.findUnique({ where: { id: studentId }, select: { classId: true } });
      return row?.classId ?? null;
    },

    async findSessionByCode(code) {
      return prisma.classSession.findUnique({ where: { joinCode: code } });
    },

    async addParticipant(sessionId, studentId, joinedAt) {
      // upsert, so two tabs joining at the same moment still make one row
      const row = await prisma.sessionParticipant.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        update: {},
        create: { sessionId, studentId, joinedAt },
        include: withStudent,
      });
      return toParticipant(row);
    },
  };
}
