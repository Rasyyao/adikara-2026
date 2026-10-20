import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrisma } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createTokenService } from "../../src/lib/token.js";
import { hashPassword } from "../../src/lib/password.js";
import { createRepositories, type Repositories } from "../../src/repositories/index.js";
import { createServices, type Services } from "../../src/services/index.js";
import { TEST_SECRET } from "../helpers/config.js";

/**
 * The real Prisma repository against PostgreSQL (the fakes cannot prove the SQL works):
 * unique PIN, one row per student per session, cascade, and a full flow through the service.
 * Runs only when TEST_DATABASE_URL points at a database whose name ends in `_test`.
 */
const url = process.env.TEST_DATABASE_URL;
const safe = Boolean(url) && /_test(\?|$)/.test(url as string);

describe.skipIf(!safe)("sessions against a real database", () => {
  let prisma: PrismaClient;
  let repos: Repositories;
  let services: Services;
  let teacher: { id: string };
  let classroom: { id: string };
  let students: { id: string }[];

  const teacherSessions = () => repos.teacher.sessions;
  const sharedSessions = () => repos.shared.sessions;
  const studentSessions = () => repos.student.sessions;
  const staff = () => ({ userId: teacher.id, role: "TEACHER" as const, kind: "teacher" as const });
  const student = (i: number) => ({ userId: students[i].id, role: "USER" as const, kind: "student" as const });

  beforeAll(async () => {
    prisma = createPrisma(url as string);
    repos = createRepositories(prisma);
  });

  beforeEach(async () => {
    await prisma.sessionParticipant.deleteMany();
    await prisma.classSession.deleteMany();
    await prisma.student.deleteMany();
    await prisma.classroom.deleteMany();
    await prisma.teacher.deleteMany();

    const passwordHash = await hashPassword("Password-1", 4);
    teacher = await prisma.teacher.create({ data: { email: "t@example.com", name: "T", passwordHash } });
    classroom = await prisma.classroom.create({ data: { name: "7A", classCode: "KELAS7A", teacherId: teacher.id } });
    students = [
      await prisma.student.create({ data: { classId: classroom.id, username: "a.one", alias: "A One", passwordHash } }),
      await prisma.student.create({ data: { classId: classroom.id, username: "b.two", alias: "B Two", passwordHash } }),
    ];
    const tokens = createTokenService({ secret: TEST_SECRET, ttlSeconds: 60 });
    services = await createServices(repos, tokens, { bcryptCost: 4, session: { presenceGraceMs: 0 } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("repository", () => {
    const data = () => ({ classId: classroom.id, teacherId: teacher.id, joinCode: "123456", expiresAt: new Date(Date.now() + 60_000) });

    it("creates a session and finds it by id and by PIN", async () => {
      const created = await teacherSessions().createSession(data());
      expect(created).toMatchObject({ status: "LOBBY", locked: false, joinCode: "123456" });
      expect((await sharedSessions().findSessionById(created!.id))?.id).toBe(created!.id);
      expect((await studentSessions().findSessionByCode("123456"))?.id).toBe(created!.id);
    });

    it("refuses a PIN that another session already holds (returns null, no exception)", async () => {
      await teacherSessions().createSession(data());
      expect(await teacherSessions().createSession(data())).toBeNull();
    });

    it("lets an ended session release its PIN (NULL does not collide)", async () => {
      const first = await teacherSessions().createSession(data());
      await sharedSessions().updateSession(first!.id, { status: "ENDED", endedAt: new Date(), joinCode: null });
      const second = await teacherSessions().createSession(data());
      expect(second).not.toBeNull();
      expect(await studentSessions().findSessionByCode("123456")).toMatchObject({ id: second!.id });
    });

    it("findOpenSessionByClass ignores ended sessions", async () => {
      const first = await teacherSessions().createSession(data());
      expect((await teacherSessions().findOpenSessionByClass(classroom.id))?.id).toBe(first!.id);
      await sharedSessions().updateSession(first!.id, { status: "ENDED", joinCode: null });
      expect(await teacherSessions().findOpenSessionByClass(classroom.id)).toBeNull();
    });

    it("keeps one row per student per session and returns names", async () => {
      const session = (await teacherSessions().createSession(data()))!;
      await studentSessions().addParticipant(session.id, students[0].id, new Date());
      await studentSessions().addParticipant(session.id, students[0].id, new Date());
      const list = await sharedSessions().listParticipants(session.id);

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ name: "A One", username: "a.one", leftAt: null, kickedAt: null });
    });

    it("updates leftAt and kickedAt", async () => {
      const session = (await teacherSessions().createSession(data()))!;
      await studentSessions().addParticipant(session.id, students[0].id, new Date());
      const when = new Date();
      const updated = await sharedSessions().updateParticipant(session.id, students[0].id, { leftAt: when, kickedAt: when });
      expect(updated.kickedAt).toEqual(when);
    });

    it("deleting a session deletes its attendance rows", async () => {
      const session = (await teacherSessions().createSession(data()))!;
      await studentSessions().addParticipant(session.id, students[0].id, new Date());
      await prisma.classSession.delete({ where: { id: session.id } });
      expect(await prisma.sessionParticipant.count()).toBe(0);
    });

    it("finds the class by code, the student's class, and the class roster", async () => {
      expect(await teacherSessions().findClassroomByCode("KELAS7A")).toMatchObject({ id: classroom.id, archived: false });
      expect(await teacherSessions().findClassroomByCode("NOPE")).toBeNull();
      expect(await studentSessions().findStudentClassId(students[0].id)).toBe(classroom.id);
      expect((await teacherSessions().listClassStudents(classroom.id)).map((s: { username: string | null }) => s.username)).toEqual(["a.one", "b.two"]);
    });

    it("reports an archived class", async () => {
      await prisma.classroom.update({ where: { id: classroom.id }, data: { archivedAt: new Date() } });
      expect((await teacherSessions().findClassroomByCode("KELAS7A"))?.archived).toBe(true);
    });
  });

  describe("full flow through the service", () => {
    it("create → join → start → late join → kick → end, with the right attendance", async () => {
      const created = await services.teacher.sessions.createSession(staff(), "KELAS7A");
      const code = created.session.join_code as string;
      expect(code).toMatch(/^\d{6}$/);

      await services.student.sessions.joinSession(student(0), code);
      await services.teacher.sessions.startSession(staff(), created.session.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await services.student.sessions.joinSession(student(1), code);

      const live = await services.teacher.sessions.getAttendance(staff(), created.session.id);
      expect(live.summary).toEqual({ present: 1, late: 1, absent: 0, kicked: 0, total: 2 });

      await services.teacher.sessions.kickParticipant(staff(), created.session.id, students[1].id);
      const ended = await services.teacher.sessions.endSession(staff(), created.session.id);

      expect(ended.session).toMatchObject({ status: "ENDED", join_code: null });
      expect(ended.attendance.summary).toEqual({ present: 1, late: 0, absent: 0, kicked: 1, total: 2 });
      await expect(services.student.sessions.joinSession(student(0), code)).rejects.toMatchObject({ status: 404 });
    });

    it("two students joining at the same moment both get in", async () => {
      const created = await services.teacher.sessions.createSession(staff(), "KELAS7A");
      const code = created.session.join_code as string;
      await Promise.all([services.student.sessions.joinSession(student(0), code), services.student.sessions.joinSession(student(1), code), services.student.sessions.joinSession(student(0), code)]);
      expect((await services.teacher.sessions.getSession(staff(), created.session.id)).participants).toHaveLength(2);
    });

    it("a second live session for the class is refused", async () => {
      await services.teacher.sessions.createSession(staff(), "KELAS7A");
      await expect(services.teacher.sessions.createSession(staff(), "KELAS7A")).rejects.toMatchObject({ code: "session_already_active" });
    });
  });
});
