import type { PrismaClient } from "../../generated/prisma/client.js";
import type { TeacherClassRepository } from "../../types/teacher/class.types.js";
import type { ClassRow } from "../../types/shared/class.types.js";

const include = { teacher: { select: { name: true } }, _count: { select: { students: true } } } as const;

type Row = {
  id: string;
  name: string;
  classCode: string;
  teacherId: string;
  archivedAt: Date | null;
  createdAt: Date;
  teacher: { name: string };
  _count: { students: number };
};

const toClassRow = (row: Row): ClassRow => ({
  id: row.id,
  name: row.name,
  classCode: row.classCode,
  teacherId: row.teacherId,
  teacherName: row.teacher.name,
  archived: row.archivedAt !== null,
  createdAt: row.createdAt,
  studentCount: row._count.students,
});

export function createTeacherClassRepository(prisma: PrismaClient): TeacherClassRepository {
  return {
    async list(teacherId) {
      const rows = await prisma.classroom.findMany({
        where: { ...(teacherId ? { teacherId } : {}), archivedAt: null },
        include,
        orderBy: { name: "asc" },
      });
      return rows.map(toClassRow);
    },

    async findById(id) {
      const row = await prisma.classroom.findUnique({ where: { id }, include });
      return row ? toClassRow(row) : null;
    },

    async listStudents(classId) {
      const rows = await prisma.student.findMany({
        where: { classId },
        select: { id: true, username: true, alias: true },
        orderBy: { alias: "asc" },
      });
      return rows.map((row) => ({ id: row.id, username: row.username, name: row.alias }));
    },
  };
}
