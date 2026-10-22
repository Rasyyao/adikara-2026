import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AttendanceReport } from "@/components/session/attendance-report";
import { StatusChip } from "@/components/session/status-chip";
import { TeacherLiveSession } from "@/components/session/teacher-live-session";
import { ApiError } from "@/lib/api/errors";
import { classesApi, teacherSessionsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";

export const metadata = { title: "Sesi kelas" };

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
  const classes = await classesApi.list(token).catch(() => ({ items: [] }));
  const className = classes.items.find((c) => c.id === detail.session.class_id)?.name ?? "Kelas";

  if (detail.session.status === "ENDED") {
    const attendance = await teacherSessionsApi.attendance(token, id);
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-small text-muted">Laporan kehadiran</p>
            <h1 className="text-h1 font-semibold">{className}</h1>
          </div>
          <StatusChip status="ENDED" />
        </header>
        <AttendanceReport attendance={attendance} />
        <div>
          <Link href="/teacher" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
            Mulai sesi baru
          </Link>
        </div>
      </div>
    );
  }

  return <TeacherLiveSession sessionId={id} className={className} initial={detail} />;
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-body text-muted">Memuat sesi…</p>}>
      <SessionContent params={params} />
    </Suspense>
  );
}
