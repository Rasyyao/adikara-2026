import type { Request } from "express";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { parseBlockAnswer, parseCodeReport } from "../../http/validators/shared/session-problem.js";
import type { SessionProblemService } from "../../services/shared/session-problem.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteDefinition } from "../types.js";

const NOT_FOUND = errorDoc("problem_not_found", "No such problem in this session.", "Problem not found");
const NOT_JOINED = errorDoc("not_joined", "A student who has not joined the session (`not_joined`) or was removed (`kicked`).", "Join the session with its PIN first");
const CLOSED = errorDoc("problem_closed", "The teacher closed the problem, or the session ended (`session_ended`).", "The teacher closed this problem");

export function studentSessionProblemRoutes(service: SessionProblemService): RouteDefinition[] {
  const ids = (req: Request) => ({ session: parseUuidParam(req.params.id, "id"), problem: parseUuidParam(req.params.problemId, "problemId") });

  return [
    {
      method: "get",
      path: "/sessions/:id/open-problems",
      access: "student",
      handler: async (req, res) => {
        res.json(await service.openFor(requireAuth(req), parseUuidParam(req.params.id, "id")));
      },
      doc: {
        summary: "Problems open now",
        description: "The problems the teacher has sent and not closed, with whether you solved each; for joining after they were sent.",
        responses: { 200: { description: "The open problems", schema: { type: "object" } }, 403: NOT_JOINED },
      },
    },
    {
      method: "get",
      path: "/sessions/:id/problems/:problemId",
      access: "student",
      handler: async (req, res) => {
        const { session, problem } = ids(req);
        res.json(await service.play(requireAuth(req), session, problem));
      },
      doc: {
        summary: "Open a problem",
        description: "The story and the challenge without its answers (no block solution, no reference code), and your attempt, started on first open.",
        responses: { 200: { description: "The problem and your attempt", schema: { type: "object" } }, 403: NOT_JOINED, 404: NOT_FOUND, 409: CLOSED },
      },
    },
    {
      method: "post",
      path: "/sessions/:id/problems/:problemId/check",
      access: "student",
      handler: async (req, res) => {
        const { session, problem } = ids(req);
        res.json(await service.checkBlocks(requireAuth(req), session, problem, parseBlockAnswer(req.body).answer));
      },
      doc: {
        summary: "Check your blocks",
        description: "Grades your arrangement (`right`, `misplaced`, `extra` per block; `missing` answer blocks) and records the try. A right one solves the problem.",
        requestBody: { schema: { type: "object", required: ["answer"] }, example: { answer: [{ block: "b1" }, { block: "b2", children: [{ block: "b3" }] }] } },
        responses: { 200: { description: "The grade and your attempt", schema: { type: "object" } }, 404: NOT_FOUND, 409: CLOSED },
      },
    },
    {
      method: "post",
      path: "/sessions/:id/problems/:problemId/code",
      access: "student",
      handler: async (req, res) => {
        const { session, problem } = ids(req);
        res.json(await service.reportCode(requireAuth(req), session, problem, parseCodeReport(req.body)));
      },
      doc: {
        summary: "Report a run of your code",
        description: "Your JavaScript runs in your browser against the tests; this records the code and how many tests passed. All passed solves the problem.",
        requestBody: { schema: { type: "object", required: ["code", "passed", "total"] }, example: { code: "function luas(p, l) {\n  return p * l;\n}", passed: 3, total: 3 } },
        responses: { 200: { description: "Whether it is solved, and your attempt", schema: { type: "object" } }, 404: NOT_FOUND, 409: CLOSED },
      },
    },
  ];
}
