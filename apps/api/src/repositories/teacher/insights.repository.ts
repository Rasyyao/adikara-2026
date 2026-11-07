import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ClassReportRecord, ReportStatus, TeacherInsightsRepository } from "../../types/teacher/insights.types.js";

const toReport = (row: { id: string; classId: string; teacherId: string; status: string; input: unknown; feedback: unknown; error: string | null; createdAt: Date; finishedAt: Date | null }): ClassReportRecord => ({
  ...row,
  status: row.status as ReportStatus,
});
import { attemptInclude, toAttempt, toQuiz } from "../shared/quiz.repository.js";

export function createTeacherInsightsRepository(prisma: PrismaClient): TeacherInsightsRepository {
  return {
    async loadActivity(teacherId, sessionLimit, classId) {
      const owner = { ...(teacherId ? { teacherId } : {}), ...(classId ? { classId } : {}) };
      const classFilter = { ...(teacherId ? { teacherId } : {}), ...(classId ? { id: classId } : { archivedAt: null }) };
      const [classes, sessions] = await Promise.all([
        prisma.classroom.findMany({
          where: classFilter,
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
    async findClass(classId) {
      return prisma.classroom.findUnique({ where: { id: classId }, select: { id: true, teacherId: true, name: true } });
    },
    async listRoster(classId) {
      const rows = await prisma.student.findMany({ where: { classId }, select: { id: true, alias: true, username: true }, orderBy: [{ alias: "asc" }, { username: "asc" }] });
      return rows.map((r) => ({ id: r.id, name: r.alias, username: r.username }));
    },
    async createReport({ classId, teacherId, input }) {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.classReport.create({ data: { classId, teacherId, input: input as object } });
        await tx.job.create({ data: { type: "GENERATE_REPORT", payload: { reportId: created.id, classId } } });
        return created;
      });
      // after the commit: a NOTIFY sent earlier would wake the worker before the rows are visible
      await prisma.$executeRaw`SELECT pg_notify('jobs', '')`;
      return toReport(row);
    },
    async latestReport(classId) {
      const row = await prisma.classReport.findFirst({ where: { classId }, orderBy: { createdAt: "desc" } });
      return row ? toReport(row) : null;
    },
  };
}
