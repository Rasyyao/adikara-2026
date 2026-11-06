import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { AttemptRecord, ChoiceChange, QuizQuestion, QuizRecord, QuizRepository } from "../../types/shared/quiz.types.js";

export const attemptInclude = {
  student: { select: { alias: true, username: true } },
  responses: { orderBy: { questionId: "asc" } },
} as const;

type QuizRow = Prisma.SessionQuizGetPayload<object>;
type AttemptRow = Prisma.QuizAttemptGetPayload<{ include: typeof attemptInclude }>;

export function toQuiz(row: QuizRow): QuizRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    kind: row.kind,
    title: row.title,
    questions: row.questions as unknown as QuizQuestion[],
    status: row.status,
    sourceChatId: row.sourceChatId,
    sourceMessageId: row.sourceMessageId,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
  };
}

export function toAttempt(row: AttemptRow): AttemptRecord {
  return {
    id: row.id,
    quizId: row.quizId,
    studentId: row.studentId,
    studentName: row.student.alias,
    studentUsername: row.student.username,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    score: row.score,
    total: row.total,
    durationMs: row.durationMs,
    entry: row.entry,
    client: (row.client as Record<string, unknown> | null) ?? null,
    responses: row.responses.map((r) => ({
      questionId: r.questionId,
      choice: r.choice,
      firstChoice: r.firstChoice,
      isCorrect: r.isCorrect,
      timeMs: r.timeMs,
      visits: r.visits,
      changes: r.changes as unknown as ChoiceChange[],
      answerOrder: r.answerOrder,
      answeredAt: r.answeredAt,
    })),
  };
}

export function createQuizRepository(prisma: PrismaClient): QuizRepository {
  return {
    async createQuiz(data) {
      return toQuiz(await prisma.sessionQuiz.create({ data: { ...data, questions: data.questions as unknown as Prisma.InputJsonValue } }));
    },
    async findQuiz(id) {
      const row = await prisma.sessionQuiz.findUnique({ where: { id } });
      return row ? toQuiz(row) : null;
    },
    async listQuizzes(sessionId) {
      return (await prisma.sessionQuiz.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } })).map(toQuiz);
    },
    async closeQuiz(id, closedAt) {
      return toQuiz(await prisma.sessionQuiz.update({ where: { id }, data: { status: "CLOSED", closedAt } }));
    },
    async listAttempts(quizId) {
      return (await prisma.quizAttempt.findMany({ where: { quizId }, include: attemptInclude, orderBy: { startedAt: "asc" } })).map(toAttempt);
    },
    async findAttempt(quizId, studentId) {
      const row = await prisma.quizAttempt.findUnique({ where: { quizId_studentId: { quizId, studentId } }, include: attemptInclude });
      return row ? toAttempt(row) : null;
    },
    async startAttempt({ client, ...data }) {
      const row = await prisma.quizAttempt.upsert({
        where: { quizId_studentId: { quizId: data.quizId, studentId: data.studentId } },
        update: {},
        create: { ...data, client: (client ?? undefined) as Prisma.InputJsonValue | undefined },
        include: attemptInclude,
      });
      return toAttempt(row);
    },
    async saveResponse(attemptId, { changes, ...response }) {
      const json = changes as unknown as Prisma.InputJsonValue;
      await prisma.quizResponse.upsert({
        where: { attemptId_questionId: { attemptId, questionId: response.questionId } },
        update: { ...response, changes: json },
        create: { ...response, attemptId, changes: json },
      });
    },
    async finishAttempt(attemptId, data) {
      return toAttempt(await prisma.quizAttempt.update({ where: { id: attemptId }, data, include: attemptInclude }));
    },
  };
}
