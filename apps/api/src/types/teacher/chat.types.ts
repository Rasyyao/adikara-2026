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

/** A material of a chat with what is needed to show its file and its extracted text. */
export interface ChatMaterialFileRow extends ChatMaterialRow {
  /** Object key in storage. */
  filePath: string;
  extractedText: string | null;
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
  /**
   * Deletes the chat with its messages. Materials that no other chat or package uses go with it.
   * Returns the storage keys of the deleted materials so the caller can remove the files.
   */
  remove(chatId: string): Promise<string[]>;
  /** Oldest first. Without `after`: the latest `limit` messages. With `after` (a message id): the ones that came after it, for polling. */
  listMessages(chatId: string, options: { limit: number; after?: string }): Promise<ChatMessageRow[]>;
  listMaterials(chatId: string): Promise<ChatMaterialRow[]>;
  /** One material of this chat (null when it is not attached to the chat), with its storage key and extracted text. */
  findMaterial(chatId: string, materialId: string): Promise<ChatMaterialFileRow | null>;
  /**
   * Cancels the reply jobs of this chat that are queued or running. Returns how many there were.
   * A running job is only forgotten: the worker sees its row is gone and drops the reply.
   */
  cancelReply(chatId: string): Promise<number>;
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
