import { Activity, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ClassOverview, HardestQuestions, InsightCard, EmptyNote, RecentQuizzes, WeakTopics, shortDate } from "@/components/dashboard/insights/insight-panels";
import { ParticipationChart } from "@/components/dashboard/insights/participation-chart";
import { StudentsPanel } from "@/components/dashboard/insights/students-panel";
import { LiveSessionBanner } from "@/components/dashboard/live-session-banner";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { InlineLoader } from "@/components/ui/loaders";
import { insightsApi } from "@/lib/api/endpoints";
import type { TeacherInsights } from "@/lib/api/types";
import { requireViewer } from "@/lib/auth/dal";

export const metadata = { title: "Dashboard guru" };

const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

function Stats({ data }: { data: TeacherInsights }) {
  const t = data.totals;
  return (
    <StatGrid
      stats={[
        { label: "Kelas & siswa", value: `${t.classes}`, hint: `${t.students} siswa terdaftar`, icon: "classes" },
        { label: "Sesi", value: `${t.sessions}`, hint: t.live_sessions ? `${t.live_sessions} sedang berjalan` : `dari ${data.window.sessions} sesi terakhir`, icon: "sessions" },
        { label: "Rata-rata kehadiran", value: percent(t.participation_rate), hint: "siswa yang ikut per sesi", icon: "attendance" },
        { label: "Rata-rata jawaban benar", value: percent(t.correct_rate), hint: `${t.quizzes} kuis · ${t.submissions} dikumpulkan`, icon: "quiz" },
      ]}
    />
  );
}

async function Insights() {
  const { token } = await requireViewer("staff");
  let data: TeacherInsights;
  try {
    data = await insightsApi.overview(token);
  } catch {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-surface p-8 text-center">
        <p className="text-body text-ink">Data dashboard belum bisa dimuat.</p>
        <Link href="/teacher" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 text-small font-semibold text-ink hover:bg-bg">
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          Muat ulang
        </Link>
      </div>
    );
  }

  // oldest to newest, the way a trend reads; sessions that never started say nothing about attendance
  const points = [...data.sessions]
    .filter((s) => s.participation_rate !== null && s.status !== "LOBBY")
    .reverse()
    .slice(-12)
    .map((s) => ({
      id: s.id,
      label: shortDate(s.date),
      className: s.class_name,
      material: s.material_title,
      joined: s.joined,
      classSize: s.class_size,
      value: Math.round((s.participation_rate ?? 0) * 100),
      correct: s.correct_rate === null ? null : Math.round(s.correct_rate * 100),
    }));

  return (
    <>
      <Stats data={data} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <InsightCard
          title="Partisipasi siswa per sesi"
          hint="Berapa persen siswa kelas yang masuk ke tiap sesi. Arahkan kursor ke batang untuk detail."
          icon={<Activity size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />}
        >
          {points.length === 0 ? <EmptyNote>Belum ada sesi yang dimulai. Buat sesi baru dari menu samping.</EmptyNote> : <ParticipationChart points={points} />}
        </InsightCard>
        <ClassOverview items={data.classes} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <HardestQuestions items={data.hardest_questions} />
        <div className="flex flex-col gap-6">
          <WeakTopics items={data.topics} />
          <RecentQuizzes items={data.quizzes} />
        </div>
      </div>

      <StudentsPanel students={data.students} />
    </>
  );
}

async function Greeting() {
  const { user } = await requireViewer("staff");
  return <PageHeader title={`Halo, ${user.name ?? "Guru"}`} description="Partisipasi kelas, hasil kuis, dan materi yang perlu diulang." action={<span />} />;
}

export default function TeacherDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<InlineLoader label="Memuat dashboard…" />}>
        <Greeting />
      </Suspense>

      <Suspense fallback={null}>
        <LiveSessionBanner />
      </Suspense>

      <Suspense fallback={<InlineLoader label="Menghitung hasil kelas…" />}>
        <Insights />
      </Suspense>
    </div>
  );
}
