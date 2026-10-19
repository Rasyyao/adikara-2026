import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export function createApp() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const app = express();
  const origins = (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

  app.use(cors({ origin: origins }));
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/readyz", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({
        error: { code: "db_unavailable", message: "Database is not reachable" },
      });
    }
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({
      error: { code: "internal_error", message: "Internal server error" },
    });
  };
  app.use(errorHandler);

  return app;
}
