import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ProblemGeneration, ProblemRecord, ProblemSource, TeacherProblemRepository } from "../../types/teacher/problem.types.js";

const STATUS = { draft: "DRAF", ready: "DIPUBLIKASIKAN" } as const;
const include = { chat: { select: { title: true } } } as const;

type Row = {
  id: string;
  teacherId: string;
  chatId: string | null;
  title: string;
  story: string;
  status: string;
  challenge: unknown;
  origin: string;
  aiFocus: string | null;
  generation: string | null;
  generationError: string | null;
  createdAt: Date;
  updatedAt: Date;
  chat: { title: string } | null;
};

const toRecord = (row: Row): ProblemRecord => ({
  id: row.id,
  teacherId: row.teacherId,
  chatId: row.chatId,
  chatTitle: row.chat?.title ?? null,
  title: row.title,
  story: row.story,
  status: row.status === STATUS.ready ? "ready" : "draft",
  challenge: row.challenge,
  origin: row.origin === "ai" ? "ai" : "manual",
  aiFocus: row.aiFocus,
  generation: (row.generation === "pending" || row.generation === "failed" ? row.generation : null) as ProblemGeneration,
  generationError: row.generationError,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const jobPayload = (problemId: string, chatId: string, focus: string | null) => ({ problemId, chatId, ...(focus ? { focus } : {}) });

export function createTeacherProblemRepository(prisma: PrismaClient): TeacherProblemRepository {
  const sourcesWhere = async (where: { teacherId?: string; id?: string }): Promise<ProblemSource[]> => {
    const chats = await prisma.chat.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        teacherId: true,
        title: true,
        materials: { select: { material: { select: { status: true } } } },
        _count: { select: { problems: true } },
      },
    });
    return chats.map((c) => ({
      chatId: c.id,
      teacherId: c.teacherId,
      title: c.title,
      readyFiles: c.materials.filter((m) => m.material.status === "EXTRACTED").length,
      pendingFiles: c.materials.filter((m) => m.material.status === "UPLOADED").length,
      problems: c._count.problems,
    }));
  };

  return {
    async list(teacherId, chatId) {
      const rows = await prisma.blockProblem.findMany({
        where: { ...(teacherId ? { teacherId } : {}), ...(chatId !== undefined ? { chatId } : {}) },
        include,
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(toRecord);
    },

    async find(id) {
      const row = await prisma.blockProblem.findUnique({ where: { id }, include });
      return row ? toRecord(row) : null;
    },

    async create({ teacherId, chatId, title, story, challenge }) {
      return toRecord(await prisma.blockProblem.create({ data: { teacherId, chatId, title, story, challenge: challenge as object }, include }));
    },

    async update(id, changes) {
      const row = await prisma.blockProblem.update({
        where: { id },
        include,
        data: {
          ...(changes.title !== undefined ? { title: changes.title } : {}),
          ...(changes.story !== undefined ? { story: changes.story } : {}),
          ...(changes.challenge !== undefined ? { challenge: changes.challenge as object } : {}),
          ...(changes.status !== undefined ? { status: STATUS[changes.status] } : {}),
          ...(changes.chatId !== undefined ? { chatId: changes.chatId } : {}),
          ...(changes.generation === null ? { generation: null, generationError: null } : {}),
        },
      });
      return toRecord(row);
    },

    async remove(id) {
      await prisma.$transaction([
        prisma.job.deleteMany({ where: { status: "QUEUED", type: "GENERATE_PROBLEM", payload: { path: ["problemId"], equals: id } } }),
        prisma.blockProblem.delete({ where: { id } }),
      ]);
    },

    sources: (teacherId) => sourcesWhere(teacherId ? { teacherId } : {}),

    async findSource(chatId) {
      return (await sourcesWhere({ id: chatId }))[0] ?? null;
    },

    async createGenerating({ teacherId, chatId, title, focus, challenge, count }) {
      const rows = await prisma.$transaction(async (tx) => {
        const made = [];
        for (let i = 0; i < count; i++) {
          const row = await tx.blockProblem.create({
            data: { teacherId, chatId, title, story: "", challenge: challenge as object, origin: "ai", aiFocus: focus, generation: "pending" },
            include,
          });
          await tx.job.create({ data: { type: "GENERATE_PROBLEM", payload: jobPayload(row.id, chatId, focus) } });
          made.push(row);
        }
        return made;
      });
      await prisma.$executeRaw`SELECT pg_notify('jobs', '')`;
      return rows.map(toRecord);
    },

    async regenerate(id, focus) {
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.blockProblem.update({ where: { id }, include, data: { generation: "pending", generationError: null, aiFocus: focus, status: STATUS.draft } });
        await tx.job.create({ data: { type: "GENERATE_PROBLEM", payload: jobPayload(id, updated.chatId!, focus) } });
        return updated;
      });
      await prisma.$executeRaw`SELECT pg_notify('jobs', '')`;
      return toRecord(row);
    },
  };
}
