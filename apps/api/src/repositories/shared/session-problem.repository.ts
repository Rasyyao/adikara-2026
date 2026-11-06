import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { ProblemAttemptRecord, SessionProblemRecord, SessionProblemRepository } from "../../types/shared/session-problem.types.js";

const attemptInclude = { student: { select: { alias: true, username: true } } } as const;
type ProblemRow = Prisma.SessionProblemGetPayload<object>;
type AttemptRow = Prisma.ProblemAttemptGetPayload<{ include: typeof attemptInclude }>;

const toProblem = (row: ProblemRow): SessionProblemRecord => ({
  id: row.id,
  sessionId: row.sessionId,
  problemId: row.problemId,
  title: row.title,
  story: row.story,
  challenge: row.challenge,
  status: row.status,
  openedAt: row.openedAt,
  closedAt: row.closedAt,
});

const toAttempt = (row: AttemptRow): ProblemAttemptRecord => ({
  id: row.id,
  problemId: row.problemId,
  studentId: row.studentId,
  studentName: row.student.alias,
  studentUsername: row.student.username,
  startedAt: row.startedAt,
  updatedAt: row.updatedAt,
  solvedAt: row.solvedAt,
  solvedWith: row.solvedWith === "blocks" || row.solvedWith === "code" ? row.solvedWith : null,
  blockChecks: row.blockChecks,
  blockAnswer: row.blockAnswer,
  codeRuns: row.codeRuns,
  code: row.code,
  codePassed: row.codePassed,
  codeTotal: row.codeTotal,
});

export function createSessionProblemRepository(prisma: PrismaClient): SessionProblemRepository {
  return {
    async create(data) {
      return toProblem(await prisma.sessionProblem.create({ data: { ...data, challenge: data.challenge as Prisma.InputJsonValue } }));
    },
    async find(id) {
      const row = await prisma.sessionProblem.findUnique({ where: { id } });
      return row ? toProblem(row) : null;
    },
    async list(sessionId) {
      return (await prisma.sessionProblem.findMany({ where: { sessionId }, orderBy: { openedAt: "asc" } })).map(toProblem);
    },
    async close(id, closedAt) {
      return toProblem(await prisma.sessionProblem.update({ where: { id }, data: { status: "CLOSED", closedAt } }));
    },
    async listAttempts(problemId) {
      return (await prisma.problemAttempt.findMany({ where: { problemId }, include: attemptInclude, orderBy: { startedAt: "asc" } })).map(toAttempt);
    },
    async findAttempt(problemId, studentId) {
      const row = await prisma.problemAttempt.findUnique({ where: { problemId_studentId: { problemId, studentId } }, include: attemptInclude });
      return row ? toAttempt(row) : null;
    },
    async startAttempt(problemId, studentId) {
      const row = await prisma.problemAttempt.upsert({
        where: { problemId_studentId: { problemId, studentId } },
        update: {},
        create: { problemId, studentId },
        include: attemptInclude,
      });
      return toAttempt(row);
    },
    async updateAttempt(id, { blockAnswer, ...changes }) {
      const row = await prisma.problemAttempt.update({
        where: { id },
        include: attemptInclude,
        data: { ...changes, ...(blockAnswer !== undefined ? { blockAnswer: blockAnswer as Prisma.InputJsonValue } : {}) },
      });
      return toAttempt(row);
    },
  };
}
