import { createApp } from "../../src/app.js";
import type { Config } from "../../src/config/index.js";
import { createTokenService } from "../../src/lib/token.js";
import { createMemoryStorage } from "./memory-storage.js";
import type { ServiceOptions } from "../../src/services/index.js";
import { testConfig } from "./config.js";
import { createFakeDatabase } from "./fake-database.js";

export async function buildTestApp(
  options: { config?: Partial<Config>; pingDb?: () => Promise<void>; sessionOptions?: ServiceOptions["session"]; storage?: ReturnType<typeof createMemoryStorage> } = {},
) {
  const config = testConfig(options.config);
  const db = await createFakeDatabase();
  const storage = options.storage ?? createMemoryStorage();
  const app = await createApp({
    config,
    pingDb: options.pingDb ?? (async () => {}),
    repositories: db.repositories,
    sessionOptions: options.sessionOptions,
    storage,
  });
  const tokens = createTokenService({ secret: config.jwtSecret, ttlSeconds: config.jwtTtlMinutes * 60 });
  // `repository` / `sessionRepository` are the old names of the same in-memory database
  return { app, config, db, storage, repository: db, sessionRepository: db, tokens };
}
