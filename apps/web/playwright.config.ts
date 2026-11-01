import { defineConfig, devices } from "@playwright/test";
import { API_PORT, WEB_PORT, WEB_URL, testDatabaseUrl } from "./e2e/env";

// End-to-end: a teacher and students in real browsers against a real API and database. Both servers are started here
// on their own ports and on the test database (TEST_DATABASE_URL), so a run never touches the development data and
// can sit next to `pnpm dev`. Run with `pnpm e2e` (add `--headed` or `--ui` to watch).
const database = testDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1, // the specs share one class, so they run one after the other
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: "pnpm --dir ../api exec tsx --env-file=../../.env src/server.ts",
      url: `http://localhost:${API_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: database,
        PORT: String(API_PORT),
        // every spec logs in several times; the real limits would lock the test accounts out
        LOGIN_RATE_LIMIT_MAX: "1000",
        JOIN_RATE_LIMIT_MAX: "1000",
        SESSION_PRESENCE_GRACE_SECONDS: "2",
      },
    },
    {
      command: `pnpm exec next dev --port ${WEB_PORT}`,
      url: `${WEB_URL}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { NEXT_DIST_DIR: ".next-e2e", API_BASE_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
