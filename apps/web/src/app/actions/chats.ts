"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api/errors";
import { teacherChatsApi } from "@/lib/api/endpoints";
import type { ChatView, MaterialView, MessageView } from "@/lib/api/types";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";
import type { ActionResult } from "./sessions";

function describeChatError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network_error":
        return "Tidak bisa terhubung ke server API. Periksa koneksi Anda.";
      case "chat_not_found":
        return "Percakapan materi tidak ditemukan.";
      case "message_not_found":
        return "Pesan tidak ditemukan atau tidak dapat diubah.";
      case "file_too_large":
        return "Ukuran berkas melebihi batas maksimal 20 MB.";
      case "storage_unavailable":
        return "Penyimpanan berkas belum dikonfigurasi di server.";
      case "validation_error": {
        const details = error.details;
        if (typeof details.file === "string") return `Berkas tidak valid: ${details.file}`;
        if (typeof details.text === "string") return `Pesan tidak valid: ${details.text}`;
        return "Isian pesan atau berkas belum sesuai.";
      }
    }
    if (error.status === 429) return "Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.";
  }
  return "Terjadi kesalahan di server. Coba lagi sebentar lagi.";
}

export async function sendChatMessageAction(formData: FormData): Promise<
  ActionResult<{
    chat: ChatView;
    message: MessageView;
    material: MaterialView | null;
    replyPending: boolean;
  }>
> {
  const { token } = await requireViewer("staff");

  const rawChatId = formData.get("chat_id");
  const rawTitle = formData.get("title");
  const rawText = formData.get("text");
  const rawFile = formData.get("file");

  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) return { ok: false, message: "Tulis pesan atau perintah untuk asisten AI." };

  const title = typeof rawTitle === "string" && rawTitle.trim().length > 0 ? rawTitle.trim().slice(0, 100) : undefined;
  const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;

  try {
    let chat: ChatView;
    if (typeof rawChatId === "string" && isUuid(rawChatId)) {
      chat = { id: rawChatId, title: title ?? "Percakapan materi", created_at: new Date().toISOString() };
    } else {
      const created = await teacherChatsApi.create(token, title ?? text.slice(0, 80));
      chat = created.chat;
    }

    let result;
    if (file) {
      const upstreamForm = new FormData();
      upstreamForm.set("text", text);
      upstreamForm.set("file", file, file.name);
      result = await teacherChatsApi.send(token, chat.id, upstreamForm);
    } else {
      result = await teacherChatsApi.send(token, chat.id, { text });
    }

    return {
      ok: true,
      chat,
      message: result.message,
      material: result.material,
      replyPending: result.reply_pending,
    };
  } catch (error) {
    return { ok: false, message: describeChatError(error) };
  }
}

export async function pollChatAction(
  chatId: string,
  after?: string,
): Promise<
  ActionResult<{
    messages: MessageView[];
    materials: MaterialView[];
    replyPending: boolean;
  }>
> {
  const { token } = await requireViewer("staff");
  if (!isUuid(chatId)) return { ok: false, message: "ID percakapan tidak valid." };

  try {
    const [detail, messagesRes] = await Promise.all([
      teacherChatsApi.get(token, chatId),
      teacherChatsApi.messages(token, chatId, { limit: 100, after: after && isUuid(after) ? after : undefined }),
    ]);
    return {
      ok: true,
      messages: messagesRes.items,
      materials: detail.materials,
      replyPending: detail.reply_pending || messagesRes.reply_pending,
    };
  } catch (error) {
    return { ok: false, message: describeChatError(error) };
  }
}

export async function stopChatReplyAction(chatId: string): Promise<ActionResult> {
  const { token } = await requireViewer("staff");
  if (!isUuid(chatId)) return { ok: false, message: "ID percakapan tidak valid." };

  try {
    await teacherChatsApi.stop(token, chatId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeChatError(error) };
  }
}

export async function editMessageAction(chatId: string, messageId: string, content: string): Promise<ActionResult<{ saved: MessageView }>> {
  const { token } = await requireViewer("staff");
  if (!isUuid(chatId) || !isUuid(messageId)) return { ok: false, message: "Pesan tidak valid." };

  try {
    const result = await teacherChatsApi.editMessage(token, chatId, messageId, content);
    return { ok: true, saved: result.message };
  } catch (error) {
    return { ok: false, message: describeChatError(error) };
  }
}

export async function deleteChatAction(chatId: string): Promise<ActionResult> {
  const { token } = await requireViewer("staff");
  if (!isUuid(chatId)) return { ok: false, message: "ID percakapan tidak valid." };

  try {
    await teacherChatsApi.remove(token, chatId);
    revalidatePath("/teacher/materials");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeChatError(error) };
  }
}
