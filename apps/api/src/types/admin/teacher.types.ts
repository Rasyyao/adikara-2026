import type { Page, PageQuery } from "../shared/class.types.js";

export interface TeacherRow {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  classCount: number;
}

/** Only accounts with role TEACHER are visible here. Admin accounts are never listed, changed or deleted by this repository. */
export interface AdminTeacherRepository {
  list(query: PageQuery & { search?: string }): Promise<Page<TeacherRow>>;
  findById(id: string): Promise<TeacherRow | null>;
  create(data: { email: string; name: string; passwordHash: string }): Promise<TeacherRow | "email_taken">;
  update(
    id: string,
    patch: { email?: string; name?: string; passwordHash?: string },
  ): Promise<TeacherRow | "email_taken" | null>;
  /** "in_use" when the teacher still owns classes, sessions or materials. */
  delete(id: string): Promise<"deleted" | "not_found" | "in_use">;
}
