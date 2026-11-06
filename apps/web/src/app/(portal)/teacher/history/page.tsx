import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { SessionsTable } from "@/components/dashboard/teacher-tables";
import { CenteredLoader } from "@/components/ui/loaders";
import { insightsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";
import type { SessionRow } from "@/lib/dummy/teacher";

export const metadata = { title: "Riwayat sesi" };

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

async function HistoryContent() {
  const { token } = await requireViewer("staff");
  const insights = await insightsApi.overview(token).catch(() => null);
  const rows: SessionRow[] = (insights?.sessions ?? []).map((s) => ({
    id: s.id,
    className: s.class_name,
    topic: s.material_title ?? "Sesi kelas tanpa materi khusus",
    date: formatSessionDate(s.date),
    present: s.joined,
    total: Math.max(1, s.class_size),
    status: s.status === "ENDED" ? "ENDED" : "ACTIVE",
  }));

  return <SessionsTable title={`${rows.length} sesi`} rows={rows} />;
}

export default function TeacherHistoryPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Riwayat sesi" description="Semua sesi yang pernah dibuka beserta laporan kehadirannya." />
      <Suspense fallback={<CenteredLoader label="Memuat riwayat sesi…" />}>
        <HistoryContent />
      </Suspense>
    </div>
  );
}
