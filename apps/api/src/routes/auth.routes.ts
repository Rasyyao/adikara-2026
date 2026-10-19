import type { RequestHandler } from "express";
import { requireAuth } from "../http/middleware/authenticate.js";
import { parseStudentLogin, parseTeacherLogin } from "../http/validators/auth.js";
import type { RouteDefinition } from "./types.js";
import type { AuthService } from "../services/auth.service.js";

export function authRoutes(service: AuthService, limits: { login: RequestHandler }): RouteDefinition[] {
  return [
    {
      method: "post",
      path: "/auth/login",
      access: "public",
      middleware: [limits.login],
      handler: async (req, res) => {
        const { identifier, password } = parseTeacherLogin(req.body);
        res.json(await service.loginTeacher(identifier, password));
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
    },
    {
      method: "get",
      path: "/auth/me",
      access: "authenticated",
      handler: async (req, res) => {
        res.json({ user: await service.getProfile(requireAuth(req)) });
      },
    },
  ];
}
