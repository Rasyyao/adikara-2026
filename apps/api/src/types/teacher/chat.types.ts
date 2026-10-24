export type ChatMessageRole = "USER" | "ASSISTANT";
export type MaterialState = "UPLOADED" | "EXTRACTED" | "FAILED";

export interface ChatRow {
  id: string;
  teacherId: string;
  title: string;
  createdAt: Date;
}

export interface ChatMessageRow {
  id: string;
  chatId: string;
  role: ChatMessageRole;
  content: string;
  /** Ids of the material chunks an assistant reply was written from. */
  sources: string[] | null;
  createdAt: Date;
}

export interface ChatMaterialRow {
  id: string;
  title: string;
  fileType: string;
  status: MaterialState;
  /** Why extraction failed; safe to show the teacher. */
  error: string | null;
}

export interface NewMaterial {
  teacherId: string;
  title: string;
  /** Object key in storage. */
  filePath: string;
  fileType: string;
}

/** A teacher's chats with the AI. The worker (Python) writes the assistant replies and extracts the materials. */
export interface TeacherChatRepository {
  create(teacherId: string, title: string): Promise<ChatRow>;
  /** Chats of one teacher, or all chats when `teacherId` is null (admins). Newest first. */
  list(teacherId: string | null): Promise<ChatRow[]>;
  findById(id: string): Promise<ChatRow | null>;
  /** Oldest first. Without `after`: the latest `limit` messages. With `after` (a message id): the ones that came after it, for polling. */
  listMessages(chatId: string, options: { limit: number; after?: string }): Promise<ChatMessageRow[]>;
  listMaterials(chatId: string): Promise<ChatMaterialRow[]>;
  /** True while a reply job of this chat is queued or running. */
  hasPendingReply(chatId: string): Promise<boolean>;
  /**
   * In one transaction: saves the teacher's message; when `material` is given also saves it, attaches it to the chat
   * and queues its extract job; then queues the reply job. Wakes the worker after the commit.
   */
  addMessage(input: {
    chatId: string;
    content: string;
    material?: NewMaterial;
  }): Promise<{ message: ChatMessageRow; material: ChatMaterialRow | null }>;
}
