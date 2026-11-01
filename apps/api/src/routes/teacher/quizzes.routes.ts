import type { Request } from "express";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { parseNewQuiz } from "../../http/validators/shared/quiz.js";
import type { QuizService } from "../../services/shared/quiz.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteDefinition } from "../types.js";

const SESSION_NOT_FOUND = errorDoc("session_not_found", "Session not found, or it belongs to another teacher.", "Session not found");
const QUIZ_NOT_FOUND = errorDoc("quiz_not_found", "No such quiz in this session.", "Quiz not found");

export function teacherQuizRoutes(service: QuizService): RouteDefinition[] {
  const ids = (req: Request) => ({ session: parseUuidParam(req.params.id, "id"), quiz: parseUuidParam(req.params.quizId, "quizId") });

  // the quizzes of a session, part of its sessions group
  return [
    {
      method: "post",
      path: "/sessions/:id/quizzes",
      access: "staff",
      handler: async (req, res) => {
        res.status(201).json(await service.create(requireAuth(req), parseUuidParam(req.params.id, "id"), parseNewQuiz(req.body)));
      },
      doc: {
        summary: "Put a quiz on the board",
        description:
          "Freezes the questions sent (with answer key and explanation) and opens the quiz; everyone in the session gets `quiz_opened`. " +
          "`kind` is `pretest`, `posttest` or `quiz`; `source_chat_id` / `source_message_id` say which AI reply it came from.",
        requestBody: {
          schema: { type: "object", required: ["title", "kind", "questions"] },
          example: { title: "Pre-Test Variabel", kind: "pretest", questions: [{ question: "x = 5 lalu x = 7. Isi x?", options: [{ key: "A", text: "5" }, { key: "B", text: "7" }], answer: "B", explanation: "Nilai baru menimpa nilai lama." }] },
        },
        responses: { 201: { description: "The quiz", schema: { type: "object" } }, 404: SESSION_NOT_FOUND, 409: errorDoc("session_ended", "The session has ended.", "The session has ended") },
      },
    },
    {
      method: "get",
      path: "/sessions/:id/quizzes",
      access: "staff",
      handler: async (req, res) => {
        res.json(await service.list(requireAuth(req), parseUuidParam(req.params.id, "id")));
      },
      doc: {
        summary: "The quizzes of a session",
        description: "Oldest first, each with how many students started and handed it in.",
        responses: { 200: { description: "The quizzes", schema: { type: "object" } }, 404: SESSION_NOT_FOUND },
      },
    },
    {
      method: "post",
      path: "/sessions/:id/quizzes/:quizId/close",
      access: "staff",
      handler: async (req, res) => {
        const { session, quiz } = ids(req);
        res.json(await service.close(requireAuth(req), session, quiz));
      },
      doc: {
        summary: "Close a quiz",
        requestBody: { schema: { type: "object" }, example: {}, description: "No body needed." },
        description: "No more answers. Students still answering hand in what they have. Everyone gets `quiz_closed`.",
        responses: { 200: { description: "The closed quiz", schema: { type: "object" } }, 404: QUIZ_NOT_FOUND },
      },
    },
    {
      method: "get",
      path: "/sessions/:id/quizzes/:quizId/results",
      access: "staff",
      handler: async (req, res) => {
        const { session, quiz } = ids(req);
        res.json(await service.results(requireAuth(req), session, quiz));
      },
      doc: {
        summary: "Results of a quiz",
        description:
          "`summary` (joined, started, handed in, average, highest, lowest, time), `leaderboard` (best first: score, then time), and per " +
          "question the share right, the time taken, the picks per option, the wrong option picked most (`top_wrong`) and how many changed their answer.",
        responses: { 200: { description: "The results", schema: { type: "object" } }, 404: QUIZ_NOT_FOUND },
      },
    },
    {
      method: "get",
      path: "/sessions/:id/quizzes/:quizId/export",
      access: "staff",
      handler: async (req, res) => {
        const { session, quiz } = ids(req);
        res.json(await service.exportData(requireAuth(req), session, quiz));
      },
      doc: {
        summary: "Every answer of a quiz, for analysis",
        description:
          "One row per student per question: the pick and its text, the right answer, the first pick, every change with its time, " +
          "time on the question, visits, answer order, plus the attempt (start, end, score, entry, device). `schema_version` 1.",
        responses: { 200: { description: "The dataset", schema: { type: "object" } }, 404: QUIZ_NOT_FOUND },
      },
    },
  ];
}
