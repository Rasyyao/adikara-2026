import { ref } from "../../docs/schemas.js";
import { parsePageQuery, parseUuidParam } from "../../http/validators/shared/common.js";
import { parseCreateTeacher, parseUpdateTeacher } from "../../http/validators/admin/teacher.js";
import type { AdminTeacherService } from "../../services/admin/teacher.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

const NOT_FOUND = errorDoc("teacher_not_found", "No teacher with that id (admin accounts are not managed here).", "Teacher not found");
const EMAIL_TAKEN = errorDoc("email_taken", "That email is already used by another account.", "That email is already used by another account");

export function adminTeacherRoutes(service: AdminTeacherService): RouteGroup {
  const idOf = (req: { params: Record<string, unknown> }) => parseUuidParam(req.params.id, "id");

  return {
    role: "admin",
    feature: "teachers",
    description: "Create, read, update and delete teacher accounts. Assigning classes to a teacher is done under admin/classes.",
    routes: [
      {
        method: "get",
        path: "/admin/teachers",
        access: "admin",
        handler: async (req, res) => {
          res.json(await service.list(parsePageQuery(req.query)));
        },
        doc: {
          summary: "List teachers",
          query: [
            { name: "q", description: "Search in name and email.", schema: { type: "string", maxLength: 100 } },
            { name: "limit", description: "Page size (default 50).", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "offset", description: "Rows to skip (default 0).", schema: { type: "integer", minimum: 0 } },
          ],
          responses: { 200: { description: "A page of teachers", schema: ref("TeacherPage") } },
        },
      },
      {
        method: "post",
        path: "/admin/teachers",
        access: "admin",
        handler: async (req, res) => {
          res.status(201).json(await service.create(parseCreateTeacher(req.body)));
        },
        doc: {
          summary: "Create a teacher",
          description: "The password must be at least 8 characters with a letter and a digit. The teacher logs in at `POST /auth/login`.",
          requestBody: {
            schema: ref("CreateTeacherRequest"),
            example: { email: "pak.budi@example.com", name: "Pak Budi", password: "Guru-pass-123" },
          },
          responses: { 201: { description: "Created", schema: ref("TeacherResponse") }, 409: EMAIL_TAKEN },
        },
      },
      {
        method: "get",
        path: "/admin/teachers/:id",
        access: "admin",
        handler: async (req, res) => {
          res.json(await service.get(idOf(req)));
        },
        doc: {
          summary: "Read a teacher",
          responses: { 200: { description: "The teacher", schema: ref("TeacherResponse") }, 404: NOT_FOUND },
        },
      },
      {
        method: "patch",
        path: "/admin/teachers/:id",
        access: "admin",
        handler: async (req, res) => {
          res.json(await service.update(idOf(req), parseUpdateTeacher(req.body)));
        },
        doc: {
          summary: "Update a teacher",
          description: "Send only the fields to change (at least one). Sending `password` resets the password.",
          requestBody: { schema: ref("UpdateTeacherRequest"), example: { name: "Pak Budi Santoso" } },
          responses: { 200: { description: "Updated", schema: ref("TeacherResponse") }, 404: NOT_FOUND, 409: EMAIL_TAKEN },
        },
      },
      {
        method: "delete",
        path: "/admin/teachers/:id",
        access: "admin",
        handler: async (req, res) => {
          await service.remove(idOf(req));
          res.status(204).end();
        },
        doc: {
          summary: "Delete a teacher",
          description: "Refused with `teacher_in_use` while the teacher still owns classes (`details.class_count`). Give the classes to another teacher first.",
          responses: {
            204: { description: "Deleted" },
            404: NOT_FOUND,
            409: errorDoc("teacher_in_use", "The teacher still has classes or other data.", "This teacher still has classes or other data. Assign the classes to another teacher first."),
          },
        },
      },
    ],
  };
}
