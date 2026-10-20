import { AppError } from "../../http/errors.js";
import type { AdminClassRepository } from "../../types/admin/class.types.js";
import type { AdminTeacherRepository } from "../../types/admin/teacher.types.js";
import {
  toClassStudentView,
  toClassView,
  toPageView,
  type ClassStudentView,
  type ClassView,
  type PageView,
} from "../shared/class-views.js";

export interface ClassInput {
  name: string;
  classCode: string;
  teacherId: string;
}

/** Admin management of classes, including which teacher owns each one. */
export interface AdminClassService {
  list(query: { limit: number; offset: number; teacherId?: string; includeArchived: boolean; search?: string }): Promise<PageView<ClassView>>;
  get(id: string): Promise<{ class: ClassView; students: ClassStudentView[] }>;
  create(input: ClassInput): Promise<{ class: ClassView }>;
  update(id: string, patch: { name?: string; teacherId?: string; archived?: boolean }): Promise<{ class: ClassView }>;
  remove(id: string): Promise<void>;
}

const notFound = () => new AppError(404, "class_not_found", "Class not found");

export function createAdminClassService(classes: AdminClassRepository, teachers: AdminTeacherRepository): AdminClassService {
  /** A class can only be given to an existing teacher account (never to an admin or a missing id). */
  async function assertTeacher(teacherId: string): Promise<void> {
    if (!(await teachers.findById(teacherId))) throw new AppError(404, "teacher_not_found", "Teacher not found");
  }

  return {
    async list(query) {
      return toPageView(await classes.list(query), query, toClassView);
    },

    async get(id) {
      const row = await classes.findById(id);
      if (!row) throw notFound();
      return { class: toClassView(row), students: (await classes.listStudents(id)).map(toClassStudentView) };
    },

    async create({ name, classCode, teacherId }) {
      await assertTeacher(teacherId);
      const result = await classes.create({ name, classCode, teacherId });
      if (result === "class_code_taken") throw new AppError(409, "class_code_taken", "That class code is already used");
      return { class: toClassView(result) };
    },

    async update(id, patch) {
      const current = await classes.findById(id);
      if (!current) throw notFound();

      const changesTeacher = patch.teacherId !== undefined && patch.teacherId !== current.teacherId;
      if (changesTeacher) await assertTeacher(patch.teacherId as string);

      // Handing a class over or archiving it while a session runs would strand that session.
      if ((changesTeacher || patch.archived === true) && (await classes.hasLiveSession(id))) {
        throw new AppError(409, "class_has_live_session", "End the class's live session first");
      }

      const updated = await classes.update(id, patch);
      if (!updated) throw notFound();
      return { class: toClassView(updated) };
    },

    async remove(id) {
      const current = await classes.findById(id);
      if (!current) throw notFound();
      const result = await classes.delete(id);
      if (result === "not_found") throw notFound();
      if (result === "in_use") {
        throw new AppError(409, "class_in_use", "The class still has students or session history. Move the students out, or archive the class instead.", {
          student_count: current.studentCount,
        });
      }
    },
  };
}
