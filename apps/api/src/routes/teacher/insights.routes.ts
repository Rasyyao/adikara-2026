import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import { errorDoc } from "../docs-helpers.js";
import type { TeacherInsightsService } from "../../services/teacher/insights.service.js";
import type { RouteGroup } from "../types.js";

const CLASS_NOT_FOUND = errorDoc("class_not_found", "No such class, or another teacher teaches it.", "Class not found");
const REPORT_DOC = "`report` is the newest AI feedback: `status` `pending` (the AI is writing it; poll), `done` (with `feedback`: `summary`, " +
  "`focus_topics`, `questions` with the likely misconception, `students` to help, `next_steps`) or `failed` (`error` says why).";

export function teacherInsightsRoutes(service: TeacherInsightsService): RouteGroup {
  return {
    role: "teacher",
    feature: "insights",
    description: "The teacher's dashboard: participation, quiz results, and the questions, topics and students that need attention.",
    routes: [
      {
        method: "get",
        path: "/insights",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.overview(requireAuth(req)));
        },
        doc: {
          summary: "Teaching insights",
          description:
            "Computed from the newest 30 sessions (an admin gets every teacher's). `totals`, per class (`classes`), per session " +
            "(`sessions`: joined out of the class), per quiz (`quizzes`), the questions answered wrong most (`hardest_questions`, with the " +
            "wrong option picked most and who missed it), the parts of the material answered wrong most (`topics`, from each question's " +
            "`source`), and students weakest first (`students`, with their latest missed questions).",
          responses: { 200: { description: "The insights", schema: { type: "object" } } },
        },
      },
      {
        method: "get",
        path: "/insights/classes/:id",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.classView(requireAuth(req), parseUuidParam(req.params.id, "id")));
        },
        doc: {
          summary: "Insights for one class",
          description:
            "The same numbers as `/insights`, from this class's newest 30 sessions only, with every student on the roster in `students`. " +
            "`attendance` lists the started sessions (oldest first) and, per student, `present` for each of them. " + REPORT_DOC,
          responses: { 200: { description: "The class insights", schema: { type: "object" } }, 404: CLASS_NOT_FOUND },
        },
      },
      {
        method: "post",
        path: "/insights/classes/:id/feedback",
        access: "staff",
        handler: async (req, res) => {
          res.status(202).json(await service.requestFeedback(requireAuth(req), parseUuidParam(req.params.id, "id")));
        },
        doc: {
          summary: "Ask the AI for feedback on a class",
          requestBody: { schema: { type: "object" }, example: {}, description: "No body needed." },
          description:
            "Sends the class's current results (hardest questions, weak topics, students needing help, attendance) to the AI worker, which " +
            "writes feedback for the teacher. While one is still `pending` it is returned instead of a new one. Poll `GET …/feedback`.",
          responses: {
            202: { description: "The pending report", schema: { type: "object" } },
            404: CLASS_NOT_FOUND,
            409: errorDoc("no_results", "No quiz has been handed in in this class yet, so there is nothing to analyse.", "This class has no handed-in quizzes to analyse yet"),
          },
        },
      },
      {
        method: "get",
        path: "/insights/classes/:id/feedback",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.feedback(requireAuth(req), parseUuidParam(req.params.id, "id")));
        },
        doc: {
          summary: "The newest AI feedback on a class",
          description: REPORT_DOC + " `report` is null when none was asked for yet.",
          responses: { 200: { description: "The report", schema: { type: "object" } }, 404: CLASS_NOT_FOUND },
        },
      },
    ],
  };
}
