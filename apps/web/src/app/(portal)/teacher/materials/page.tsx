import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { MaterialsTable } from "@/components/dashboard/teacher-tables";
import { CenteredLoader } from "@/components/ui/loaders";
import { teacherChatsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";
import { TEACHER_MATERIALS, type FileKind, type MaterialRow } from "@/lib/dummy/teacher";

export const metadata = { title: "Materi kelas" };

function toFileKind(raw: string): FileKind {
  const upper = raw.toUpperCase();
  if (upper === "DOCX" || upper === "PPTX") return upper;
  return "PDF";
}

function formatDateId(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function MaterialsList() {
  const { token } = await requireViewer("staff");
  const listRes = await teacherChatsApi.list(token).catch(() => ({ items: [] }));

  const details = await Promise.all(
    listRes.items.slice(0, 20).map((chat) =>
      teacherChatsApi
        .get(token, chat.id)
        .then((res) => res)
        .catch(() => ({ chat, materials: [], reply_pending: false })),
    ),
  );

  const apiRows: MaterialRow[] = details.map(({ chat, materials }) => ({
    id: chat.id,
    title: chat.title,
    className: "X RPL 1",
    subject: "Percakapan AI",
    fileCount: materials.length,
    updatedAt: formatDateId(chat.created_at),
    status: "DRAF",
    sources: materials.map((m) => ({
      id: m.id,
      title: m.title,
      fileType: toFileKind(m.file_type),
      sizeLabel: "Berkas",
      status: m.status,
      error: m.error ?? undefined,
    })),
    messages: [],
  }));

  const rows = [...apiRows, ...TEACHER_MATERIALS];
  return <MaterialsTable title={`${rows.length} materi`} rows={rows} />;
}

export default function TeacherMaterialsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Materi kelas"
        description="Susun bahan ajar, modul, dan latihan soal bersama asisten AI."
        action={
          <Link
            href="/teacher/materials/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-body font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-hover"
          >
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            Buat materi baru
          </Link>
        }
      />

      <Suspense fallback={<CenteredLoader label="Memuat daftar materi…" />}>
        <MaterialsList />
      </Suspense>
    </div>
  );
}
