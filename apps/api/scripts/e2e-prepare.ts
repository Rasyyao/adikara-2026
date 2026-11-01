// Before an end-to-end run: ends the sessions still running in the test database (an integration test or an aborted
// run may leave one behind, and a class can only have one live session). Nothing is deleted. Refuses to run on any
// database whose name does not end in _test.
import { createPrisma } from "../src/db/prisma.js";

const url = process.env.DATABASE_URL ?? "";
const name = url ? new URL(url).pathname.slice(1) : "";
if (!name.endsWith("_test")) {
  console.error(`Refusing: e2e-prepare only runs on a database whose name ends in _test (got "${name}").`);
  process.exit(1);
}

const prisma = createPrisma(url);
const { count } = await prisma.classSession.updateMany({ where: { status: { not: "ENDED" } }, data: { status: "ENDED", endedAt: new Date(), joinCode: null } });
console.log(`e2e-prepare: ended ${count} live session(s) in ${name}`);
await prisma.$disconnect();
