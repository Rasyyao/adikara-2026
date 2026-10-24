import type { ChatMaterialRow, ChatMessageRow, ChatRow } from "../../types/teacher/chat.types.js";

export const toChatView = (row: ChatRow) => ({
  id: row.id,
  title: row.title,
  created_at: row.createdAt.toISOString(),
});

export const toMessageView = (row: ChatMessageRow) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  sources: row.sources,
  created_at: row.createdAt.toISOString(),
});

export const toMaterialView = (row: ChatMaterialRow) => ({
  id: row.id,
  title: row.title,
  file_type: row.fileType,
  status: row.status,
  error: row.error,
});

export type ChatView = ReturnType<typeof toChatView>;
export type MessageView = ReturnType<typeof toMessageView>;
export type MaterialView = ReturnType<typeof toMaterialView>;
