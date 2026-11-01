import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile("../../.env"); // TEST_DATABASE_URL for tests/integration
} catch {
  // no .env: integration tests are skipped
}

/**
 * Integration tests empty the tables they use, so they only ever get a database whose name ends in `_test`
 * (TEST_DATABASE_URL, made by `pnpm test:db`). The development database (DATABASE_URL) is hidden from every test,
 * so no test can wipe it by accident.
 */
function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return "";
  try {
    return /_test$/.test(new URL(url).pathname.slice(1)) ? url : "";
  } catch {
    return "";
  }
}
const integrationUrl = testDatabaseUrl();
delete process.env.DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    coverage: { provider: "v8", include: ["src/**/*.ts"], exclude: ["src/generated/**", "src/server.ts", "src/cli/**"] },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/**/*.test.ts"], exclude: ["tests/integration/**"], env: { DATABASE_URL: "" } },
      },
      {
        // These files share one real database, so they must not run at the same time.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
          env: { DATABASE_URL: integrationUrl },
          setupFiles: ["tests/integration/guard.ts"],
        },
      },
    ],
  },
});
