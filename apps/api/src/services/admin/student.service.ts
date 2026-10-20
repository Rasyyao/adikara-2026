import { AppError } from "../../http/errors.js";
import { hashPassword } from "../../lib/password.js";
import type { AdminClassRepository } from "../../types/admin/class.types.js";
import type { AdminStudentRepository, StudentRow } from "../../types/admin/student.types.js";
import { toPageView, type PageView } from "../shared/class-views.js";

export interface StudentView {
  id: string;
  username: string | null;
  name: string | null;
  class: { id: string; name: string; class_code: string };
  created_at: string;
}

export interface StudentInput {
  username: string;
  name: string;
  password: string;
  classId: string;
}

/**
 * Admin management of student accounts. Putting a student in a class happens only here, and only into an
 * existing, active class, so a student cannot end up in the wrong class by themselves.
 */
export interface AdminStudentService {
  list(query: { limit: number; offset: number; classId?: string; search?: string }): Promise<PageView<StudentView>>;
  get(id: string): Promise<{ student: StudentView }>;
  create(input: StudentInput): Promise<{ student: StudentView }>;
  update(id: string, patch: Partial<StudentInput>): Promise<{ student: StudentView }>;
  remove(id: string): Promise<void>;
}

const toView = (row: StudentRow): StudentView => ({
  id: row.id,
  username: row.username,
  name: row.name,
  class: { id: row.classId, name: row.className, class_code: row.classCode },
  created_at: row.createdAt.toISOString(),
});

const notFound = () => new AppError(404, "student_not_found", "Student not found");
const usernameTaken = () => new AppError(409, "username_taken", "That username is already used by another student");

export function createAdminStudentService(
  students: AdminStudentRepository,
  classes: AdminClassRepository,
  options: { bcryptCost: number },
): AdminStudentService {
  async function assertAssignableClass(classId: string): Promise<void> {
    const target = await classes.findById(classId);
    if (!target) throw new AppError(404, "class_not_found", "Class not found");
    if (target.archived) throw new AppError(409, "class_archived", "The class is archived");
  }

  return {
    async list(query) {
      return toPageView(await students.list(query), query, toView);
    },

    async get(id) {
      const row = await students.findById(id);
      if (!row) throw notFound();
      return { student: toView(row) };
    },

    async create({ username, name, password, classId }) {
      await assertAssignableClass(classId);
      const result = await students.create({ username, name, classId, passwordHash: await hashPassword(password, options.bcryptCost) });
      if (result === "username_taken") throw usernameTaken();
      return { student: toView(result) };
    },

    async update(id, { password, ...rest }) {
      const current = await students.findById(id);
      if (!current) throw notFound();

      if (rest.classId !== undefined && rest.classId !== current.classId) {
        await assertAssignableClass(rest.classId);
        // Moving someone out of the class while they sit in its live session would leave them in the wrong lobby.
        if (await students.isInLiveSession(id)) {
          throw new AppError(409, "student_in_live_session", "The student is in a live session. Move them after it ends.");
        }
      }

      const result = await students.update(id, {
        ...rest,
        ...(password === undefined ? {} : { passwordHash: await hashPassword(password, options.bcryptCost) }),
      });
      if (result === "username_taken") throw usernameTaken();
      if (!result) throw notFound();
      return { student: toView(result) };
    },

    async remove(id) {
      const result = await students.delete(id);
      if (result === "not_found") throw notFound();
      if (result === "in_use") {
        throw new AppError(409, "student_in_use", "The student has learning records (attempts, submissions or diagnoses) and cannot be deleted.");
      }
    },
  };
}
