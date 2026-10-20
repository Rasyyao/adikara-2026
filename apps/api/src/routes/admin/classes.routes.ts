import { ref } from "../../docs/schemas.js";
import { parseCreateClass, parseIncludeArchived, parseUpdateClass } from "../../http/validators/admin/class.js";
import { parseOptionalUuidQuery, parsePageQuery, parseUuidParam } from "../../http/validators/shared/common.js";
import type { AdminClassService } from "../../services/admin/class.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

const NOT_FOUND = errorDoc("class_not_found", "No class with that id.", "Class not found");
const TEACHER_NOT_FOUND = errorDoc("teacher_not_found", "No teacher with that id (a class cannot be given to an admin account).", "Teacher not found");

export function adminClassRoutes(service: AdminClassService): RouteGroup {
  const idOf = (req: { params: Record<string, unknown> }) => parseUuidParam(req.params.id, "id");

  return {
    role: "admin",
    feature: "classes",
    description: "Create classes and decide which teacher teaches each one. Students are put into classes under admin/students.",
    routes: [
      {
        method: "get",
        path: "/admin/classes",
        access: "admin",
        handler: async (req, res) => {
          const page = parsePageQuery(req.query);
          res.json(
            await service.list({
              ...page,
              teacherId: parseOptionalUuidQuery(req.query, "teacher_id"),
              includeArchived: parseIncludeArchived(req.query),
            }),
          );
        },
        doc: {
          summary: "List classes",
          query: [
            { name: "teacher_id", description: "Only the classes of this teacher.", schema: { type: "string", format: "uuid" } },
            { name: "include_archived", description: "Also list archived classes (default false).", schema: { type: "boolean" } },
            { name: "q", description: "Search in name and class code.", schema: { type: "string", maxLength: 100 } },
            { name: "limit", description: "Page size (default 50).", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "offset", description: "Rows to skip (default 0).", schema: { type: "integer", minimum: 0 } },
          ],
          responses: { 200: { description: "A page of classes", schema: ref("ClassPage") } },
        },
      },
      {
        method: "post",
        path: "/admin/classes",
        access: "admin",
        handler: async (req, res) => {
          res.status(201).json(await service.create(parseCreateClass(req.body)));
        },
        doc: {
          summary: "Create a class and assign its teacher",
          description: "`class_code` is what the teacher uses to start a live session, and it cannot be changed later.",
          requestBody: {
            schema: ref("CreateClassRequest"),
            example: { name: "Kelas 7B", class_code: "KELAS7B", teacher_id: "00000000-0000-4000-8000-000000000002" },
          },
          responses: {
            201: { description: "Created", schema: ref("ClassResponse") },
            404: TEACHER_NOT_FOUND,
            409: errorDoc("class_code_taken", "That class code is already used.", "That class code is already used"),
          },
        },
      },
      {
        method: "get",
        path: "/admin/classes/:id",
        access: "admin",
        handler: async (req, res) => {
          res.json(await service.get(idOf(req)));
        },
        doc: {
          summary: "Read a class with its students",
          responses: { 200: { description: "The class and its students", schema: ref("ClassDetail") }, 404: NOT_FOUND },
        },
      },
      {
        method: "patch",
        path: "/admin/classes/:id",
        access: "admin",
        handler: async (req, res) => {
          res.json(await service.update(idOf(req), parseUpdateClass(req.body)));
        },
        doc: {
          summary: "Rename, reassign or archive a class",
          description:
            "Send only the fields to change (at least one). `teacher_id` assigns the class to another teacher; `archived` archives or restores it. " +
            "Reassigning or archiving is refused (`class_has_live_session`) while the class has a live session.",
          requestBody: { schema: ref("UpdateClassRequest"), example: { teacher_id: "00000000-0000-4000-8000-000000000002" } },
          responses: {
            200: { description: "Updated", schema: ref("ClassResponse") },
            404: errorDoc("class_not_found", "No such class, or `teacher_id` is not a teacher.", "Class not found"),
            409: errorDoc("class_has_live_session", "The class has a live session; end it first.", "End the class's live session first"),
          },
        },
      },
      {
        method: "delete",
        path: "/admin/classes/:id",
        access: "admin",
        handler: async (req, res) => {
          await service.remove(idOf(req));
          res.status(204).end();
        },
        doc: {
          summary: "Delete a class",
          description: "Refused with `class_in_use` while the class has students or session history. Move the students out, or archive the class.",
          responses: {
            204: { description: "Deleted" },
            404: NOT_FOUND,
            409: errorDoc("class_in_use", "The class still has students or session history.", "The class still has students or session history."),
          },
        },
      },
    ],
  };
}
