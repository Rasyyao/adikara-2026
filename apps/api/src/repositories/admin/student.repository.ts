import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AdminStudentRepository, StudentRow } from "../../types/admin/student.types.js";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "../prisma-errors.js";

const include = { classroom: { select: { name: true, classCode: true } } } as const;

type Row = {
  id: string;
  username: string | null;
  alias: string | null;
  classId: string;
  createdAt: Date;
  classroom: { name: string; classCode: string };
};

const toRow = (row: Row): StudentRow => ({
  id: row.id,
  username: row.username,
  name: row.alias,
  classId: row.classId,
  className: row.classroom.name,
  classCode: row.classroom.classCode,
  createdAt: row.createdAt,
});

export function createAdminStudentRepository(prisma: PrismaClient): AdminStudentRepository {
  return {
    async list({ limit, offset, classId, search }) {
      const where = {
        ...(classId ? { classId } : {}),
        ...(search
          ? { OR: [{ alias: { contains: search, mode: "insensitive" as const } }, { username: { contains: search, mode: "insensitive" as const } }] }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.student.findMany({ where, include, orderBy: [{ alias: "asc" }, { id: "asc" }], take: limit, skip: offset }),
        prisma.student.count({ where }),
      ]);
      return { items: rows.map(toRow), total };
    },

    async findById(id) {
      const row = await prisma.student.findUnique({ where: { id }, include });
      return row ? toRow(row) : null;
    },

    async create({ name, ...data }) {
      try {
        return toRow(await prisma.student.create({ data: { ...data, alias: name, role: "USER" }, include }));
      } catch (err) {
        if (isUniqueViolation(err)) return "username_taken";
        throw err;
      }
    },

    async update(id, { name, ...rest }) {
      try {
        const row = await prisma.student.update({
          where: { id },
          data: { ...rest, ...(name === undefined ? {} : { alias: name }) },
          include,
        });
        return toRow(row);
      } catch (err) {
        if (isUniqueViolation(err)) return "username_taken";
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async delete(id) {
      try {
        await prisma.student.delete({ where: { id } });
        return "deleted";
      } catch (err) {
        if (isNotFound(err)) return "not_found";
        if (isForeignKeyViolation(err)) return "in_use";
        throw err;
      }
    },

    async isInLiveSession(studentId) {
      const count = await prisma.sessionParticipant.count({
        where: { studentId, kickedAt: null, session: { status: { not: "ENDED" } } },
      });
      return count > 0;
    },
  };
}
