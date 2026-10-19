import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Config } from "./config/index.js";
import { errorHandler, notFoundHandler } from "./http/middleware/error-handler.js";
import { createAuthService } from "./services/auth.service.js";
import type { AuthRepository } from "./types/auth.types.js";
import { createTokenService } from "./lib/token.js";
import { API_PREFIX, createApiRouter, createLimits, createRouteGroups } from "./routes/index.js";
import { buildOpenApi } from "./docs/openapi.js";
import { createDocsRouter } from "./docs/ui.js";

export interface AppDeps {
  config: Config;
  /** Resolves when the database answers; rejects otherwise. */
  pingDb: () => Promise<void>;
  authRepository: AuthRepository;
}

export async function createApp({ config, pingDb, authRepository }: AppDeps) {
  const tokens = createTokenService({ secret: config.jwtSecret, ttlSeconds: config.jwtTtlMinutes * 60 });
  const authService = await createAuthService(authRepository, tokens, { bcryptCost: config.bcryptCost });

  const groups = createRouteGroups({ authService, limits: createLimits(config) });

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
