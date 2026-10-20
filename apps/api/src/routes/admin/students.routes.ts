import { ref } from "../../docs/schemas.js";
import { parseCreateStudent, parseUpdateStudent } from "../../http/validators/admin/student.js";
import { parseOptionalUuidQuery, parsePageQuery, parseUuidParam } from "../../http/validators/shared/common.js";
import type { AdminStudentService } from "../../services/admin/student.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

const NOT_FOUND = errorDoc("student_not_found", "No student with that id.", "Student not found");
const USERNAME_TAKEN = errorDoc("username_taken", "That username is already used by another student.", "That username is already used by another student");

export function adminStudentRoutes(service: AdminStudentService): RouteGroup {
  const idOf = (req: { params: Record<string, unknown> }) => parseUuidParam(req.params.id, "id");

  return {
    role: "admin",
    feature: "students",
    description:
      "Create, read, update and delete student accounts, and put each student in a class. " +
      "Only the admin can change a student's class, so students cannot end up in a wrong class.",
    routes: [
      {
        method: "get",
        path: "/admin/students",
        access: "admin",
        handler: async (req, res) => {
          res.json(await service.list({ ...parsePageQuery(req.query), classId: parseOptionalUuidQuery(req.query, "class_id") }));
        },
        doc: {
          summary: "List students",
          query: [
            { name: "class_id", description: "Only the students of this class.", schema: { type: "string", format: "uuid" } },
            { name: "q", description: "Search in name and username.", schema: { type: "string", maxLength: 100 } },
            { name: "limit", description: "Page size (default 50).", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "offset", description: "Rows to skip (default 0).", schema: { type: "integer", minimum: 0 } },
          ],
          responses: { 200: { description: "A page of students", schema: ref("StudentPage") } },
        },
      },
      {
        method: "post",
        path: "/admin/students",
        access: "admin",
        handler: async (req, res) => {
          res.status(201).json(await service.create(parseCreateStudent(req.body)));
        },
        doc: {
          summary: "Create a student in a class",
          description: "The student logs in at `POST /auth/student/login`. The class must exist and must not be archived.",
          requestBody: {
            schema: ref("CreateStudentRequest"),
            example: { username: "siswa.tiga", name: "Siswa Tiga", password: "Siswa-pass-123", class_id: "00000000-0000-4000-8000-0000000000c1" },
          },
          responses: {
            201: { description: "Created", schema: ref("StudentResponse") },
            404: errorDoc("class_not_found", "No class with that `class_id`.", "Class not found"),
            409: USERNAME_TAKEN,
          },
        },
      },
      {
        method: "get",
        path: "/admin/students/:id",
        access: "admin",
        handler: async (req, res) => {
          res.json(await service.get(idOf(req)));
        },
        doc: {
          summary: "Read a student",
          responses: { 200: { description: "The student and their class", schema: ref("StudentResponse") }, 404: NOT_FOUND },
        },
      },
      {
        method: "patch",
        path: "/admin/students/:id",
        access: "admin",
        handler: async (req, res) => {
          res.json(await service.update(idOf(req), parseUpdateStudent(req.body)));
        },
        doc: {
          summary: "Update a student or move them to another class",
          description:
            "Send only the fields to change (at least one). `class_id` moves the student to another class (the class must exist and not be archived); " +
            "it is refused with `student_in_live_session` while the student is in a live session. Sending `password` resets the password.",
          requestBody: { schema: ref("UpdateStudentRequest"), example: { class_id: "00000000-0000-4000-8000-0000000000c2" } },
          responses: {
            200: { description: "Updated", schema: ref("StudentResponse") },
            404: errorDoc("student_not_found", "No such student, or no class with that `class_id` (`class_not_found`).", "Student not found"),
            409: errorDoc("student_in_live_session", "`username_taken`, `class_archived` or `student_in_live_session`.", "The student is in a live session. Move them after it ends."),
          },
        },
      },
      {
        method: "delete",
        path: "/admin/students/:id",
        access: "admin",
        handler: async (req, res) => {
          await service.remove(idOf(req));
          res.status(204).end();
        },
        doc: {
          summary: "Delete a student",
          description: "Attendance rows of the student are deleted with them. Refused with `student_in_use` when the student has attempts, submissions or diagnoses.",
          responses: {
            204: { description: "Deleted" },
            404: NOT_FOUND,
            409: errorDoc("student_in_use", "The student has learning records.", "The student has learning records (attempts, submissions or diagnoses) and cannot be deleted."),
          },
        },
      },
    ],
  };
}
