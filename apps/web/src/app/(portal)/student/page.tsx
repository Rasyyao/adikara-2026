import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Panel } from "@/components/dashboard/page-header";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { StudentSessionList } from "@/components/dashboard/student-list";
import { JoinForm } from "@/components/session/join-form";
import { requireViewer } from "@/lib/auth/dal";
import { STUDENT_PROFILE, STUDENT_SESSIONS, STUDENT_STATS } from "@/lib/dummy/student";

export const metadata = { title: "Beranda siswa" };

async function Greeting() {
  const { user } = await requireViewer("student");
  return <PageHeader title={`Halo, ${user.name ?? "Siswa"}`} description={`Kelas ${STUDENT_PROFILE.className}`} />;
}

export default function StudentDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<PageHeader title="Beranda" />}>
        <Greeting />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Panel title="Masuk sesi">
          <div className="flex flex-col gap-4 p-4 text-center sm:p-6">
            <p className="text-body text-muted">Masukkan PIN 6 angka dari layar guru.</p>
            <JoinForm />
          </div>
        </Panel>
        <div className="flex flex-col gap-6">
          <StatGrid stats={STUDENT_STATS} />
        </div>
      </div>

      <Panel title="Riwayat terbaru">
        <StudentSessionList rows={STUDENT_SESSIONS.slice(0, 4)} />
        <div className="border-t border-border px-4 py-3 sm:px-6">
          <Link href="/student/history" className="text-small font-semibold text-primary underline">
            Lihat semua riwayat
          </Link>
        </div>
      </Panel>
    </div>
  );
}
