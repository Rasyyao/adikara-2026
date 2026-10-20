import type { ClassRow, ClassStudentRow } from "../../types/shared/class.types.js";

// How classes, students and teachers look in responses (snake_case). Used by the admin and teacher services.

export interface ClassView {
  id: string;
  name: string;
  class_code: string;
  teacher: { id: string; name: string };
  archived: boolean;
  student_count: number;
  created_at: string;
}

export interface ClassStudentView {
  id: string;
  username: string | null;
  name: string | null;
}

export interface PageView<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function toClassView(row: ClassRow): ClassView {
  return {
    id: row.id,
    name: row.name,
    class_code: row.classCode,
    teacher: { id: row.teacherId, name: row.teacherName },
    archived: row.archived,
    student_count: row.studentCount,
    created_at: row.createdAt.toISOString(),
  };
}

export const toClassStudentView = (row: ClassStudentRow): ClassStudentView => ({
  id: row.id,
  username: row.username,
  name: row.name,
});

export function toPageView<T, V>(page: { items: T[]; total: number }, query: { limit: number; offset: number }, map: (item: T) => V): PageView<V> {
  return { items: page.items.map(map), total: page.total, limit: query.limit, offset: query.offset };
}
