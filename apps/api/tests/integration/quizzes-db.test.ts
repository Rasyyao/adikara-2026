import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrisma } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createTokenService } from "../../src/lib/token.js";
import { hashPassword } from "../../src/lib/password.js";
import { createRepositories, type Repositories } from "../../src/repositories/index.js";
import { createServices, type Services } from "../../src/services/index.js";
import type { QuizQuestion } from "../../src/types/shared/quiz.types.js";
import { TEST_SECRET } from "../helpers/config.js";

/**
 * The quiz repository on PostgreSQL (TEST_DATABASE_URL): one attempt per student, answers kept with their history,
 * cascades, and a whole class taking a quiz through the real services. Empties its tables.
 */
const url = process.env.DATABASE_URL;

const QUESTIONS: QuizQuestion[] = [
  { id: 1, question: "x = 5 lalu x = 7. Isi x?", options: [{ key: "A", text: "5" }, { key: "B", text: "7" }], answer: "B", explanation: "Ditimpa.", source: null },
  { id: 2, question: "Tipe 3.5?", options: [{ key: "A", text: "int" }, { key: "B", text: "float" }], answer: "B", explanation: "Ada koma.", source: "Modul 1" },
];

describe.skipIf(!url)("quizzes against a real database", () => {
  let prisma: PrismaClient;
  let repos: Repositories;
  let services: Services;
  let teacher: { id: string };
  let students: { id: string }[];
  let sessionId: string;

  const staff = () => ({ userId: teacher.id, role: "TEACHER" as const, kind: "teacher" as const });
  const student = (i: number) => ({ userId: students[i].id, role: "USER" as const, kind: "student" as const });
  const quizzes = () => repos.shared.quizzes;

  beforeAll(async () => {
    prisma = createPrisma(url as string);
    repos = createRepositories(prisma);
  });

  beforeEach(async () => {
    await prisma.quizResponse.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.sessionQuiz.deleteMany();
    await prisma.sessionParticipant.deleteMany();
    await prisma.classSession.deleteMany();
    await prisma.student.deleteMany();
    await prisma.classroom.deleteMany();
    await prisma.teacher.deleteMany();

    const passwordHash = await hashPassword("Password-1", 4);
    teacher = await prisma.teacher.create({ data: { email: "t@example.com", name: "Bu Guru", passwordHash } });
    const classroom = await prisma.classroom.create({ data: { name: "7A", classCode: "KELAS7A", teacherId: teacher.id } });
    students = [
      await prisma.student.create({ data: { classId: classroom.id, username: "a.one", alias: "A One", passwordHash } }),
      await prisma.student.create({ data: { classId: classroom.id, username: "b.two", alias: null, passwordHash } }),
    ];
    const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 60 });
    services = await createServices(repos, tokens, { bcryptCost: 4, session: { presenceGraceMs: 0 } });
    const created = await services.teacher.sessions.createSession(staff(), "KELAS7A");
    sessionId = created.session.id;
    for (const i of [0, 1]) await services.student.sessions.joinSession(student(i), created.session.join_code!);
    await services.teacher.sessions.startSession(staff(), sessionId);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("repository", () => {
    it("stores the frozen questions as they were sent", async () => {
      const quiz = await quizzes().createQuiz({ sessionId, kind: "pretest", title: "Pre", questions: QUESTIONS, sourceChatId: null, sourceMessageId: null });
      expect((await quizzes().findQuiz(quiz.id))?.questions).toEqual(QUESTIONS);
      expect(quiz.status).toBe("OPEN");
    });

    it("starting twice keeps one attempt, with the device it started on", async () => {
      const quiz = await quizzes().createQuiz({ sessionId, kind: "quiz", title: "Q", questions: QUESTIONS, sourceChatId: null, sourceMessageId: null });
      const first = await quizzes().startAttempt({ quizId: quiz.id, studentId: students[0].id, total: 2, entry: "qr", client: { platform: "Android" } });
      const again = await quizzes().startAttempt({ quizId: quiz.id, studentId: students[0].id, total: 2, entry: "board", client: null });
      expect(again.id).toBe(first.id);
      expect(again).toMatchObject({ entry: "qr", client: { platform: "Android" }, studentName: "A One", studentUsername: "a.one" });
      expect(await prisma.quizAttempt.count()).toBe(1);
    });

    it("an answer saved again replaces the pick and keeps one row, with its history as JSON", async () => {
      const quiz = await quizzes().createQuiz({ sessionId, kind: "quiz", title: "Q", questions: QUESTIONS, sourceChatId: null, sourceMessageId: null });
      const attempt = await quizzes().startAttempt({ quizId: quiz.id, studentId: students[0].id, total: 2, entry: null, client: null });
      const base = { questionId: 1, firstChoice: "A", visits: 1, answerOrder: 1 };
      await quizzes().saveResponse(attempt.id, { ...base, choice: "A", isCorrect: false, timeMs: 3000, changes: [{ choice: "A", at_ms: 3000 }] });
      await quizzes().saveResponse(attempt.id, { ...base, choice: "B", isCorrect: true, timeMs: 9000, visits: 2, changes: [{ choice: "A", at_ms: 3000 }, { choice: "B", at_ms: 9000 }] });
      const [response] = (await quizzes().findAttempt(quiz.id, students[0].id))!.responses;
      expect(response).toMatchObject({ choice: "B", firstChoice: "A", isCorrect: true, timeMs: 9000, visits: 2, changes: [{ choice: "A", at_ms: 3000 }, { choice: "B", at_ms: 9000 }] });
      expect(await prisma.quizResponse.count()).toBe(1);
    });

    it("deleting the session takes its quizzes, attempts and answers with it", async () => {
      const quiz = await quizzes().createQuiz({ sessionId, kind: "quiz", title: "Q", questions: QUESTIONS, sourceChatId: null, sourceMessageId: null });
      const attempt = await quizzes().startAttempt({ quizId: quiz.id, studentId: students[0].id, total: 2, entry: null, client: null });
      await quizzes().saveResponse(attempt.id, { questionId: 1, choice: "B", firstChoice: "B", isCorrect: true, timeMs: 1, visits: 1, changes: [], answerOrder: 1 });
      await prisma.classSession.delete({ where: { id: sessionId } });
      expect([await prisma.sessionQuiz.count(), await prisma.quizAttempt.count(), await prisma.quizResponse.count()]).toEqual([0, 0, 0]);
    });
  });

  describe("a class takes a quiz through the services", () => {
    it("grades, ranks, closes and exports", async () => {
      const { quiz } = await services.shared.quizzes.create(staff(), sessionId, { kind: "pretest", title: "Pre", questions: QUESTIONS, sourceChatId: null, sourceMessageId: null });
      const q = services.shared.quizzes;

      await q.start(student(0), sessionId, quiz.id, { entry: "board", client: null });
      await q.answer(student(0), sessionId, quiz.id, { questionId: 1, choice: "A", timeMs: 2000, visits: 1, changes: [{ choice: "A", at_ms: 2000 }] });
      await q.answer(student(0), sessionId, quiz.id, { questionId: 1, choice: "B", timeMs: 6000, visits: 2, changes: [{ choice: "A", at_ms: 2000 }, { choice: "B", at_ms: 6000 }] });
      await q.answer(student(0), sessionId, quiz.id, { questionId: 2, choice: "B", timeMs: 1500, visits: 1, changes: [] });
      const done = await q.submit(student(0), sessionId, quiz.id);
      expect(done.attempt).toMatchObject({ score: 2, total: 2, rank: 1 });

      await q.start(student(1), sessionId, quiz.id, { entry: "qr", client: null });
      await q.answer(student(1), sessionId, quiz.id, { questionId: 2, choice: "A", timeMs: 1000, visits: 1, changes: [] });
      await q.close(staff(), sessionId, quiz.id); // hands in student 1

      const results = await q.results(staff(), sessionId, quiz.id);
      expect(results.summary).toMatchObject({ joined: 2, started: 2, submitted: 2, highest: 2, lowest: 0 });
      expect(results.leaderboard.map((r) => [r.name, r.rank, r.score])).toEqual([
        ["A One", 1, 2],
        ["b.two", 2, 0],
      ]);
      expect(results.questions[0]).toMatchObject({ answered: 1, wrong_to_right: 1, changed: 1 });
      expect(results.questions[1].top_wrong).toEqual({ key: "A", text: "int", count: 1 });

      const data = await q.exportData(staff(), sessionId, quiz.id);
      const rows = data.rows as { student_username: string; question_id: number; first_choice: string | null; answered: boolean; source: string | null }[];
      expect(rows).toHaveLength(4);
      expect(rows.find((r) => r.student_username === "a.one" && r.question_id === 1)).toMatchObject({ first_choice: "A" });
      expect(rows.find((r) => r.student_username === "b.two" && r.question_id === 1)).toMatchObject({ answered: false });
      expect(rows.find((r) => r.question_id === 2)?.source).toBe("Modul 1");
    });
  });
});
