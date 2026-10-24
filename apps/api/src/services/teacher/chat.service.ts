import { randomUUID } from "node:crypto";
import { AppError } from "../../http/errors.js";
import type { ValidFile } from "../../http/validators/teacher/chat.js";
import type { ObjectStorage } from "../../lib/storage.js";
import type { AuthContext } from "../../types/auth.types.js";
import type { ChatRow, TeacherChatRepository } from "../../types/teacher/chat.types.js";
import {
  toChatView,
  toMaterialView,
  toMessageView,
  type ChatView,
  type MaterialView,
  type MessageView,
} from "./chat-views.js";

export const DEFAULT_CHAT_TITLE = "Percakapan baru";

/** A teacher's chats with the AI: create one, send text (and optionally a file), read the conversation. */
export interface TeacherChatService {
  create(auth: AuthContext, input: { title: string | null }): Promise<{ chat: ChatView }>;
  list(auth: AuthContext): Promise<{ items: ChatView[] }>;
  get(auth: AuthContext, chatId: string): Promise<{ chat: ChatView; materials: MaterialView[]; reply_pending: boolean }>;
  messages(auth: AuthContext, chatId: string, query: { limit: number; after?: string }): Promise<{ items: MessageView[]; reply_pending: boolean }>;
  send(
    auth: AuthContext,
    chatId: string,
    input: { text: string; file: ValidFile | null },
  ): Promise<{ message: MessageView; material: MaterialView | null; reply_pending: true }>;
}

export function createTeacherChatService(repository: TeacherChatRepository, storage: ObjectStorage): TeacherChatService {
  const assertStaff = (auth: AuthContext) => {
    if (auth.kind !== "teacher") throw new AppError(403, "forbidden", "You do not have access to this resource");
  };

  /** The chat, or 404 — also for another teacher's chat, so ids cannot be probed. An admin may open any chat. */
  const ownChat = async (auth: AuthContext, chatId: string): Promise<ChatRow> => {
    assertStaff(auth);
    const chat = await repository.findById(chatId);
    if (!chat || (auth.role === "TEACHER" && chat.teacherId !== auth.userId)) {
      throw new AppError(404, "chat_not_found", "Chat not found");
    }
    return chat;
  };

  return {
    async create(auth, { title }) {
      assertStaff(auth);
      return { chat: toChatView(await repository.create(auth.userId, title ?? DEFAULT_CHAT_TITLE)) };
    },

    async list(auth) {
      assertStaff(auth);
      const rows = await repository.list(auth.role === "ADMIN" ? null : auth.userId);
      return { items: rows.map(toChatView) };
    },

    async get(auth, chatId) {
      const chat = await ownChat(auth, chatId);
      const [materials, pending] = await Promise.all([repository.listMaterials(chat.id), repository.hasPendingReply(chat.id)]);
      return { chat: toChatView(chat), materials: materials.map(toMaterialView), reply_pending: pending };
    },

    async messages(auth, chatId, query) {
      const chat = await ownChat(auth, chatId);
      const [rows, pending] = await Promise.all([repository.listMessages(chat.id, query), repository.hasPendingReply(chat.id)]);
      return { items: rows.map(toMessageView), reply_pending: pending };
    },

    async send(auth, chatId, { text, file }) {
      const chat = await ownChat(auth, chatId);

      let key: string | null = null;
      if (file) {
        // the material belongs to the chat's owner, also when an admin sends it
        key = `materials/${chat.teacherId}/${randomUUID()}${file.extension}`;
        await storage.put(key, file.buffer, file.contentType);
      }

      try {
        const saved = await repository.addMessage({
          chatId: chat.id,
          content: text,
          material:
            file && key
              ? { teacherId: chat.teacherId, title: file.title, filePath: key, fileType: file.extension.slice(1) }
              : undefined,
        });
        return { message: toMessageView(saved.message), material: saved.material ? toMaterialView(saved.material) : null, reply_pending: true };
      } catch (err) {
        // nothing in the database points at the file, so do not leave it behind in storage
        if (key) await storage.remove(key).catch(() => {});
        throw err;
      }
    },
  };
}
