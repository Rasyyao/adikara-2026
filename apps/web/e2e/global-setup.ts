import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { testDatabaseUrl } from "./env";

/**
 * Gets the test database ready: migrated, the development accounts seeded again (an integration run may have emptied
 * them), and any session left running ended. Nothing is deleted. `testDatabaseUrl` refuses any database not named *_test.
 */
export default function globalSetup() {
  const url = testDatabaseUrl();
  const api = join(__dirname, "../../api");
  const env = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url };
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { cwd: api, env, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "prisma", "db", "seed"], { cwd: api, env, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "tsx", "scripts/e2e-prepare.ts"], { cwd: api, env, stdio: "inherit" });
}
