import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Config } from "./config/index.js";
import { errorHandler, notFoundHandler } from "./http/middleware/error-handler.js";
import { createTokenService } from "./lib/token.js";
import type { Repositories } from "./repositories/index.js";
import { API_PREFIX, createApiRouter, createLimits, createRouteGroups } from "./routes/index.js";
import { createServices, type ServiceOptions } from "./services/index.js";
import { buildOpenApi } from "./docs/openapi.js";
import { createDocsRouter } from "./docs/ui.js";

export interface AppDeps {
  config: Config;
  /** Resolves when the database answers; rejects otherwise. */
  pingDb: () => Promise<void>;
  /** Every repository, grouped by role. In production these are the Prisma ones; tests pass in-memory versions. */
  repositories: Repositories;
  /** Overrides for the session rules (clock, PIN generator, ...). Tests only. */
  sessionOptions?: ServiceOptions["session"];
}

export async function createApp({ config, pingDb, repositories, sessionOptions }: AppDeps) {
  const tokens = createTokenService({ secret: config.jwtSecret, ttlSeconds: config.jwtTtlMinutes * 60 });
  const services = await createServices(repositories, tokens, {
    bcryptCost: config.bcryptCost,
    session: {
      ttlMs: config.sessionTtlMinutes * 60 * 1000,
      presenceGraceMs: config.sessionPresenceGraceSeconds * 1000,
      ...sessionOptions,
    },
  });

  const groups = createRouteGroups(services, createLimits(config));

  const app = express();

  if (config.docsEnabled) app.use("/docs", createDocsRouter(buildOpenApi(groups)));

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: "10kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/readyz", async (_req, res) => {
    try {
      await pingDb();
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ error: { code: "db_unavailable", message: "Database is not reachable" } });
    }
  });

  app.use(API_PREFIX, createApiRouter(groups, tokens));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
