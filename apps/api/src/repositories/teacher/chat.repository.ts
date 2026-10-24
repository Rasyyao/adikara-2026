import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ChatMaterialRow, ChatMessageRow, TeacherChatRepository } from "../../types/teacher/chat.types.js";

type MessageDb = { id: string; chatId: string; role: ChatMessageRow["role"]; content: string; sources: unknown; createdAt: Date };
type MaterialDb = { id: string; title: string; fileType: string; status: ChatMaterialRow["status"]; error: string | null };

const toMessage = (row: MessageDb): ChatMessageRow => ({
  id: row.id,
  chatId: row.chatId,
  role: row.role,
  content: row.content,
  sources: Array.isArray(row.sources) ? (row.sources as string[]) : null,
  createdAt: row.createdAt,
});

const toMaterial = (row: MaterialDb): ChatMaterialRow => ({
  id: row.id,
  title: row.title,
  fileType: row.fileType,
  status: row.status,
  error: row.error,
});

const materialSelect = { id: true, title: true, fileType: true, status: true, error: true } as const;

export function createTeacherChatRepository(prisma: PrismaClient): TeacherChatRepository {
  return {
    async create(teacherId, title) {
      return prisma.chat.create({ data: { teacherId, title } });
    },

    async list(teacherId) {
      return prisma.chat.findMany({ where: teacherId ? { teacherId } : {}, orderBy: { createdAt: "desc" } });
    },

    async findById(id) {
      return prisma.chat.findUnique({ where: { id } });
    },

    async listMessages(chatId, { limit, after }) {
      if (after) {
        // Prisma finds the cursor row without the `where`, so a message of another chat must be refused here
        const known = await prisma.chatMessage.findFirst({ where: { id: after, chatId }, select: { id: true } });
        if (!known) return [];
        // a message id is the cursor: timestamps would lose the microseconds PostgreSQL keeps
        const rows = await prisma.chatMessage.findMany({
          where: { chatId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          cursor: { id: after },
          skip: 1,
          take: limit,
        });
        return rows.map(toMessage);
      }
      const latest = await prisma.chatMessage.findMany({
        where: { chatId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      });
      return latest.reverse().map(toMessage); // the latest `limit`, back in reading order
    },

    async listMaterials(chatId) {
      const rows = await prisma.chatMaterial.findMany({
        where: { chatId },
        orderBy: { addedAt: "asc" },
        select: { material: { select: materialSelect } },
      });
      return rows.map((row) => toMaterial(row.material));
    },

    async hasPendingReply(chatId) {
      const count = await prisma.job.count({
        where: { type: "CHAT_REPLY", status: { in: ["QUEUED", "RUNNING"] }, payload: { path: ["chatId"], equals: chatId } },
      });
      return count > 0;
    },

    async addMessage({ chatId, content, material }) {
      const result = await prisma.$transaction(async (tx) => {
        const message = await tx.chatMessage.create({ data: { chatId, role: "USER", content } });
        let saved: MaterialDb | null = null;
        if (material) {
          saved = await tx.material.create({ data: material, select: materialSelect });
          await tx.chatMaterial.create({ data: { chatId, materialId: saved.id } });
          // no ordering is needed between the two jobs: the worker holds the reply back until the chat's files are read
          await tx.job.create({ data: { type: "EXTRACT", payload: { materialId: saved.id } } });
        }
        await tx.job.create({ data: { type: "CHAT_REPLY", payload: { chatId, messageId: message.id } } });
        return { message, saved };
      });
      // after the commit: a NOTIFY sent earlier would wake the worker before the rows are visible
      await prisma.$executeRaw`SELECT pg_notify('jobs', '')`;
      return { message: toMessage(result.message), material: result.saved ? toMaterial(result.saved) : null };
    },
  };
}
