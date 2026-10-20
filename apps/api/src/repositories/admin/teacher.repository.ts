import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AdminTeacherRepository, TeacherRow } from "../../types/admin/teacher.types.js";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "../prisma-errors.js";

const include = { _count: { select: { classrooms: true } } } as const;

type Row = { id: string; email: string; name: string; createdAt: Date; _count: { classrooms: number } };

const toRow = (row: Row): TeacherRow => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.createdAt,
  classCount: row._count.classrooms,
});

/** Every query is limited to role TEACHER, so an admin account can never be listed, edited or deleted here. */
export function createAdminTeacherRepository(prisma: PrismaClient): AdminTeacherRepository {
  return {
    async list({ limit, offset, search }) {
      const where = {
        role: "TEACHER" as const,
        ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.teacher.findMany({ where, include, orderBy: [{ name: "asc" }, { id: "asc" }], take: limit, skip: offset }),
        prisma.teacher.count({ where }),
      ]);
      return { items: rows.map(toRow), total };
    },

    async findById(id) {
      const row = await prisma.teacher.findFirst({ where: { id, role: "TEACHER" }, include });
      return row ? toRow(row) : null;
    },

    async create(data) {
      try {
        return toRow(await prisma.teacher.create({ data: { ...data, role: "TEACHER" }, include }));
      } catch (err) {
        if (isUniqueViolation(err)) return "email_taken";
        throw err;
      }
    },

    async update(id, patch) {
      const existing = await prisma.teacher.findFirst({ where: { id, role: "TEACHER" }, select: { id: true } });
      if (!existing) return null;
      try {
        return toRow(await prisma.teacher.update({ where: { id }, data: patch, include }));
      } catch (err) {
        if (isUniqueViolation(err)) return "email_taken";
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async delete(id) {
      const existing = await prisma.teacher.findFirst({ where: { id, role: "TEACHER" }, select: { id: true } });
      if (!existing) return "not_found";
      try {
        await prisma.teacher.delete({ where: { id } });
        return "deleted";
      } catch (err) {
        if (isForeignKeyViolation(err)) return "in_use";
        if (isNotFound(err)) return "not_found";
        throw err;
      }
    },
  };
}
