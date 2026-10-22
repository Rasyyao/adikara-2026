import { Suspense } from "react";
import { LiveSessionBanner } from "@/components/dashboard/live-session-banner";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { ClassList } from "@/components/dashboard/class-list";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { SessionsTable } from "@/components/dashboard/teacher-tables";
import { requireViewer } from "@/lib/auth/dal";
import { ATTENDANCE_TREND, TEACHER_CLASSES, TEACHER_SESSIONS, TEACHER_STATS } from "@/lib/dummy/teacher";

export const metadata = { title: "Dashboard guru" };

async function Greeting() {
  const { user } = await requireViewer("staff");
  return <PageHeader title={`Halo, ${user.name ?? "Guru"}`} description="Ringkasan kelas dan sesi Anda hari ini." />;
}

/** Everything here is dummy data. The start-session action lives in the sidebar. */
export default function TeacherDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<PageHeader title="Dashboard" />}>
        <Greeting />
      </Suspense>

      <Suspense fallback={null}>
        <LiveSessionBanner />
      </Suspense>

      <StatGrid stats={TEACHER_STATS} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Panel title="Kehadiran 7 sesi terakhir">
          <AttendanceChart points={ATTENDANCE_TREND} />
        </Panel>
        <Panel title="Kelas Anda">
          <ClassList rows={TEACHER_CLASSES} />
        </Panel>
      </div>

      <Panel title="Sesi terbaru">
        <SessionsTable rows={TEACHER_SESSIONS.slice(0, 5)} />
      </Panel>
    </div>
  );
}
