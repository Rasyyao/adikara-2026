import { ref } from "../../docs/schemas.js";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import type { TeacherClassService } from "../../services/teacher/class.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

export function teacherClassRoutes(service: TeacherClassService): RouteGroup {
  return {
    role: "teacher",
    feature: "classes",
    description: "The classes a teacher teaches and their students (read-only; the admin assigns classes and students).",
    routes: [
      {
        method: "get",
        path: "/classes",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.list(requireAuth(req)));
        },
        doc: {
          summary: "My classes",
          description: "A teacher gets the classes assigned to them; an admin gets every active class. Archived classes are left out.",
          responses: { 200: { description: "The classes", schema: ref("ClassList") } },
        },
      },
      {
        method: "get",
        path: "/classes/:id",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.get(requireAuth(req), parseUuidParam(req.params.id, "id")));
        },
        doc: {
          summary: "A class with its students",
          description: "Use `class.class_code` to start a live session.",
          responses: {
            200: { description: "The class and its students", schema: ref("ClassDetail") },
            404: errorDoc("class_not_found", "No such class, or it belongs to another teacher.", "Class not found"),
          },
        },
      },
    ],
  };
}
