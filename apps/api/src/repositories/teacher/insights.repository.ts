import type { PrismaClient } from "../../generated/prisma/client.js";
import type { TeacherInsightsRepository } from "../../types/teacher/insights.types.js";
import { attemptInclude, toAttempt, toQuiz } from "../shared/quiz.repository.js";

export function createTeacherInsightsRepository(prisma: PrismaClient): TeacherInsightsRepository {
  return {
    async loadActivity(teacherId, sessionLimit) {
      const owner = teacherId ? { teacherId } : {};
      const [classes, sessions] = await Promise.all([
        prisma.classroom.findMany({
          where: { ...owner, archivedAt: null },
          select: { id: true, name: true, _count: { select: { students: true } } },
          orderBy: { name: "asc" },
        }),
        prisma.classSession.findMany({
          where: owner,
          orderBy: { createdAt: "desc" },
          take: sessionLimit,
          select: {
            id: true,
            classId: true,
            status: true,
            startedAt: true,
            endedAt: true,
            createdAt: true,
            chat: { select: { id: true, title: true } },
            participants: { where: { kickedAt: null }, select: { studentId: true, student: { select: { alias: true, username: true } } } },
          },
        }),
      ]);
      const quizzes = sessions.length
        ? await prisma.sessionQuiz.findMany({
            where: { sessionId: { in: sessions.map((s) => s.id) } },
            orderBy: { createdAt: "asc" },
            include: { attempts: { include: attemptInclude, orderBy: { startedAt: "asc" } } },
          })
        : [];
      return {
        classes: classes.map((c) => ({ id: c.id, name: c.name, studentCount: c._count.students })),
        sessions: sessions.map((s) => ({
          id: s.id,
          classId: s.classId,
          status: s.status,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          createdAt: s.createdAt,
          materialId: s.chat?.id ?? null,
          materialTitle: s.chat?.title ?? null,
          participants: s.participants.map((p) => ({ studentId: p.studentId, name: p.student.alias, username: p.student.username })),
        })),
        quizzes: quizzes.map(({ attempts, ...quiz }) => ({ quiz: toQuiz(quiz), attempts: attempts.map(toAttempt) })),
      };
    },
  };
}
