import type { RequestHandler } from "express";
import { ref } from "../docs/schemas.js";
import { requireAuth } from "../http/middleware/authenticate.js";
import { parseStudentLogin, parseTeacherLogin } from "../http/validators/auth.js";
import type { AuthService } from "../services/auth.service.js";
import type { RouteGroup } from "./types.js";

const INVALID_CREDENTIALS = {
  description: "Wrong credentials. The same answer is given for an unknown account.",
  schema: ref("ErrorResponse"),
  example: { error: { code: "invalid_credentials", message: "Invalid credentials" } },
};

export function authRoutes(service: AuthService, limits: { login: RequestHandler }): RouteGroup {
  return {
    feature: "auth",
    description: "Login and session. Admins and teachers log in with email, students with username.",
    routes: [
      {
        method: "post",
        path: "/auth/login",
        access: "public",
        middleware: [limits.login],
        handler: async (req, res) => {
          const { identifier, password } = parseTeacherLogin(req.body);
          res.json(await service.loginTeacher(identifier, password));
        },
        doc: {
          summary: "Log in as admin or teacher",
          description: "Returns a JWT. The role in the response is `ADMIN` or `TEACHER`.",
          requestBody: {
            schema: ref("TeacherLoginRequest"),
            example: { email: "guru@example.com", password: "ChangeMe-123" },
          },
          responses: {
            200: { description: "Logged in", schema: ref("LoginResult") },
            401: INVALID_CREDENTIALS,
          },
        },
      },
      {
        method: "post",
        path: "/auth/student/login",
        access: "public",
        middleware: [limits.login],
        handler: async (req, res) => {
          const { identifier, password } = parseStudentLogin(req.body);
          res.json(await service.loginStudent(identifier, password));
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
            401: INVALID_CREDENTIALS,
          },
        },
      },
      {
        method: "get",
        path: "/auth/me",
        access: "authenticated",
        handler: async (req, res) => {
          res.json({ user: await service.getProfile(requireAuth(req)) });
        },
        doc: {
          summary: "Current user",
          description: "Reads the account from the database, so the role is always current.",
          responses: { 200: { description: "The logged-in user", schema: ref("MeResponse") } },
        },
      },
    ],
  };
}
