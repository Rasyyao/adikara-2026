import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrisma } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { hashPassword } from "../../src/lib/password.js";
import { createTokenService } from "../../src/lib/token.js";
import { createRepositories, type Repositories } from "../../src/repositories/index.js";
import { createServices, type Services } from "../../src/services/index.js";
import { TEST_SECRET } from "../helpers/config.js";

/**
 * The admin repositories against a real PostgreSQL: unique emails/usernames/class codes, "in use" detection
 * through foreign keys, role filtering, cascade, paging. The in-memory fake cannot prove any of these.
 * Runs against the local development database (DATABASE_URL) and wipes its tables.
 */
// the local development database (the same one the Python worker listens on)
const url = process.env.DATABASE_URL;
const safe = Boolean(url);

describe.skipIf(!safe)("admin management against a real database", () => {
  let prisma: PrismaClient;
  let repos: Repositories;
  let services: Services;
  let admin: { id: string };
  let teacher: { id: string };

  const adminAuth = () => ({ userId: admin.id, role: "ADMIN" as const, kind: "teacher" as const });

  beforeAll(async () => {
    prisma = createPrisma(url as string);
    repos = createRepositories(prisma);
    services = await createServices(repos, createTokenService({ secret: TEST_SECRET, ttlSeconds: 60 }), { bcryptCost: 4, session: { presenceGraceMs: 0 } });
  });

  beforeEach(async () => {
    await prisma.sessionParticipant.deleteMany();
    await prisma.classSession.deleteMany();
    await prisma.student.deleteMany();
    await prisma.classroom.deleteMany();
    await prisma.teacher.deleteMany();
    const passwordHash = await hashPassword("Password-1", 4);
    admin = await prisma.teacher.create({ data: { email: "admin@example.com", name: "Admin", role: "ADMIN", passwordHash } });
    teacher = await prisma.teacher.create({ data: { email: "t@example.com", name: "Teacher", role: "TEACHER", passwordHash } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("teachers", () => {
    it("lists only role TEACHER, never the admin", async () => {
      const page = await repos.admin.teachers.list({ limit: 50, offset: 0 });
      expect(page.items.map((t) => t.email)).toEqual(["t@example.com"]);
      expect(page.total).toBe(1);
    });

    it("cannot read, update or delete an admin account through the teacher repository", async () => {
      expect(await repos.admin.teachers.findById(admin.id)).toBeNull();
      expect(await repos.admin.teachers.update(admin.id, { name: "Hacked" })).toBeNull();
      expect(await repos.admin.teachers.delete(admin.id)).toBe("not_found");
      expect((await prisma.teacher.findUnique({ where: { id: admin.id } }))?.name).toBe("Admin");
    });

    it("reports a duplicate email instead of throwing", async () => {
      expect(await repos.admin.teachers.create({ email: "t@example.com", name: "Dup", passwordHash: "x" })).toBe("email_taken");
      const other = await repos.admin.teachers.create({ email: "o@example.com", name: "Other", passwordHash: "x" });
      expect(typeof other).toBe("object");
      expect(await repos.admin.teachers.update((other as { id: string }).id, { email: "t@example.com" })).toBe("email_taken");
    });

    it("searches case-insensitively and pages in a stable order", async () => {
      for (const n of ["Ani", "Budi", "Citra"]) await repos.admin.teachers.create({ email: `${n.toLowerCase()}@x.com`, name: n, passwordHash: "x" });
      const search = await repos.admin.teachers.list({ limit: 50, offset: 0, search: "BUD" });
      expect(search.items.map((t) => t.name)).toEqual(["Budi"]);
      const p1 = await repos.admin.teachers.list({ limit: 2, offset: 0 });
      const p2 = await repos.admin.teachers.list({ limit: 2, offset: 2 });
      expect([...p1.items, ...p2.items].map((t) => t.name)).toEqual(["Ani", "Budi", "Citra", "Teacher"]);
      expect(p1.total).toBe(4);
    });

    it("refuses to delete a teacher who owns a class (foreign key) and deletes one who does not", async () => {
      await prisma.classroom.create({ data: { name: "7A", classCode: "KELAS7A", teacherId: teacher.id } });
      expect(await repos.admin.teachers.delete(teacher.id)).toBe("in_use");
      const free = (await repos.admin.teachers.create({ email: "f@x.com", name: "Free", passwordHash: "x" })) as { id: string };
      expect(await repos.admin.teachers.delete(free.id)).toBe("deleted");
    });
  });

  describe("classes", () => {
    it("creates, finds with teacher name and student count, and rejects a duplicate class code", async () => {
      const created = await repos.admin.classes.create({ name: "7A", classCode: "KELAS7A", teacherId: teacher.id });
      expect(created).toMatchObject({ classCode: "KELAS7A", teacherName: "Teacher", studentCount: 0, archived: false });
      expect(await repos.admin.classes.create({ name: "Dup", classCode: "KELAS7A", teacherId: teacher.id })).toBe("class_code_taken");
    });

    it("hands a class to another teacher and archives it", async () => {
      const other = await prisma.teacher.create({ data: { email: "o@x.com", name: "Other", passwordHash: "x" } });
      const created = (await repos.admin.classes.create({ name: "7A", classCode: "KELAS7A", teacherId: teacher.id })) as { id: string };
      const moved = await repos.admin.classes.update(created.id, { teacherId: other.id, archived: true });
      expect(moved).toMatchObject({ teacherId: other.id, teacherName: "Other", archived: true });
      expect(await repos.admin.classes.update(created.id, { archived: false })).toMatchObject({ archived: false });
    });

    it("hides archived classes unless asked", async () => {
      const created = (await repos.admin.classes.create({ name: "7A", classCode: "KELAS7A", teacherId: teacher.id })) as { id: string };
      await repos.admin.classes.update(created.id, { archived: true });
      expect((await repos.admin.classes.list({ limit: 50, offset: 0, includeArchived: false })).total).toBe(0);
      expect((await repos.admin.classes.list({ limit: 50, offset: 0, includeArchived: true })).total).toBe(1);
    });

    it("update/delete of a missing class report not found", async () => {
      const missing = "00000000-0000-4000-8000-00000000dead";
      expect(await repos.admin.classes.update(missing, { name: "x" })).toBeNull();
      expect(await repos.admin.classes.delete(missing)).toBe("not_found");
    });

    it("refuses to delete a class with students, deletes an empty one", async () => {
      const full = (await repos.admin.classes.create({ name: "Full", classCode: "FULL1", teacherId: teacher.id })) as { id: string };
      await prisma.student.create({ data: { classId: full.id, username: "s.one", alias: "S One" } });
      expect(await repos.admin.classes.delete(full.id)).toBe("in_use");
      const empty = (await repos.admin.classes.create({ name: "Empty", classCode: "EMPTY1", teacherId: teacher.id })) as { id: string };
      expect(await repos.admin.classes.delete(empty.id)).toBe("deleted");
    });

    it("sees a live session, and not an ended one", async () => {
      const created = (await repos.admin.classes.create({ name: "7A", classCode: "KELAS7A", teacherId: teacher.id })) as { id: string };
      expect(await repos.admin.classes.hasLiveSession(created.id)).toBe(false);
      const session = await prisma.classSession.create({
        data: { classId: created.id, teacherId: teacher.id, joinCode: "123456", expiresAt: new Date(Date.now() + 60_000) },
      });
      expect(await repos.admin.classes.hasLiveSession(created.id)).toBe(true);
      await prisma.classSession.update({ where: { id: session.id }, data: { status: "ENDED", joinCode: null } });
      expect(await repos.admin.classes.hasLiveSession(created.id)).toBe(false);
    });
  });

  describe("students", () => {
    let classId: string;
    beforeEach(async () => {
      classId = ((await repos.admin.classes.create({ name: "7A", classCode: "KELAS7A", teacherId: teacher.id })) as { id: string }).id;
    });

    it("creates with the class attached and rejects a duplicate username", async () => {
      const created = await repos.admin.students.create({ username: "s.one", name: "S One", passwordHash: "x", classId });
      expect(created).toMatchObject({ username: "s.one", name: "S One", classId, className: "7A", classCode: "KELAS7A" });
      expect(await repos.admin.students.create({ username: "s.one", name: "Dup", passwordHash: "x", classId })).toBe("username_taken");
    });

    it("stores role USER and a password hash that is not returned", async () => {
      const created = (await repos.admin.students.create({ username: "s.one", name: "S One", passwordHash: "hash", classId })) as { id: string };
      const row = await prisma.student.findUnique({ where: { id: created.id } });
      expect(row).toMatchObject({ role: "USER", passwordHash: "hash", alias: "S One" });
      expect(Object.keys(created)).not.toContain("passwordHash");
    });

    it("moves a student and filters by class", async () => {
      const other = (await repos.admin.classes.create({ name: "8B", classCode: "KELAS8B", teacherId: teacher.id })) as { id: string };
      const created = (await repos.admin.students.create({ username: "s.one", name: "S One", passwordHash: "x", classId })) as { id: string };
      await repos.admin.students.update(created.id, { classId: other.id });
      expect((await repos.admin.students.list({ limit: 50, offset: 0, classId })).total).toBe(0);
      expect((await repos.admin.students.list({ limit: 50, offset: 0, classId: other.id })).items[0].classCode).toBe("KELAS8B");
    });

    it("update of a missing student is null; a clashing username is reported", async () => {
      expect(await repos.admin.students.update("00000000-0000-4000-8000-00000000dead", { name: "x" })).toBeNull();
      await repos.admin.students.create({ username: "a.one", name: "A", passwordHash: "x", classId });
      const b = (await repos.admin.students.create({ username: "b.two", name: "B", passwordHash: "x", classId })) as { id: string };
      expect(await repos.admin.students.update(b.id, { username: "a.one" })).toBe("username_taken");
    });

    it("isInLiveSession is true only for a joined, not-removed student of a session that is not ended", async () => {
      const student = (await repos.admin.students.create({ username: "s.one", name: "S", passwordHash: "x", classId })) as { id: string };
      expect(await repos.admin.students.isInLiveSession(student.id)).toBe(false);

      const session = await prisma.classSession.create({
        data: { classId, teacherId: teacher.id, joinCode: "123456", expiresAt: new Date(Date.now() + 60_000) },
      });
      await prisma.sessionParticipant.create({ data: { sessionId: session.id, studentId: student.id } });
      expect(await repos.admin.students.isInLiveSession(student.id)).toBe(true);

      await prisma.sessionParticipant.update({ where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } }, data: { kickedAt: new Date() } });
      expect(await repos.admin.students.isInLiveSession(student.id)).toBe(false);

      await prisma.sessionParticipant.update({ where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } }, data: { kickedAt: null } });
      await prisma.classSession.update({ where: { id: session.id }, data: { status: "ENDED", joinCode: null } });
      expect(await repos.admin.students.isInLiveSession(student.id)).toBe(false);
    });

    it("deleting a student also deletes their attendance rows (ON DELETE CASCADE)", async () => {
      const student = (await repos.admin.students.create({ username: "s.one", name: "S", passwordHash: "x", classId })) as { id: string };
      const session = await prisma.classSession.create({
        data: { classId, teacherId: teacher.id, joinCode: "123456", expiresAt: new Date(Date.now() + 60_000) },
      });
      await prisma.sessionParticipant.create({ data: { sessionId: session.id, studentId: student.id } });

      expect(await repos.admin.students.delete(student.id)).toBe("deleted");
      expect(await prisma.sessionParticipant.count()).toBe(0);
      expect(await repos.admin.students.delete(student.id)).toBe("not_found");
    });
  });

  describe("whole flow through the admin services", () => {
    it("create teacher → class → student, then move the student; deleting in the wrong order is refused", async () => {
      const t = (await services.admin.teachers.create({ email: "budi@x.com", name: "Budi", password: "Guru-pass-123" })).teacher;
      const c1 = (await services.admin.classes.create({ name: "7B", classCode: "KELAS7B", teacherId: t.id })).class;
      const c2 = (await services.admin.classes.create({ name: "8B", classCode: "KELAS8B", teacherId: t.id })).class;
      const s = (await services.admin.students.create({ username: "s.one", name: "S One", password: "Siswa-pass-123", classId: c1.id })).student;
      expect(s.class.class_code).toBe("KELAS7B");

      expect((await services.admin.students.update(s.id, { classId: c2.id })).student.class.class_code).toBe("KELAS8B");

      await expect(services.admin.teachers.remove(t.id)).rejects.toMatchObject({ code: "teacher_in_use", details: { class_count: 2 } });
      await expect(services.admin.classes.remove(c2.id)).rejects.toMatchObject({ code: "class_in_use" });

      await services.admin.students.remove(s.id);
      await services.admin.classes.remove(c1.id);
      await services.admin.classes.remove(c2.id);
      await services.admin.teachers.remove(t.id);
      expect(await prisma.teacher.count({ where: { role: "TEACHER" } })).toBe(1); // only the fixture teacher is left
    });

    it("a live session blocks moving its student and handing over its class", async () => {
      const c = (await services.admin.classes.create({ name: "7B", classCode: "KELAS7B", teacherId: teacher.id })).class;
      const other = (await services.admin.classes.create({ name: "8B", classCode: "KELAS8B", teacherId: teacher.id })).class;
      const s = (await services.admin.students.create({ username: "s.one", name: "S", password: "Siswa-pass-123", classId: c.id })).student;
      const { session } = await services.teacher.sessions.createSession({ userId: teacher.id, role: "TEACHER", kind: "teacher" }, "KELAS7B");
      await services.student.sessions.joinSession({ userId: s.id, role: "USER", kind: "student" }, session.join_code as string);

      await expect(services.admin.students.update(s.id, { classId: other.id })).rejects.toMatchObject({ code: "student_in_live_session" });
      await expect(services.admin.classes.update(c.id, { archived: true })).rejects.toMatchObject({ code: "class_has_live_session" });

      await services.teacher.sessions.endSession(adminAuth(), session.id);
      expect((await services.admin.students.update(s.id, { classId: other.id })).student.class.id).toBe(other.id);
    });
  });
});
