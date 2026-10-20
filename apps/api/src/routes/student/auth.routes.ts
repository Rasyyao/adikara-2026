import type { RequestHandler } from "express";
import { ref } from "../../docs/schemas.js";
import { parseStudentLogin } from "../../http/validators/student/auth.js";
import type { StudentAuthService } from "../../services/student/auth.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

export function studentAuthRoutes(service: StudentAuthService, limits: { login: RequestHandler }): RouteGroup {
  return {
    role: "student",
    feature: "auth",
    description: "Login for students (username and password).",
    routes: [
      {
        method: "post",
        path: "/auth/student/login",
        access: "public",
        middleware: [limits.login],
        handler: async (req, res) => {
          const { identifier, password } = parseStudentLogin(req.body);
          res.json(await service.login(identifier, password));
        },
        doc: {
          summary: "Log in as student",
          description: "Returns a JWT with role `USER`.",
          requestBody: {
            schema: ref("StudentLoginRequest"),
            example: { username: "siswa.satu", password: "ChangeMe-123" },
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
