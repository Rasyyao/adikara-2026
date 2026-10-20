import type { ClassRow, ClassStudentRow } from "../shared/class.types.js";

/** Read-only view of classes for teachers. Changing classes or students is the admin's job. */
export interface TeacherClassRepository {
  /** Classes of one teacher, or all classes when `teacherId` is null (admins). */
  list(teacherId: string | null): Promise<ClassRow[]>;
  findById(id: string): Promise<ClassRow | null>;
  listStudents(classId: string): Promise<ClassStudentRow[]>;
}
