/**
 * The one and only seeder. Run it with:  pnpm seed
 *
 * Development (default): creates an admin, a teacher, a class and two students, all with
 * the password below, so the examples in Swagger (/docs) work right away.
 * Production (NODE_ENV=production): creates only the admin, and SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD are required.
 *
 * Safe to run again. In development the passwords are reset on every run; in production an
 * existing admin is left untouched.
 */
import { pathToFileURL } from "node:url";
import { createPrisma } from "../src/db/prisma.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { parseEmail, validatePasswordStrength } from "../src/http/validators/shared/common.js";
import { hashPassword } from "../src/lib/password.js";

/** Password of every development account. Matches the examples in the Swagger docs. */
export const DEV_PASSWORD = "ChangeMe-123";

export const DEV_ACCOUNTS = {
  admin: { email: "admin@adikara.com", name: "Administrator" },
  teacher: { email: "guru@example.com", name: "Bu Guru" },
  classroom: { name: "Kelas 7A", classCode: "KELAS7A" },
  students: [
    { username: "siswa.satu", alias: "Siswa Satu" },
    { username: "siswa.dua", alias: "Siswa Dua" },
  ],
} as const;

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  /** Create the teacher, class and students too (never in production). */
  devAccounts: boolean;
  bcryptCost: number;
}

export function readSeedOptions(env: NodeJS.ProcessEnv): SeedOptions {
  const production = env.NODE_ENV === "production";
  const problems: string[] = [];

  const adminEmail = parseEmail(env.SEED_ADMIN_EMAIL || (production ? "" : DEV_ACCOUNTS.admin.email));
  if (!adminEmail) problems.push("SEED_ADMIN_EMAIL must be a valid email");

  const adminPassword = env.SEED_ADMIN_PASSWORD || (production ? "" : DEV_PASSWORD);
  const weakness = validatePasswordStrength(adminPassword);
  if (weakness) problems.push(`SEED_ADMIN_PASSWORD ${production ? "is required and " : ""}${weakness}`);

  const bcryptCost = Number(env.BCRYPT_COST ?? 12);
  if (!Number.isInteger(bcryptCost) || bcryptCost < 4 || bcryptCost > 15) problems.push("BCRYPT_COST must be 4-15");

  if (problems.length > 0) throw new Error(`Invalid seed environment:\n- ${problems.join("\n- ")}`);
  return { adminEmail: adminEmail as string, adminPassword, devAccounts: !production, bcryptCost };
}

export interface SeedSummary {
  admin: string;
  teacher?: string;
  classCode?: string;
  students: string[];
}

export async function runSeed(prisma: PrismaClient, options: SeedOptions): Promise<SeedSummary> {
  const adminHash = await hashPassword(options.adminPassword, options.bcryptCost);
  await prisma.teacher.upsert({
    where: { email: options.adminEmail },
    // production: never touch an existing admin; development: keep the password predictable
    update: options.devAccounts ? { role: "ADMIN", passwordHash: adminHash } : {},
    create: { email: options.adminEmail, name: DEV_ACCOUNTS.admin.name, role: "ADMIN", passwordHash: adminHash },
  });

  if (!options.devAccounts) return { admin: options.adminEmail, students: [] };

  const passwordHash = await hashPassword(DEV_PASSWORD, options.bcryptCost);
  const { teacher: teacherData, classroom: classData, students } = DEV_ACCOUNTS;

  const teacher = await prisma.teacher.upsert({
    where: { email: teacherData.email },
    update: { name: teacherData.name, role: "TEACHER", passwordHash },
    create: { email: teacherData.email, name: teacherData.name, role: "TEACHER", passwordHash },
  });

  const classroom = await prisma.classroom.upsert({
    where: { classCode: classData.classCode },
    update: { name: classData.name, teacherId: teacher.id },
    create: { name: classData.name, classCode: classData.classCode, teacherId: teacher.id },
  });

  for (const student of students) {
    await prisma.student.upsert({
      where: { username: student.username },
      update: { alias: student.alias, role: "USER", passwordHash, classId: classroom.id },
      create: { username: student.username, alias: student.alias, role: "USER", passwordHash, classId: classroom.id },
    });
  }

  return {
    admin: options.adminEmail,
    teacher: teacherData.email,
    classCode: classData.classCode,
    students: students.map((s) => s.username),
  };
}

async function main() {
  const options = readSeedOptions(process.env);
  const prisma = createPrisma(process.env.DATABASE_URL ?? "");
  try {
    const summary = await runSeed(prisma, options);
    console.log(`admin:    ${summary.admin}`);
    if (summary.teacher) console.log(`teacher:  ${summary.teacher}`);
    if (summary.classCode) console.log(`class:    ${summary.classCode}`);
    if (summary.students.length > 0) console.log(`students: ${summary.students.join(", ")}`);
    if (options.devAccounts) console.log(`password of the development accounts: ${DEV_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (tests import this file for runSeed).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
