import type { RequestHandler } from "express";
import { ref } from "../../docs/schemas.js";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseJoinSession } from "../../http/validators/student/session.js";
import type { StudentSessionService } from "../../services/student/session.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

export function studentSessionRoutes(service: StudentSessionService, limits: { join: RequestHandler }): RouteGroup {
  return {
    role: "student",
    feature: "sessions",
    description: "Join the live session your teacher started, with its PIN.",
    routes: [
      {
        method: "post",
        path: "/sessions/join",
        access: "student",
        middleware: [limits.join],
        handler: async (req, res) => {
          const { code } = parseJoinSession(req.body);
          res.json(await service.joinSession(requireAuth(req), code));
        },
        doc: {
          summary: "Join a session with the PIN",
          description:
            "Marks the student present and notifies the teacher. Calling it again (refresh, second tab) does not create a second entry. " +
            "After joining, open `GET /sessions/{id}/events` to follow the session live.\n\n" +
            "Errors: `session_not_found` (wrong, ended or expired PIN), `not_in_class`, `kicked`, `session_locked`.",
          requestBody: { schema: ref("JoinSessionRequest"), example: { code: "482913" } },
          responses: {
            200: { description: "Joined", schema: ref("JoinResult") },
            403: errorDoc("not_in_class", "`not_in_class`, `kicked` or `session_locked`.", "You are not a member of this class"),
            404: errorDoc("session_not_found", "Session not found, or it belongs to another teacher.", "Session not found"),
          },
        },
      },
    ],
  };
}
