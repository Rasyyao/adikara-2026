import type { Page, PageQuery } from "../shared/class.types.js";

export interface StudentRow {
  id: string;
  username: string | null;
  name: string | null;
  classId: string;
  className: string;
  classCode: string;
  createdAt: Date;
}

export interface AdminStudentRepository {
  list(query: PageQuery & { classId?: string; search?: string }): Promise<Page<StudentRow>>;
  findById(id: string): Promise<StudentRow | null>;
  create(data: { username: string; name: string; passwordHash: string; classId: string }): Promise<StudentRow | "username_taken">;
  update(
    id: string,
    patch: { username?: string; name?: string; passwordHash?: string; classId?: string },
  ): Promise<StudentRow | "username_taken" | null>;
  /** "in_use" when the student has learning records (attempts, submissions, diagnoses). Attendance rows are deleted with the student. */
  delete(id: string): Promise<"deleted" | "not_found" | "in_use">;
  /** In a lobby or running session right now. */
  isInLiveSession(studentId: string): Promise<boolean>;
}
