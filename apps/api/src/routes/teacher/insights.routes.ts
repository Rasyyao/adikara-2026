import { requireAuth } from "../../http/middleware/authenticate.js";
import type { TeacherInsightsService } from "../../services/teacher/insights.service.js";
import type { RouteGroup } from "../types.js";

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
    ],
  };
}
