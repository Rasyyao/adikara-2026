import { Activity, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AiFeedback } from "@/components/dashboard/insights/ai-feedback";
import { AttendanceMatrix } from "@/components/dashboard/insights/attendance-matrix";
import { EmptyNote, HardestQuestions, InsightCard, RecentQuizzes, WeakTopics, shortDate } from "@/components/dashboard/insights/insight-panels";
import { ParticipationChart } from "@/components/dashboard/insights/participation-chart";
import { StudentsPanel } from "@/components/dashboard/insights/students-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { InlineLoader } from "@/components/ui/loaders";
import { classesApi, insightsApi } from "@/lib/api/endpoints";
import type { ClassInsights, ClassView } from "@/lib/api/types";
import { requireViewer } from "@/lib/auth/dal";

export const metadata = { title: "Sesi" };

const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

function ClassTabs({ classes, active }: { classes: ClassView[]; active: string }) {
  return (
    <nav aria-label="Pilih kelas" className="flex flex-wrap gap-2">
      {classes.map((c) => {
        const current = c.id === active;
        return (
          <Link
            key={c.id}
            href={`/teacher/sessions?class=${c.id}`}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-small font-semibold transition-colors ${
              current ? "border-primary bg-primary text-white shadow-xs" : "border-border bg-surface text-ink hover:border-primary/50 hover:text-primary"
            }`}
          >
            {c.name}
            <span className={`text-caption font-normal ${current ? "text-white/80" : "text-muted"}`}>{c.student_count} siswa</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ClassReport({ data }: { data: ClassInsights }) {
  const t = data.totals;
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
      <StatGrid
        stats={[
          { label: "Siswa", value: `${data.class.student_count}`, hint: `terdaftar di ${data.class.name}`, icon: "classes" },
          { label: "Sesi", value: `${t.sessions}`, hint: t.live_sessions ? `${t.live_sessions} sedang berjalan` : "sesi yang sudah dimulai", icon: "sessions" },
          { label: "Rata-rata Kehadiran", value: percent(t.participation_rate), hint: "siswa hadir per sesi", icon: "attendance" },
          { label: "Rata-rata Nilai Kuis", value: percent(t.correct_rate), hint: `${t.quizzes} kuis · ${t.submissions} dikumpulkan`, icon: "quiz" },
        ]}
      />

      <AiFeedback key={data.class.id} classId={data.class.id} initial={data.report} hasResults={t.submissions > 0} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <InsightCard
          title="Partisipasi per Sesi"
          hint="Persentase siswa kelas ini yang bergabung di tiap sesi. Arahkan kursor ke batang untuk rincian."
          icon={<Activity size={18} strokeWidth={2} aria-hidden="true" />}
        >
          {points.length === 0 ? <EmptyNote>Belum ada sesi yang dimulai di kelas ini.</EmptyNote> : <ParticipationChart points={points} />}
        </InsightCard>
        <RecentQuizzes items={data.quizzes} />
      </div>

      <AttendanceMatrix attendance={data.attendance} />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <HardestQuestions items={data.hardest_questions} />
        <WeakTopics items={data.topics} />
      </div>

      <StudentsPanel students={data.students} />
    </>
  );
}

function LoadError({ href }: { href: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border/80 bg-surface p-10 text-center shadow-xs">
      <p className="text-body font-medium text-ink">Data kelas belum bisa dimuat saat ini.</p>
      <p className="max-w-sm text-small text-muted">Periksa koneksi server atau coba muat ulang halaman.</p>
      <Link
        href={href}
        className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-bg px-4 text-small font-semibold text-ink transition-colors hover:bg-surface hover:text-primary"
      >
        <RefreshCw size={16} strokeWidth={1.85} aria-hidden="true" />
        Muat ulang
      </Link>
    </div>
  );
}

async function SessionsContent({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const [{ token }, { class: wanted }] = await Promise.all([requireViewer("staff"), searchParams]);
  const classes = await classesApi
    .list(token)
    .then((r) => r.items.filter((c) => !c.archived))
    .catch(() => null);
  if (!classes) return <LoadError href="/teacher/sessions" />;
  if (classes.length === 0) {
    return (
      <div className="rounded-xl border border-border/80 bg-surface shadow-xs">
        <EmptyNote>Belum ada kelas. Buat kelas di menu Kelas, lalu mulai sesi untuk melihat datanya di sini.</EmptyNote>
      </div>
    );
  }
  const active = classes.find((c) => c.id === wanted) ?? classes[0];
  const data = await insightsApi.forClass(token, active.id).catch(() => null);

  return (
    <>
      <ClassTabs classes={classes} active={active.id} />
      {data ? <ClassReport data={data} /> : <LoadError href={`/teacher/sessions?class=${active.id}`} />}
    </>
  );
}

export default function TeacherSessionsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sesi"
        description="Rekap per kelas: kehadiran tiap sesi, hasil kuis, soal yang paling banyak salah, dan analisis AI tentang di mana siswa paling kesulitan."
      />
      <Suspense fallback={<InlineLoader label="Menghitung data kelas…" />}>
        <SessionsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
