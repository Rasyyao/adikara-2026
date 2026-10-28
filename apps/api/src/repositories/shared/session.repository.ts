import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ParticipantRecord, SharedSessionRepository } from "../../types/shared/session.types.js";

type ParticipantRow = {
  studentId: string;
  joinedAt: Date;
  leftAt: Date | null;
  kickedAt: Date | null;
  student: { alias: string | null; username: string | null };
};

export const withStudent = { student: { select: { alias: true, username: true } } } as const;

export function toParticipant(row: ParticipantRow): ParticipantRecord {
  return {
    studentId: row.studentId,
    name: row.student.alias,
    username: row.student.username,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    kickedAt: row.kickedAt,
  };
}

/** Session reads and writes used by teachers, students and the event stream alike. */
export function createSharedSessionRepository(prisma: PrismaClient): SharedSessionRepository {
  return {
    async findSessionById(id) {
      return prisma.classSession.findUnique({ where: { id } });
    },

    async findChatSummary(chatId) {
      return prisma.chat.findUnique({ where: { id: chatId }, select: { id: true, teacherId: true, title: true } });
    },

    async updateSession(id, patch) {
      return prisma.classSession.update({ where: { id }, data: patch });
    },

    async listParticipants(sessionId) {
      const rows = await prisma.sessionParticipant.findMany({
        where: { sessionId },
        include: withStudent,
        orderBy: { joinedAt: "asc" },
      });
      return rows.map(toParticipant);
    },

    async findParticipant(sessionId, studentId) {
      const row = await prisma.sessionParticipant.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
        include: withStudent,
      });
      return row ? toParticipant(row) : null;
    },

    async updateParticipant(sessionId, studentId, patch) {
      const row = await prisma.sessionParticipant.update({
        where: { sessionId_studentId: { sessionId, studentId } },
        data: patch,
        include: withStudent,
      });
      return toParticipant(row);
    },
  };
}
