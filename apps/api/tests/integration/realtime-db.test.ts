import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createPrisma } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { hashPassword } from "../../src/lib/password.js";
import { createRepositories } from "../../src/repositories/index.js";
import { testConfig } from "../helpers/config.js";
import { bearer } from "../helpers/identities.js";
import { createMemoryStorage } from "../helpers/memory-storage.js";
import { expectWithinTarget, runClassPeriod, startServer, type Person, type Server } from "../helpers/realtime-class.js";

/**
 * The same class period as tests/shared/realtime-class.test.ts, on PostgreSQL (TEST_DATABASE_URL): thirty students
 * joining, drawing, answering and checking at once means thirty concurrent writes per step, so this measures the
 * latency a real class would see from the server. It creates its own teacher, class and students and removes only
 * those, so it does not disturb the other integration tests' data.
 */
const url = process.env.DATABASE_URL;
const CLASS_SIZE = 30;

describe.skipIf(!url)("a class of 30 acting at the same time, on a real database", () => {
  let prisma: PrismaClient;
  let server: Server;
  let teacher: Person;
  let students: Person[];
  let classId: string;
  const classCode = `RT${randomUUID().slice(0, 6).toUpperCase()}`;

  beforeAll(async () => {
    prisma = createPrisma(url as string);
    const passwordHash = await hashPassword("Password-1", 4);
    const t = await prisma.teacher.create({ data: { email: `realtime-${randomUUID()}@example.com`, name: "Bu Guru Realtime", passwordHash } });
    const classroom = await prisma.classroom.create({ data: { name: "Kelas Realtime", classCode, teacherId: t.id } });
    classId = classroom.id;
    const rows = await prisma.student.createManyAndReturn({
      data: Array.from({ length: CLASS_SIZE }, (_, i) => ({ classId, username: `rt.${classCode.toLowerCase()}.${i}`, alias: `Siswa ${i + 1}`, passwordHash })),
    });
    teacher = { id: t.id, headers: { Authorization: bearer({ userId: t.id, role: "TEACHER", kind: "teacher" }) } };
    students = rows.map((s) => ({ id: s.id, headers: { Authorization: bearer({ userId: s.id, role: "USER", kind: "student" }) } }));

    const app = await createApp({ config: testConfig(), pingDb: async () => {}, repositories: createRepositories(prisma), storage: createMemoryStorage() });
    server = await startServer(app);
  });

  afterAll(async () => {
    await server?.close();
    if (prisma && teacher) {
      await prisma.classSession.deleteMany({ where: { teacherId: teacher.id } }); // participants, quizzes, problems go with it
      await prisma.student.deleteMany({ where: { classId } });
      await prisma.classroom.deleteMany({ where: { id: classId } });
      await prisma.teacher.deleteMany({ where: { id: teacher.id } }); // and the teacher's problems
    }
    await prisma?.$disconnect();
  });

  it("delivers every action to everyone it concerns within a second, with nothing lost", async () => {
    const report = await runClassPeriod(server, { teacher, students, classCode });
    expectWithinTarget(report);
  }, 60_000);
});
