import { Router } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";

/** Swagger UI at `/`, raw spec at `/openapi.json`. Mount it before the global helmet (the UI needs inline scripts). */
export function createDocsRouter(spec: Record<string, unknown>): Router {
  const router = Router();

  router.use(helmet({ contentSecurityPolicy: false }));
  router.get("/openapi.json", (_req, res) => {
    res.json(spec);
  });
  router.use(
    "/",
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: "Adikara API docs",
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
  );
  return router;
}
