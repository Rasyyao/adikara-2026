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

    async remove(chatId) {
      return prisma.$transaction(async (tx) => {
        const links = await tx.chatMaterial.findMany({ where: { chatId }, select: { materialId: true } });
        const materialIds = links.map((l) => l.materialId);
        // messages and the chat/material links cascade; class sessions only lose their pointer to the chat
        await tx.chat.delete({ where: { id: chatId } });
        const orphans = await tx.material.findMany({
          where: { id: { in: materialIds }, chats: { none: {} }, packages: { none: {} } },
          select: { id: true, filePath: true },
        });
        await tx.material.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
        // jobs that have not started would only fail on rows that are gone (one already running is handled by the worker)
        await tx.job.deleteMany({ where: { status: "QUEUED", type: "CHAT_REPLY", payload: { path: ["chatId"], equals: chatId } } });
        for (const { id } of orphans) {
          await tx.job.deleteMany({ where: { status: "QUEUED", type: "EXTRACT", payload: { path: ["materialId"], equals: id } } });
        }
        return orphans.map((o) => o.filePath);
      });
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

    async updateAssistantContent(chatId, messageId, content) {
      const { count } = await prisma.chatMessage.updateMany({ where: { id: messageId, chatId, role: "ASSISTANT" }, data: { content } });
      if (count === 0) return null;
      const row = await prisma.chatMessage.findUnique({ where: { id: messageId } });
      return row ? toMessage(row) : null;
    },

    async listMaterials(chatId) {
      const rows = await prisma.chatMaterial.findMany({
        where: { chatId },
        orderBy: { addedAt: "asc" },
        select: { material: { select: materialSelect } },
      });
      return rows.map((row) => toMaterial(row.material));
    },

    async findMaterial(chatId, materialId) {
      const link = await prisma.chatMaterial.findFirst({
        where: { chatId, materialId },
        select: { material: { select: { ...materialSelect, filePath: true, extractedText: true } } },
      });
      if (!link) return null;
      const { filePath, extractedText, ...rest } = link.material;
      return { ...toMaterial(rest), filePath, extractedText };
    },

    async cancelReply(chatId) {
      const { count } = await prisma.job.deleteMany({
        where: { type: "CHAT_REPLY", status: { in: ["QUEUED", "RUNNING"] }, payload: { path: ["chatId"], equals: chatId } },
      });
      // wake the listeners of this chat so every open screen stops waiting
      await prisma.$executeRaw`SELECT pg_notify('chat_events', ${chatId})`;
      return count;
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
