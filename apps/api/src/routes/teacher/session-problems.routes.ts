import type { Request } from "express";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { parseSendProblem } from "../../http/validators/shared/session-problem.js";
import type { SessionProblemService } from "../../services/shared/session-problem.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteDefinition } from "../types.js";

const SESSION_NOT_FOUND = errorDoc("session_not_found", "Session not found, or it belongs to another teacher.", "Session not found");
const NOT_FOUND = errorDoc("problem_not_found", "No such problem in this session.", "Problem not found");

export function teacherSessionProblemRoutes(service: SessionProblemService): RouteDefinition[] {
  const ids = (req: Request) => ({ session: parseUuidParam(req.params.id, "id"), problem: parseUuidParam(req.params.problemId, "problemId") });

  // the problems sent to a session, part of its sessions group
  return [
    {
      method: "post",
      path: "/sessions/:id/problems",
      access: "staff",
      handler: async (req, res) => {
        res.status(201).json(await service.send(requireAuth(req), parseUuidParam(req.params.id, "id"), parseSendProblem(req.body).problemId));
      },
      doc: {
        summary: "Send a problem to the class",
        description:
          "Freezes a copy of one of your ready problems and opens it; it pops up on every student's screen (`problem_opened`). " +
          "Students solve it with blocks or JavaScript, whichever the problem offers.",
        requestBody: { schema: { type: "object", required: ["problem_id"] }, example: { problem_id: "6f1c2a4e-1b7d-4c55-9a51-0f1f2b3c4d5e" } },
        responses: {
          201: { description: "The sent problem", schema: { type: "object" } },
          404: SESSION_NOT_FOUND,
          409: errorDoc("problem_not_ready", "The problem is a draft or unfinished (or the session ended: `session_ended`).", "Mark the problem ready before sending it to the class"),
        },
      },
    },
    {
      method: "get",
      path: "/sessions/:id/problems",
      access: "staff",
      handler: async (req, res) => {
        res.json(await service.list(requireAuth(req), parseUuidParam(req.params.id, "id")));
      },
      doc: {
        summary: "The problems sent to a session",
        description: "Oldest first, each with how many students opened and solved it.",
        responses: { 200: { description: "The problems", schema: { type: "object" } }, 404: SESSION_NOT_FOUND },
      },
    },
    {
      method: "get",
      path: "/sessions/:id/problems/:problemId/results",
      access: "staff",
      handler: async (req, res) => {
        const { session, problem } = ids(req);
        res.json(await service.results(requireAuth(req), session, problem));
      },
      doc: {
        summary: "Who solved a problem, and how",
        description:
          "`summary` (joined, opened, solved, solved with blocks / code) and one row per student in the session: `solved`, `working` or `waiting` " +
          "(not opened yet), with how they solved it, block checks, code runs, tests passed and their last code.",
        responses: { 200: { description: "The results", schema: { type: "object" } }, 404: NOT_FOUND },
      },
    },
    {
      method: "post",
      path: "/sessions/:id/problems/:problemId/close",
      access: "staff",
      handler: async (req, res) => {
        const { session, problem } = ids(req);
        res.json(await service.close(requireAuth(req), session, problem));
      },
      doc: {
        summary: "Close a problem",
        description: "No more checks; the popup closes for students (`problem_closed`). Results stay.",
        requestBody: { schema: { type: "object" }, example: {}, description: "No body needed." },
        responses: { 200: { description: "The closed problem", schema: { type: "object" } }, 404: NOT_FOUND },
      },
    },
  ];
}
