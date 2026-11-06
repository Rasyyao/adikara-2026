import { randomUUID } from "node:crypto";
import type { ProblemAttemptRecord, SessionProblemRecord, SessionProblemRepository } from "../../src/types/shared/session-problem.types.js";

type AttemptRow = Omit<ProblemAttemptRecord, "studentName" | "studentUsername">;

/** Problems sent to sessions, in memory, with the same rules as the Prisma repository. */
export function createFakeSessionProblemRepository(studentOf: (id: string) => { name: string | null; username: string | null } | undefined): SessionProblemRepository {
  const problems = new Map<string, SessionProblemRecord>();
  const attempts = new Map<string, AttemptRow>();
  let clock = Date.UTC(2026, 10, 1);
  const tick = () => new Date((clock += 1000));
  const withStudent = (a: AttemptRow): ProblemAttemptRecord => ({ ...structuredClone(a), studentName: studentOf(a.studentId)?.name ?? null, studentUsername: studentOf(a.studentId)?.username ?? null });
  const findRow = (problemId: string, studentId: string) => [...attempts.values()].find((a) => a.problemId === problemId && a.studentId === studentId);

  return {
    async create(data) {
      const row: SessionProblemRecord = { id: randomUUID(), status: "OPEN", openedAt: tick(), closedAt: null, ...data, challenge: structuredClone(data.challenge) };
      problems.set(row.id, row);
      return structuredClone(row);
    },
    async find(id) {
      const row = problems.get(id);
      return row ? structuredClone(row) : null;
    },
    async list(sessionId) {
      return [...problems.values()].filter((p) => p.sessionId === sessionId).sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime()).map((p) => structuredClone(p));
    },
    async close(id, closedAt) {
      const row = problems.get(id)!;
      Object.assign(row, { status: "CLOSED", closedAt });
      return structuredClone(row);
    },
    async listAttempts(problemId) {
      return [...attempts.values()].filter((a) => a.problemId === problemId).map(withStudent);
    },
    async findAttempt(problemId, studentId) {
      const row = findRow(problemId, studentId);
      return row ? withStudent(row) : null;
    },
    async startAttempt(problemId, studentId) {
      const existing = findRow(problemId, studentId);
      if (existing) return withStudent(existing);
      const now = tick();
      const row: AttemptRow = {
        id: randomUUID(),
        problemId,
        studentId,
        startedAt: now,
        updatedAt: now,
        solvedAt: null,
        solvedWith: null,
        blockChecks: 0,
        blockAnswer: null,
        codeRuns: 0,
        code: null,
        codePassed: null,
        codeTotal: null,
      };
      attempts.set(row.id, row);
      return withStudent(row);
    },
    async updateAttempt(id, changes) {
      const row = attempts.get(id)!;
      Object.assign(row, structuredClone(changes), { updatedAt: tick() });
      return withStudent(row);
    },
  };
}
