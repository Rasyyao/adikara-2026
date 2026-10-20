import type { ClassRow, ClassStudentRow, Page, PageQuery } from "../shared/class.types.js";

export interface AdminClassRepository {
  list(query: PageQuery & { teacherId?: string; includeArchived: boolean; search?: string }): Promise<Page<ClassRow>>;
  findById(id: string): Promise<ClassRow | null>;
  listStudents(classId: string): Promise<ClassStudentRow[]>;
  create(data: { name: string; classCode: string; teacherId: string }): Promise<ClassRow | "class_code_taken">;
  update(id: string, patch: { name?: string; teacherId?: string; archived?: boolean }): Promise<ClassRow | null>;
  /** "in_use" when the class still has students, sessions or packages. */
  delete(id: string): Promise<"deleted" | "not_found" | "in_use">;
  hasLiveSession(classId: string): Promise<boolean>;
}
