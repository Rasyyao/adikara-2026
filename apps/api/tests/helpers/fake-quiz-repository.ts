import { randomUUID } from "node:crypto";
import type { AttemptRecord, QuizRecord, QuizRepository } from "../../src/types/shared/quiz.types.js";

/** The quiz tables in memory. `studentOf` gives a student's alias and username, like the join in the real repository. */
export function createFakeQuizRepository(studentOf: (id: string) => { name: string | null; username: string | null } | undefined): QuizRepository {
  const quizzes = new Map<string, QuizRecord>();
  const attempts = new Map<string, Omit<AttemptRecord, "studentName" | "studentUsername">>();
  const withStudent = (a: Omit<AttemptRecord, "studentName" | "studentUsername">): AttemptRecord => ({
    ...a,
    studentName: studentOf(a.studentId)?.name ?? null,
    studentUsername: studentOf(a.studentId)?.username ?? null,
    responses: [...a.responses].sort((x, y) => x.questionId - y.questionId),
  });
  const attemptOf = (quizId: string, studentId: string) => [...attempts.values()].find((a) => a.quizId === quizId && a.studentId === studentId);
  let clock = 0; // keeps "oldest first" stable when two rows are made in the same millisecond

  return {
    async createQuiz(data) {
      const now = new Date(Date.now() + clock++);
      const quiz: QuizRecord = { id: randomUUID(), status: "OPEN", openedAt: now, closedAt: null, createdAt: now, ...data };
      quizzes.set(quiz.id, quiz);
      return quiz;
    },
    async findQuiz(id) {
      return quizzes.get(id) ?? null;
    },
    async listQuizzes(sessionId) {
      return [...quizzes.values()].filter((q) => q.sessionId === sessionId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    async closeQuiz(id, closedAt) {
      const quiz = { ...quizzes.get(id)!, status: "CLOSED" as const, closedAt };
      quizzes.set(id, quiz);
      return quiz;
    },
    async listAttempts(quizId) {
      return [...attempts.values()].filter((a) => a.quizId === quizId).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()).map(withStudent);
    },
    async findAttempt(quizId, studentId) {
      const found = attemptOf(quizId, studentId);
      return found ? withStudent(found) : null;
    },
    async startAttempt(data) {
      const existing = attemptOf(data.quizId, data.studentId);
      if (existing) return withStudent(existing);
      const attempt = { id: randomUUID(), startedAt: new Date(Date.now() + clock++), submittedAt: null, score: null, durationMs: null, responses: [], ...data };
      attempts.set(attempt.id, attempt);
      return withStudent(attempt);
    },
    async saveResponse(attemptId, response) {
      const attempt = attempts.get(attemptId)!;
      const others = attempt.responses.filter((r) => r.questionId !== response.questionId);
      attempt.responses = [...others, { ...response, answeredAt: new Date() }];
    },
    async finishAttempt(attemptId, data) {
      const attempt = { ...attempts.get(attemptId)!, ...data };
      attempts.set(attemptId, attempt);
      return withStudent(attempt);
    },
  };
}
