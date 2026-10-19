import { createApp } from "../../src/app.js";
import type { Config } from "../../src/config/index.js";
import { createTokenService } from "../../src/lib/token.js";
import { testConfig } from "./config.js";
import { createFakeRepository } from "./fake-repository.js";

export async function buildTestApp(options: { config?: Partial<Config>; pingDb?: () => Promise<void> } = {}) {
  const config = testConfig(options.config);
  const repository = await createFakeRepository();
  const app = await createApp({
    config,
    pingDb: options.pingDb ?? (async () => {}),
    authRepository: repository,
  });
  const tokens = createTokenService({ secret: config.jwtSecret, ttlSeconds: config.jwtTtlMinutes * 60 });
  return { app, config, repository, tokens };
}
