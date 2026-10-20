import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AdminClassRepository } from "../../types/admin/class.types.js";
import type { ClassRow } from "../../types/shared/class.types.js";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "../prisma-errors.js";

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

export function createAdminClassRepository(prisma: PrismaClient): AdminClassRepository {
  return {
    async list({ limit, offset, teacherId, includeArchived, search }) {
      const where = {
        ...(teacherId ? { teacherId } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
        ...(search
          ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { classCode: { contains: search, mode: "insensitive" as const } }] }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.classroom.findMany({ where, include, orderBy: [{ name: "asc" }, { id: "asc" }], take: limit, skip: offset }),
        prisma.classroom.count({ where }),
      ]);
      return { items: rows.map(toClassRow), total };
    },

    async findById(id) {
      const row = await prisma.classroom.findUnique({ where: { id }, include });
      return row ? toClassRow(row) : null;
    },

    async listStudents(classId) {
      const rows = await prisma.student.findMany({
        where: { classId },
        select: { id: true, username: true, alias: true },
        orderBy: [{ alias: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => ({ id: row.id, username: row.username, name: row.alias }));
    },

    async create(data) {
      try {
        return toClassRow(await prisma.classroom.create({ data, include }));
      } catch (err) {
        if (isUniqueViolation(err)) return "class_code_taken";
        throw err;
      }
    },

    async update(id, { archived, ...rest }) {
      try {
        const row = await prisma.classroom.update({
          where: { id },
          data: { ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) },
          include,
        });
        return toClassRow(row);
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async delete(id) {
      try {
        await prisma.classroom.delete({ where: { id } });
        return "deleted";
      } catch (err) {
        if (isNotFound(err)) return "not_found";
        if (isForeignKeyViolation(err)) return "in_use";
        throw err;
      }
    },

    async hasLiveSession(classId) {
      return (await prisma.classSession.count({ where: { classId, status: { not: "ENDED" } } })) > 0;
    },
  };
}
