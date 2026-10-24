import { Router, type RequestHandler } from "express";
import type { Config } from "../config/index.js";
import { createAccessGuards } from "../http/middleware/access.js";
import { createUpload } from "../http/middleware/upload.js";
import { createJoinLimiter, createLoginLimiter } from "../http/middleware/rate-limit.js";
import type { TokenService } from "../lib/token.js";
import type { Services } from "../services/index.js";
import { adminClassRoutes } from "./admin/classes.routes.js";
import { adminStudentRoutes } from "./admin/students.routes.js";
import { adminTeacherRoutes } from "./admin/teachers.routes.js";
import { registerRoutes } from "./register.js";
import { sharedAuthRoutes } from "./shared/auth.routes.js";
import { sessionEventsRoutes } from "./shared/session-events.routes.js";
import { studentAuthRoutes } from "./student/auth.routes.js";
import { studentSessionRoutes } from "./student/sessions.routes.js";
import { teacherAuthRoutes } from "./teacher/auth.routes.js";
import { teacherChatRoutes } from "./teacher/chats.routes.js";
import { teacherClassRoutes } from "./teacher/classes.routes.js";
import { teacherSessionRoutes } from "./teacher/sessions.routes.js";
import type { RouteGroup } from "./types.js";

export const API_PREFIX = "/api/v1";

export interface Limits {
  login: ReturnType<typeof createLoginLimiter>;
  join: ReturnType<typeof createJoinLimiter>;
  /** Reads the optional file of a multipart request. */
  upload: RequestHandler;
}

export function createLimits(
  config: Pick<
    Config,
    "loginRateLimitMax" | "loginRateLimitWindowMinutes" | "joinRateLimitMax" | "joinRateLimitWindowMinutes" | "uploadMaxBytes"
  >,
): Limits {
  return { login: createLoginLimiter(config), join: createJoinLimiter(config), upload: createUpload(config.uploadMaxBytes) };
}

/**
 * Every route of the API, grouped by role and feature. Each group lives in the folder of its role
 * (routes/admin, routes/teacher, routes/student, routes/shared); add a new group to the list below.
 */
export function createRouteGroups(services: Services, limits: Limits): RouteGroup[] {
  return [
    // admin: manage teachers, students and classes
    adminTeacherRoutes(services.admin.teachers),
    adminStudentRoutes(services.admin.students),
    adminClassRoutes(services.admin.classes),
    // teacher (admins too): log in, see classes, run live sessions
    teacherAuthRoutes(services.teacher.auth, limits),
    teacherClassRoutes(services.teacher.classes),
    teacherSessionRoutes(services.teacher.sessions),
    teacherChatRoutes(services.teacher.chats, limits.upload),
    // student: log in, join a live session
    studentAuthRoutes(services.student.auth, limits),
    studentSessionRoutes(services.student.sessions, limits),
    // shared: used by more than one role
    sharedAuthRoutes(services.shared.profile),
    sessionEventsRoutes(services.shared.sessionStream),
  ];
}

/** Express router for the groups; mounted at API_PREFIX by app.ts. */
export function createApiRouter(groups: RouteGroup[], tokens: TokenService): Router {
  return registerRoutes(
    Router(),
    createAccessGuards(tokens),
    groups.flatMap((group) => group.routes),
  );
}
