import { createPrisma } from "../src/db/prisma.js";
import { parseEmail, validatePasswordStrength } from "../src/http/validators/auth.js";
import { hashPassword } from "../src/lib/password.js";

async function main() {
  const email = parseEmail(process.env.SEED_ADMIN_EMAIL);
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email) throw new Error("SEED_ADMIN_EMAIL must be a valid email");
  const weakness = validatePasswordStrength(password);
  if (weakness) throw new Error(`SEED_ADMIN_PASSWORD ${weakness}`);

  const prisma = createPrisma(process.env.DATABASE_URL ?? "");
  try {
    // Idempotent: an existing admin keeps its current password.
    await prisma.teacher.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: "Administrator",
        role: "ADMIN",
        passwordHash: await hashPassword(password as string, Number(process.env.BCRYPT_COST ?? 12)),
      },
    });
    console.log(`admin ready: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
