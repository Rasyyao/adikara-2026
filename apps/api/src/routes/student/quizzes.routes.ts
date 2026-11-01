import type { Request } from "express";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { parseAnswer, parseStart } from "../../http/validators/shared/quiz.js";
import type { QuizService } from "../../services/shared/quiz.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteDefinition } from "../types.js";

const QUIZ_NOT_FOUND = errorDoc("quiz_not_found", "No such quiz in this session.", "Quiz not found");
const NOT_JOINED = errorDoc("not_joined", "A student who has not joined the session (`not_joined`) or was removed (`kicked`).", "Join the session with its PIN first");

export function studentQuizRoutes(service: QuizService): RouteDefinition[] {
  const ids = (req: Request) => ({ session: parseUuidParam(req.params.id, "id"), quiz: parseUuidParam(req.params.quizId, "quizId") });

  // the quizzes of a session, part of its sessions group
  return [
    {
      method: "get",
      path: "/sessions/:id/quizzes/:quizId",
      access: "student",
      handler: async (req, res) => {
        const { session, quiz } = ids(req);
        res.json(await service.play(requireAuth(req), session, quiz));
      },
      doc: {
        summary: "Open a quiz",
        description: "The questions and your attempt. The answers and explanations are included only after you handed in.",
        responses: { 200: { description: "The quiz", schema: { type: "object" } }, 403: NOT_JOINED, 404: QUIZ_NOT_FOUND },
      },
    },
    {
      method: "post",
      path: "/sessions/:id/quizzes/:quizId/attempt",
      access: "student",
      handler: async (req, res) => {
        const { session, quiz } = ids(req);
        res.json(await service.start(requireAuth(req), session, quiz, parseStart(req.body)));
      },
      doc: {
        summary: "Start a quiz",
        description: "Starts your attempt (one per quiz; starting again returns it). `entry`: `board`, `qr` or `link`; `client`: device details.",
        requestBody: { schema: { type: "object" }, example: { entry: "qr", client: { platform: "Android", screen_width: 412, screen_height: 915, touch: true } } },
        responses: { 200: { description: "The quiz with your attempt", schema: { type: "object" } }, 403: NOT_JOINED, 409: errorDoc("quiz_closed", "The quiz is closed.", "The quiz is closed") },
      },
    },
    {
      method: "put",
      path: "/sessions/:id/quizzes/:quizId/attempt/answers",
      access: "student",
      handler: async (req, res) => {
        const { session, quiz } = ids(req);
        res.json(await service.answer(requireAuth(req), session, quiz, parseAnswer(req.body)));
      },
      doc: {
        summary: "Answer a question",
        description: "Saves (or changes) the answer to one question, with every pick made (`changes`), the time on the question and how often it was opened.",
        requestBody: { schema: { type: "object", required: ["question_id", "choice", "time_ms"] }, example: { question_id: 1, choice: "B", time_ms: 8200, visits: 1, changes: [{ choice: "A", at_ms: 3100 }, { choice: "B", at_ms: 8200 }] } },
        responses: { 200: { description: "How many are answered", schema: { type: "object" } }, 409: errorDoc("quiz_closed", "Closed, not started, or already handed in.", "The quiz is closed") },
      },
    },
    {
      method: "post",
      path: "/sessions/:id/quizzes/:quizId/attempt/submit",
      access: "student",
      handler: async (req, res) => {
        const { session, quiz } = ids(req);
        res.json(await service.submit(requireAuth(req), session, quiz));
      },
      doc: {
        summary: "Hand in a quiz",
        requestBody: { schema: { type: "object" }, example: {}, description: "No body needed." },
        description: "Grades your answers (unanswered ones count as wrong) and returns the result with the right answers, explanations and your place.",
        responses: { 200: { description: "Your result", schema: { type: "object" } }, 409: errorDoc("quiz_not_started", "The quiz was not started.", "Start the quiz first") },
      },
    },
  ];
}
