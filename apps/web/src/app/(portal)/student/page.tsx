import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StudentSessionsTable } from "@/components/dashboard/student-table";
import { InlineLoader } from "@/components/ui/loaders";
import { requireViewer } from "@/lib/auth/dal";
import { STUDENT_PROFILE, STUDENT_SESSIONS, STUDENT_STATS } from "@/lib/dummy/student";

export const metadata = { title: "Beranda siswa" };

async function Greeting() {
  const { user } = await requireViewer("student");
  return <PageHeader title={`Halo, ${user.name ?? "Siswa"}`} description={`Kelas ${STUDENT_PROFILE.className}. Masuk ke sesi lewat tombol di sidebar.`} />;
}

/** Dummy data except the greeting. Joining a session is the sidebar button, so the page keeps four even cards. */
export default function StudentDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<InlineLoader label="Memuat beranda…" />}>
        <Greeting />
      </Suspense>
      <StatGrid stats={STUDENT_STATS} />
      <StudentSessionsTable title="Riwayat terbaru" rows={STUDENT_SESSIONS.slice(0, 5)} />
    </div>
  );
}
