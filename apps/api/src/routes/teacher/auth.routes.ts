import type { RequestHandler } from "express";
import { ref } from "../../docs/schemas.js";
import { parseTeacherLogin } from "../../http/validators/teacher/auth.js";
import type { TeacherAuthService } from "../../services/teacher/auth.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

export function teacherAuthRoutes(service: TeacherAuthService, limits: { login: RequestHandler }): RouteGroup {
  return {
    role: "teacher",
    feature: "auth",
    description: "Login for teachers and admins (both log in with email).",
    routes: [
      {
        method: "post",
        path: "/auth/login",
        access: "public",
        middleware: [limits.login],
        handler: async (req, res) => {
          const { identifier, password } = parseTeacherLogin(req.body);
          res.json(await service.login(identifier, password));
        },
        doc: {
          summary: "Log in as teacher or admin",
          description: "Returns a JWT. The role in the response is `ADMIN` or `TEACHER`.",
          requestBody: {
            schema: ref("TeacherLoginRequest"),
            example: { email: "guru@example.com", password: "ChangeMe-123" },
          },
          responses: {
            200: { description: "Logged in", schema: ref("LoginResult") },
            401: errorDoc("invalid_credentials", "Wrong credentials. The same answer is given for an unknown account.", "Invalid credentials"),
          },
        },
      },
    ],
  };
}
