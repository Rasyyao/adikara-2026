import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { verifyPassword } from "../../src/lib/password.js";
import { buildOpenApi } from "../../src/docs/openapi.js";
import { parseEmail, validatePasswordStrength } from "../../src/http/validators/shared/common.js";
import { parseStudentLogin } from "../../src/http/validators/student/auth.js";
import { DEV_ACCOUNTS, DEV_PASSWORD, readSeedOptions, runSeed } from "../../prisma/seed.js";
import { DEMO_MATERIALS, DEMO_PROBLEMS } from "../../prisma/seed-problems.js";
import { gradeArrangement, problemIssues, readChallenge } from "../../src/lib/block-puzzle.js";
import { realRouteGroups } from "../helpers/route-groups.js";

/** Records upserts in memory; enough to check what the seeder writes without a database. */
function fakePrisma() {
  const stores = { teachers: new Map<string, any>(), classrooms: new Map<string, any>(), students: new Map<string, any>(), chats: new Map<string, any>(), problems: new Map<string, any>() };
  let id = 0;
  const upsert = (store: Map<string, any>, key: string) => async ({ where, update, create }: any) => {
    const existing = store.get(where[key]);
    const row = existing ? { ...existing, ...update } : { id: `id-${++id}`, ...create };
    store.set(where[key], row);
    return row;
  };
  const prisma = {
    teacher: { upsert: upsert(stores.teachers, "email") },
    classroom: { upsert: upsert(stores.classrooms, "classCode") },
    student: { upsert: upsert(stores.students, "username") },
    chat: { upsert: upsert(stores.chats, "id") },
    blockProblem: { upsert: upsert(stores.problems, "id") },
  } as unknown as PrismaClient;
  return { prisma, ...stores };
}

const dev = { BCRYPT_COST: "4" };
const prod = { NODE_ENV: "production", SEED_ADMIN_EMAIL: "Boss@Example.com", SEED_ADMIN_PASSWORD: "Prod-pass-1", BCRYPT_COST: "4" };

describe("readSeedOptions", () => {
  describe("success: development", () => {
    it("works with an empty environment (defaults)", () => {
      expect(readSeedOptions(dev)).toEqual({
        adminEmail: DEV_ACCOUNTS.admin.email,
        adminPassword: DEV_PASSWORD,
        devAccounts: true,
        bcryptCost: 4,
      });
    });

    it("lets SEED_ADMIN_* override the admin", () => {
      const options = readSeedOptions({ ...dev, SEED_ADMIN_EMAIL: "Me@Example.com", SEED_ADMIN_PASSWORD: "Mine-pass-1" });
      expect(options).toMatchObject({ adminEmail: "me@example.com", adminPassword: "Mine-pass-1", devAccounts: true });
    });
  });

  describe("success: production", () => {
    it("takes the admin from the environment and turns dev accounts off", () => {
      expect(readSeedOptions(prod)).toMatchObject({ adminEmail: "boss@example.com", adminPassword: "Prod-pass-1", devAccounts: false });
    });
  });

  describe("failure", () => {
    it("requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in production (no defaults)", () => {
      expect(() => readSeedOptions({ NODE_ENV: "production", BCRYPT_COST: "4" })).toThrow(
        /SEED_ADMIN_EMAIL[\s\S]*SEED_ADMIN_PASSWORD is required/,
      );
    });

    it("rejects a weak password in production", () => {
      expect(() => readSeedOptions({ ...prod, SEED_ADMIN_PASSWORD: "weak" })).toThrow(/SEED_ADMIN_PASSWORD/);
    });

    it("rejects an invalid email", () => {
      expect(() => readSeedOptions({ ...dev, SEED_ADMIN_EMAIL: "nope" })).toThrow(/SEED_ADMIN_EMAIL/);
    });

    it("rejects an out-of-range BCRYPT_COST", () => {
      expect(() => readSeedOptions({ BCRYPT_COST: "1" })).toThrow(/BCRYPT_COST/);
    });
  });
});

describe("runSeed (development)", () => {
  const options = readSeedOptions(dev);

  describe("success", () => {
    it("creates the admin, the teacher, the class and both students", async () => {
      const { prisma, teachers, classrooms, students } = fakePrisma();
      const summary = await runSeed(prisma, options);

      expect(teachers.get(DEV_ACCOUNTS.admin.email).role).toBe("ADMIN");
      expect(teachers.get(DEV_ACCOUNTS.teacher.email).role).toBe("TEACHER");
      expect([...classrooms.keys()]).toEqual([DEV_ACCOUNTS.classroom.classCode]);
      expect([...students.keys()]).toEqual(DEV_ACCOUNTS.students.map((s) => s.username));
      expect(summary.students).toEqual(["siswa.satu", "siswa.dua"]);
    });

    it("puts the students in the class, owned by the teacher", async () => {
      const { prisma, teachers, classrooms, students } = fakePrisma();
      await runSeed(prisma, options);

      const classroom = classrooms.get(DEV_ACCOUNTS.classroom.classCode);
      expect(classroom.teacherId).toBe(teachers.get(DEV_ACCOUNTS.teacher.email).id);
      for (const student of students.values()) expect(student.classId).toBe(classroom.id);
    });

    it("hashes every password, and each one verifies against the dev password", async () => {
      const { prisma, teachers, students } = fakePrisma();
      await runSeed(prisma, options);

      const hashes = [...teachers.values(), ...students.values()].map((row) => row.passwordHash as string);
      expect(hashes).toHaveLength(4);
      for (const hash of hashes) {
        expect(hash).not.toContain(DEV_PASSWORD);
        expect(await verifyPassword(DEV_PASSWORD, hash)).toBe(true);
      }
    });

    it("is idempotent: running twice creates no extra rows", async () => {
      const { prisma, teachers, classrooms, students } = fakePrisma();
      await runSeed(prisma, options);
      await runSeed(prisma, options);
      expect([teachers.size, classrooms.size, students.size]).toEqual([2, 1, 2]);
    });

    it("resets a changed password back to the documented one", async () => {
      const { prisma, students } = fakePrisma();
      await runSeed(prisma, options);
      students.get("siswa.satu").passwordHash = "changed-by-someone";

      await runSeed(prisma, options);
      expect(await verifyPassword(DEV_PASSWORD, students.get("siswa.satu").passwordHash)).toBe(true);
    });
  });
});

describe("runSeed (production)", () => {
  describe("failure: nothing but the admin is created", () => {
    it("creates one admin and no teacher, class or student", async () => {
      const { prisma, teachers, classrooms, students } = fakePrisma();
      const summary = await runSeed(prisma, readSeedOptions(prod));

      expect([...teachers.keys()]).toEqual(["boss@example.com"]);
      expect([classrooms.size, students.size]).toEqual([0, 0]);
      expect(summary).toEqual({ admin: "boss@example.com", students: [] });
    });

    it("leaves an existing admin's password untouched", async () => {
      const { prisma, teachers } = fakePrisma();
      await runSeed(prisma, readSeedOptions(prod));
      const hash = teachers.get("boss@example.com").passwordHash;

      await runSeed(prisma, readSeedOptions({ ...prod, SEED_ADMIN_PASSWORD: "Other-pass-9" }));
      expect(teachers.get("boss@example.com").passwordHash).toBe(hash);
    });
  });
});

describe("seed data matches the Swagger docs", () => {
  const spec = buildOpenApi(realRouteGroups()) as any;
  const example = (path: string) => spec.paths[path].post.requestBody.content["application/json"].example;

  it("uses an email and username the real validators accept unchanged", () => {
    for (const email of [DEV_ACCOUNTS.admin.email, DEV_ACCOUNTS.teacher.email]) expect(parseEmail(email)).toBe(email);
    for (const { username } of DEV_ACCOUNTS.students) expect(parseStudentLogin({ username, password: "x" }).identifier).toBe(username);
  });

  it("uses a password that satisfies the password policy", () => {
    expect(validatePasswordStrength(DEV_PASSWORD)).toBeNull();
  });

  it("teacher login example in Swagger is the seeded teacher", () => {
    expect(example("/auth/login")).toEqual({ email: DEV_ACCOUNTS.teacher.email, password: DEV_PASSWORD });
  });

  it("student login example in Swagger is the first seeded student", () => {
    expect(example("/auth/student/login")).toEqual({ username: DEV_ACCOUNTS.students[0].username, password: DEV_PASSWORD });
  });

  it("the API description lists every seeded login and the password", () => {
    const text = spec.info.description as string;
    for (const login of [DEV_ACCOUNTS.admin.email, DEV_ACCOUNTS.teacher.email, ...DEV_ACCOUNTS.students.map((s) => s.username)]) {
      expect(text).toContain(login);
    }
    expect(text).toContain(DEV_PASSWORD);
  });
});

describe("demo block problems", () => {
  it("seeds the materials and problems for the dev teacher only, and again without duplicates", async () => {
    const { prisma, chats, problems, teachers } = fakePrisma();
    const summary = await runSeed(prisma, readSeedOptions(dev));
    await runSeed(prisma, readSeedOptions(dev));
    expect(summary.demo).toEqual({ materials: DEMO_MATERIALS.length, problems: DEMO_PROBLEMS.length });
    expect(chats.size).toBe(DEMO_MATERIALS.length);
    expect(problems.size).toBe(DEMO_PROBLEMS.length);
    const teacherId = teachers.get(DEV_ACCOUNTS.teacher.email).id;
    expect([...problems.values()].every((p) => p.teacherId === teacherId)).toBe(true);

    const prod = fakePrisma();
    await runSeed(prod.prisma, readSeedOptions({ NODE_ENV: "production", SEED_ADMIN_EMAIL: "a@b.co", SEED_ADMIN_PASSWORD: "Prod-pass-1", BCRYPT_COST: "4" }));
    expect(prod.problems.size).toBe(0);
  });

  it.each(DEMO_PROBLEMS.map((p) => [p.title, p] as const))("%s is well formed, and its answer key solves it", (_title, problem) => {
    const challenge = readChallenge(problem.challenge);
    expect(challenge).toEqual(problem.challenge); // nothing dropped as malformed
    const issues = problemIssues({ story: problem.story, challenge });
    if (problem.title.startsWith("Draf")) {
      expect(issues.length).toBeGreaterThan(0);
      expect(problem.ready).toBe(false);
      return;
    }
    expect(issues).toEqual([]);
    expect(gradeArrangement(challenge, challenge.solution).correct).toBe(true);
    const used = JSON.stringify(challenge.solution).match(/"block":"[^"]+"/g)!.length;
    expect(challenge.blocks.length).toBeGreaterThan(used); // keeps distractors
    if (challenge.code) {
      // the teacher's reference solution passes every test
      const fn = new Function(`${challenge.code.reference}\nreturn ${challenge.code.fn};`)() as (...args: unknown[]) => unknown;
      for (const test of challenge.code.tests) expect(fn(...test.args)).toEqual(test.expected);
    }
  });
});
