import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink } from "@/components/session/back-link";
import { AttendanceReport } from "@/components/session/attendance-report";
import { StatusChip } from "@/components/session/status-chip";
import { SessionWhiteboard } from "@/components/session/session-whiteboard";
import type { BoardMaterialInfo } from "@/components/session/board/material-panel";
import { TeacherLiveSession } from "@/components/session/teacher-live-session";
import { CenteredLoader } from "@/components/ui/loaders";
import { ApiError } from "@/lib/api/errors";
import { classesApi, teacherChatsApi, teacherSessionsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";

export const metadata = { title: "Sesi kelas" };

// An AI reply that can hold a mindmap or a test; the other replies are not sent to the browser.
const HOLDS_MATERIAL = /```(?:mindmap|assessment|json)|"nodes"|"questions"|[├└]──/;

/** The assigned material for the whiteboard: its files and the replies with mindmaps and tests. A failure only means an empty panel. */
async function loadMaterialInfo(token: string, material: { id: string; title: string } | null): Promise<BoardMaterialInfo | null> {
  if (!material) return null;
  try {
    const [chat, messages] = await Promise.all([teacherChatsApi.get(token, material.id), teacherChatsApi.messages(token, material.id, { limit: 200 })]);
    return {
      id: material.id,
      title: material.title,
      files: chat.materials.map((m) => ({ id: m.id, title: m.title, file_type: m.file_type })),
      messages: messages.items.filter((m) => m.role === "ASSISTANT" && HOLDS_MATERIAL.test(m.content)).map((m) => m.content),
    };
  } catch {
    return { id: material.id, title: material.title, files: [], messages: [] };
  }
}

async function SessionContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { token } = await requireViewer("staff");

  let detail;
  try {
    detail = await teacherSessionsApi.get(token, id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  const [classes, chats] = await Promise.all([
    classesApi.list(token).catch(() => ({ items: [] })),
    teacherChatsApi.list(token).catch(() => ({ items: [] })),
  ]);
  const className = classes.items.find((c) => c.id === detail.session.class_id)?.name ?? "Kelas";

  if (detail.session.status === "ENDED") {
    const [attendance, saved] = await Promise.all([
      teacherSessionsApi.attendance(token, id),
      teacherSessionsApi.board(token, id).catch(() => ({ board: null, updated_at: null })),
    ]);
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <BackLink />
            <h1 className="mt-2 text-h1 font-semibold">{className}</h1>
            <p className="mt-1 text-body text-muted">Laporan kehadiran sesi ini.</p>
          </div>
          <StatusChip status="ENDED" />
        </header>
        <AttendanceReport attendance={attendance} />
        {saved.board && saved.board.elements.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-h3 font-semibold">Papan tulis sesi</h2>
            <SessionWhiteboard sessionId={id} initial={saved.board} readOnly />
          </section>
        )}
      </div>
    );
  }

  const [saved, materialInfo] = await Promise.all([
    teacherSessionsApi.board(token, id).catch(() => ({ board: null, updated_at: null })),
    loadMaterialInfo(token, detail.material),
  ]);
  return <TeacherLiveSession sessionId={id} className={className} initial={detail} materials={chats.items} board={saved.board} materialInfo={materialInfo} />;
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<CenteredLoader label="Memuat sesi…" />}>
      <SessionContent params={params} />
    </Suspense>
  );
}
