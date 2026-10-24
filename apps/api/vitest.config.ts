import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile("../../.env"); // DATABASE_URL for tests/integration
} catch {
  // no .env: integration tests are skipped
}

export default defineConfig({
  test: {
    environment: "node",
    coverage: { provider: "v8", include: ["src/**/*.ts"], exclude: ["src/generated/**", "src/server.ts", "src/cli/**"] },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/**/*.test.ts"], exclude: ["tests/integration/**"] },
      },
      {
        // These files share one real database, so they must not run at the same time.
        extends: true,
        test: { name: "integration", include: ["tests/integration/**/*.test.ts"], fileParallelism: false },
      },
    ],
  },
});
