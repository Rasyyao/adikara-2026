import { ref } from "../../docs/schemas.js";
import { requireAuth } from "../../http/middleware/authenticate.js";
import { parseUuidParam } from "../../http/validators/shared/common.js";
import {
  parseCreateClassStudent,
  parseCreateTeacherClass,
  parseUpdateClassStudent,
  parseUpdateTeacherClass,
} from "../../http/validators/teacher/class.js";
import type { TeacherClassService } from "../../services/teacher/class.service.js";
import { errorDoc } from "../docs-helpers.js";
import type { RouteGroup } from "../types.js";

const CLASS_NOT_FOUND = errorDoc("class_not_found", "No such class, or it belongs to another teacher.", "Class not found");
const STUDENT_NOT_FOUND = errorDoc("student_not_found", "No such student in this class.", "Student not found");
const USERNAME_TAKEN = errorDoc("username_taken", "That username is already used by another student.", "That username is already used by another student");
const LIVE = errorDoc("student_in_live_session", "The student is in a live session.", "The student is in a live session. Remove them after it ends.");

export function teacherClassRoutes(service: TeacherClassService): RouteGroup {
  const idOf = (req: { params: Record<string, unknown> }) => parseUuidParam(req.params.id, "id");
  const studentIdOf = (req: { params: Record<string, unknown> }) => parseUuidParam(req.params.studentId, "studentId");

  return {
    role: "teacher",
    feature: "classes",
    description: "The classes a teacher teaches: create, rename, archive and delete them, and add, edit, move and remove their students. Only students of a class can join its live sessions.",
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
      {
        method: "post",
        path: "/classes",
        access: "staff",
        handler: async (req, res) => {
          res.status(201).json(await service.create(requireAuth(req), parseCreateTeacherClass(req.body)));
        },
        doc: {
          summary: "Create a class",
          description: "The class belongs to the caller. Leave `class_code` out to get a made-up one; it never changes later.",
          requestBody: { schema: ref("CreateTeacherClassRequest"), example: { name: "Kelas 7B" } },
          responses: {
            201: { description: "Created", schema: ref("ClassResponse") },
            409: errorDoc("class_code_taken", "That class code is already used.", "That class code is already used"),
          },
        },
      },
      {
        method: "patch",
        path: "/classes/:id",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.update(requireAuth(req), idOf(req), parseUpdateTeacherClass(req.body)));
        },
        doc: {
          summary: "Rename, archive or restore a class",
          description: "Archiving is refused (`class_has_live_session`) while the class has a live session.",
          requestBody: { schema: ref("UpdateTeacherClassRequest"), example: { name: "Kelas 7C" } },
          responses: {
            200: { description: "Updated", schema: ref("ClassResponse") },
            404: CLASS_NOT_FOUND,
            409: errorDoc("class_has_live_session", "The class has a live session; end it first.", "End the class's live session first"),
          },
        },
      },
      {
        method: "delete",
        path: "/classes/:id",
        access: "staff",
        handler: async (req, res) => {
          await service.remove(requireAuth(req), idOf(req));
          res.status(204).end();
        },
        doc: {
          summary: "Delete a class",
          description: "Refused with `class_in_use` while the class has students or session history. Archive it instead.",
          responses: {
            204: { description: "Deleted" },
            404: CLASS_NOT_FOUND,
            409: errorDoc("class_in_use", "The class still has students or session history.", "The class still has students or session history."),
          },
        },
      },
      {
        method: "post",
        path: "/classes/:id/students",
        access: "staff",
        handler: async (req, res) => {
          const classId = idOf(req);
          res.status(201).json(await service.addStudent(requireAuth(req), classId, parseCreateClassStudent(req.body, classId)));
        },
        doc: {
          summary: "Add a student to a class",
          description: "Creates the student account. The student logs in at `POST /auth/student/login` and can join this class's live sessions.",
          requestBody: {
            schema: ref("CreateClassStudentRequest"),
            example: { username: "siswa.empat", name: "Siswa Empat", password: "Siswa-pass-123" },
          },
          responses: {
            201: { description: "Created", schema: ref("StudentResponse") },
            404: CLASS_NOT_FOUND,
            409: USERNAME_TAKEN,
          },
        },
      },
      {
        method: "patch",
        path: "/classes/:id/students/:studentId",
        access: "staff",
        handler: async (req, res) => {
          res.json(await service.updateStudent(requireAuth(req), idOf(req), studentIdOf(req), parseUpdateClassStudent(req.body)));
        },
        doc: {
          summary: "Edit a student or move them to another of my classes",
          description: "Send only the fields to change. `class_id` must be another class of the same teacher. A student in a live session cannot be moved.",
          requestBody: { schema: ref("UpdateStudentRequest"), example: { name: "Siswa Baru" } },
          responses: {
            200: { description: "Updated", schema: ref("StudentResponse") },
            404: STUDENT_NOT_FOUND,
            409: USERNAME_TAKEN,
          },
        },
      },
      {
        method: "delete",
        path: "/classes/:id/students/:studentId",
        access: "staff",
        handler: async (req, res) => {
          await service.removeStudent(requireAuth(req), idOf(req), studentIdOf(req));
          res.status(204).end();
        },
        doc: {
          summary: "Remove a student",
          description: "Refused with `student_in_use` when the student has learning records, and `student_in_live_session` while they are in a live session.",
          responses: {
            204: { description: "Deleted" },
            404: STUDENT_NOT_FOUND,
            409: LIVE,
          },
        },
      },
    ],
  };
}
