import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StudentJoinHero } from "@/components/dashboard/student-join-hero";
import { StudentSessionsTable } from "@/components/dashboard/student-table";
import { InlineLoader } from "@/components/ui/loaders";
import { requireViewer } from "@/lib/auth/dal";
import { STUDENT_PROFILE, STUDENT_SESSIONS, STUDENT_STATS } from "@/lib/dummy/student";

export const metadata = { title: "Beranda Siswa" };

async function Greeting() {
  const { user } = await requireViewer("student");
  return (
    <PageHeader
      badge={`Siswa Kelas ${STUDENT_PROFILE.className}`}
      title={`Halo, ${user.name ?? "Siswa"}`}
      description="Pantau riwayat kehadiran, modul belajar, dan gabung ke sesi kelas langsung."
    />
  );
}

export default function StudentDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<InlineLoader label="Memuat beranda…" />}>
        <Greeting />
      </Suspense>

      {/* Quick Join Class Hero PIN Card */}
      <StudentJoinHero />

      {/* Student Key Metrics */}
      <StatGrid stats={STUDENT_STATS} />

      {/* Recent Sessions Table */}
      <StudentSessionsTable title="Riwayat Sesi Pembelajaran" rows={STUDENT_SESSIONS} />
    </div>
  );
}
