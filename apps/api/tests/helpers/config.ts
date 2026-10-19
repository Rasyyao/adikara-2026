import type { Config } from "../../src/config/index.js";

export const TEST_SECRET = "test-secret-test-secret-test-secret-123";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    nodeEnv: "test",
    port: 0,
    databaseUrl: "postgresql://test",
    jwtSecret: TEST_SECRET,
    jwtTtlMinutes: 60,
    bcryptCost: 4, // fast hashing for tests only
    loginRateLimitMax: 1000,
    loginRateLimitWindowMinutes: 15,
    corsOrigins: ["http://localhost:3000"],
    ...overrides,
  };
}
