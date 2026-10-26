import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MaterialChatbot } from "@/components/materials/material-chatbot";
import { CenteredLoader } from "@/components/ui/loaders";
import { ApiError } from "@/lib/api/errors";
import { teacherChatsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";
import { TEACHER_MATERIALS, type FileKind, type MaterialRow } from "@/lib/dummy/teacher";
import { isUuid } from "@/lib/validation/auth";

export const metadata = { title: "Ruang materi AI" };

function toFileKind(raw: string): FileKind {
  const upper = raw.toUpperCase();
  if (upper === "DOCX" || upper === "PPTX") return upper;
  return "PDF";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function MaterialDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (isUuid(id)) {
    const { token } = await requireViewer("staff");
    let detail;
    let messagesRes;
    try {
      [detail, messagesRes] = await Promise.all([
        teacherChatsApi.get(token, id),
        teacherChatsApi.messages(token, id, { limit: 100 }),
      ]);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
      throw error;
    }

    const materialRow: MaterialRow = {
      id: detail.chat.id,
      title: detail.chat.title,
      className: "X RPL 1",
      subject: "Pemrograman Dasar",
      fileCount: detail.materials.length,
      updatedAt: detail.chat.created_at,
      status: "DRAF",
      sources: detail.materials.map((m) => ({
        id: m.id,
        title: m.title,
        fileType: toFileKind(m.file_type),
        sizeLabel: "Berkas",
        status: m.status,
        error: m.error ?? undefined,
      })),
      messages: messagesRes.items.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: formatTime(msg.created_at),
        sources: msg.sources ?? undefined,
      })),
    };

    return (
      <MaterialChatbot
        initialMaterial={materialRow}
        initialReplyPending={detail.reply_pending || messagesRes.reply_pending}
      />
    );
  }

  const dummy = TEACHER_MATERIALS.find((item) => item.id === id);
  if (!dummy) notFound();
  return <MaterialChatbot initialMaterial={dummy} />;
}

export default function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<CenteredLoader label="Memuat percakapan materi…" />}>
      <MaterialDetail params={params} />
    </Suspense>
  );
}
