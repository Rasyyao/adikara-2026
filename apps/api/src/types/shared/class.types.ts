/** A class as admins and teachers see it. */
export interface ClassRow {
  id: string;
  name: string;
  classCode: string;
  teacherId: string;
  teacherName: string;
  archived: boolean;
  createdAt: Date;
  studentCount: number;
}

export interface ClassStudentRow {
  id: string;
  username: string | null;
  name: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface PageQuery {
  limit: number;
  offset: number;
}
