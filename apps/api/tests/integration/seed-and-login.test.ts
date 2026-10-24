import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createPrisma } from "../../src/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createRepositories } from "../../src/repositories/index.js";
import { DEV_ACCOUNTS, DEV_PASSWORD, readSeedOptions, runSeed } from "../../prisma/seed.js";
import { testConfig } from "../helpers/config.js";
import { PATHS } from "../helpers/requests.js";

/**
 * Real PostgreSQL. Runs against the local development database (DATABASE_URL) and wipes its tables
 * (create it with scripts/setup-test-db.sh). Otherwise the whole file is skipped.
 */
// the local development database (the same one the Python worker listens on)
const url = process.env.DATABASE_URL;
const safe = Boolean(url);

const env = { BCRYPT_COST: "4" }; // everything else: the seed defaults

describe.skipIf(!safe)("seed + login against a real database", () => {
  let prisma: PrismaClient;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    prisma = createPrisma(url as string);
    await prisma.sessionParticipant.deleteMany();
    await prisma.classSession.deleteMany();
    await prisma.student.deleteMany();
    await prisma.classroom.deleteMany();
    await prisma.teacher.deleteMany();

    await runSeed(prisma, readSeedOptions(env));
    await runSeed(prisma, readSeedOptions(env)); // twice on purpose

    app = await createApp({
      config: testConfig(),
      pingDb: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      repositories: createRepositories(prisma),
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("success", () => {
    it("running the seed twice leaves 2 teachers, 1 class and 2 students", async () => {
      expect(await prisma.teacher.count()).toBe(2);
      expect(await prisma.classroom.count()).toBe(1);
      expect(await prisma.student.count()).toBe(2);
    });

    it.each([
      ["admin", DEV_ACCOUNTS.admin.email, "ADMIN"],
      ["teacher", DEV_ACCOUNTS.teacher.email, "TEACHER"],
    ])("the %s logs in with the Swagger password and gets the right role", async (_who, email, role) => {
      const res = await request(app).post(PATHS.teacherLogin).send({ email, password: DEV_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(role);
    });

    it.each(DEV_ACCOUNTS.students.map((s) => [s.username, s.alias]))("student %s logs in and /me works", async (username, alias) => {
      const login = await request(app).post(PATHS.studentLogin).send({ username, password: DEV_PASSWORD });
      expect(login.status).toBe(200);

      const me = await request(app).get(PATHS.me).set("Authorization", `Bearer ${login.body.access_token}`);
      expect(me.body.user).toMatchObject({ role: "USER", name: alias });
    });

    it("/readyz is ok with the real database", async () => {
      expect((await request(app).get("/readyz")).status).toBe(200);
    });
  });

  describe("failure", () => {
    it("a wrong password is rejected", async () => {
      const res = await request(app).post(PATHS.studentLogin).send({ username: "siswa.satu", password: "wrong-pass-1" });
      expect(res.status).toBe(401);
    });

    it("a student cannot use the teacher login", async () => {
      const res = await request(app).post(PATHS.teacherLogin).send({ email: "siswa.satu@adikara.com", password: DEV_PASSWORD });
      expect(res.status).toBe(401);
    });
  });
});
