import { AppError } from "../../http/errors.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { TeacherClassRepository } from "../../types/teacher/class.types.js";
import { toClassStudentView, toClassView, type ClassStudentView, type ClassView } from "../shared/class-views.js";

/** Classes as teachers see them: their own (an admin sees all). Read-only; the admin changes classes. */
export interface TeacherClassService {
  list(auth: AuthContext): Promise<{ items: ClassView[] }>;
  get(auth: AuthContext, classId: string): Promise<{ class: ClassView; students: ClassStudentView[] }>;
}

export function createTeacherClassService(repository: TeacherClassRepository): TeacherClassService {
  const assertStaff = (auth: AuthContext) => {
    if (auth.kind !== "teacher") throw new AppError(403, "forbidden", "You do not have access to this resource");
  };

  return {
    async list(auth) {
      assertStaff(auth);
      const rows = await repository.list(auth.role === "ADMIN" ? null : auth.userId);
      return { items: rows.map(toClassView) };
    },

    async get(auth, classId) {
      assertStaff(auth);
      const row = await repository.findById(classId);
      // another teacher's class looks like a missing one
      if (!row || (auth.role === "TEACHER" && row.teacherId !== auth.userId)) {
        throw new AppError(404, "class_not_found", "Class not found");
      }
      const students = await repository.listStudents(row.id);
      return { class: toClassView(row), students: students.map(toClassStudentView) };
    },
  };
}
