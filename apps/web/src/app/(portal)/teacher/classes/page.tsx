import { Suspense } from "react";
import { NewClassButton } from "@/components/dashboard/class-management";
import { PageHeader } from "@/components/dashboard/page-header";
import { ClassesTable } from "@/components/dashboard/teacher-tables";
import { CenteredLoader } from "@/components/ui/loaders";
import { classesApi, insightsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";
import type { ClassSummary } from "@/lib/dummy/teacher";

export const metadata = { title: "Kelas" };

function formatShortDate(iso: string | null): string {
  if (!iso) return "Belum ada sesi";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Belum ada sesi";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(d);
}

async function ClassesContent() {
  const { token } = await requireViewer("staff");
  const [classesRes, insightsRes] = await Promise.all([
    classesApi.list(token).catch(() => ({ items: [] })),
    insightsApi.overview(token).catch(() => null),
  ]);

  const insightByClass = new Map((insightsRes?.classes ?? []).map((c) => [c.id, c]));
  const rows: ClassSummary[] = classesRes.items.map((item) => {
    const stat = insightByClass.get(item.id);
    return {
      id: item.id,
      name: item.name,
      subject: `Kode kelas: ${item.class_code}`,
      code: item.class_code,
      students: item.student_count,
      attendanceRate: stat?.participation_rate !== null && stat?.participation_rate !== undefined ? Math.round(stat.participation_rate * 100) : 0,
      lastSession: formatShortDate(stat?.last_session_at ?? null),
    };
  });

  return <ClassesTable title={`${rows.length} kelas`} rows={rows} />;
}

export default function TeacherClassesPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Kelas" description="Kelas yang Anda ampu semester ini." action={<NewClassButton />} />
      <Suspense fallback={<CenteredLoader label="Memuat daftar kelas…" />}>
        <ClassesContent />
      </Suspense>
    </div>
  );
}
