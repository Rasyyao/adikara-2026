import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  GraduationCap,
  Inbox,
  Lock,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TeacherInsights } from "@/lib/api/types";

// Shared language for "how well did the class do": the colour never stands alone, a word and an icon go with it.
export type Tone = "good" | "fair" | "poor" | "none";
export const toneOf = (rate: number | null): Tone =>
  rate === null ? "none" : rate >= 0.7 ? "good" : rate >= 0.4 ? "fair" : "poor";

export const TONE_BAR: Record<Tone, string> = {
  good: "bg-emerald-500",
  fair: "bg-amber-500",
  poor: "bg-rose-500",
  none: "bg-border",
};

const TONE_CHIP: Record<Tone, string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  fair: "bg-amber-50 text-amber-700 border-amber-200/60",
  poor: "bg-rose-50 text-rose-700 border-rose-200/60",
  none: "bg-bg text-muted border-border",
};

const TONE_WORD: Record<Tone, string> = {
  good: "Dikuasai",
  fair: "Cukup",
  poor: "Perlu diulang",
  none: "Belum ada data",
};

export const pct = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const DATE_TIME = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});
export const shortDate = (iso: string) => DATE.format(new Date(iso));
export const dateTime = (iso: string) => DATE_TIME.format(new Date(iso));

export function RateChip({ rate, label }: { rate: number | null; label?: string }) {
  const tone = toneOf(rate);
  const Icon = tone === "good" ? CheckCircle2 : tone === "poor" ? AlertTriangle : CircleDot;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold ${TONE_CHIP[tone]}`}
    >
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      {label ?? TONE_WORD[tone]}
    </span>
  );
}

export function RateBar({ rate, className = "h-2" }: { rate: number | null; className?: string }) {
  return (
    <span className={`block overflow-hidden rounded-full bg-bg ${className}`} aria-hidden="true">
      <span
        className={`block h-full rounded-full transition-all duration-300 ${TONE_BAR[toneOf(rate)]}`}
        style={{ width: `${Math.max(rate === null ? 0 : 4, Math.round((rate ?? 0) * 100))}%` }}
      />
    </span>
  );
}

/** A dashboard card with a heading, an optional one-line explanation and an optional action at the right. */
export function InsightCard({
  title,
  hint,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-surface shadow-xs transition-shadow duration-150 hover:shadow-sm ${className}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 font-heading text-h3 font-semibold text-ink">
            {icon && (
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary-tint/70 text-primary">
                {icon}
              </span>
            )}
            <span>{title}</span>
          </h2>
          {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center sm:p-10">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-bg text-muted">
        <Inbox size={22} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="mt-3 max-w-sm text-small text-muted">{children}</p>
    </div>
  );
}

/** The questions most of the class got wrong, with the wrong option that drew them: where to re-teach first. Max 5 items & simplified. */
export function HardestQuestions({ items }: { items: TeacherInsights["hardest_questions"] }) {
  const displayItems = items.slice(0, 5);

  return (
    <InsightCard
      title="Soal Paling Banyak Salah"
      hint="5 soal dengan tingkat salah paham tertinggi dari seluruh kuis."
      icon={<AlertTriangle size={18} strokeWidth={2} className="text-rose-600" aria-hidden="true" />}
    >
      {displayItems.length === 0 ? (
        <EmptyNote>Belum ada soal yang salah dijawab. Hasil analisis muncul setelah kuis dinilai.</EmptyNote>
      ) : (
        <ol className="divide-y divide-border/60">
          {displayItems.map((q, i) => {
            const wrongPct = q.answered > 0 ? Math.round((q.wrong / q.answered) * 100) : 0;
            return (
              <li key={`${q.quiz_id}:${q.question_id}`} className="p-3.5 transition-colors hover:bg-bg/40 sm:p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-rose-100 font-heading text-caption font-bold text-rose-700">
                    #{i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="truncate rounded-md bg-bg px-2 py-0.5 text-caption font-medium text-muted">
                        {q.topic} · {q.quiz_title}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-caption font-semibold text-rose-700">
                        {wrongPct}% Salah ({q.wrong}/{q.answered})
                      </span>
                    </div>

                    <p className="mt-1.5 text-small font-semibold leading-snug text-ink">{q.question}</p>

                    {/* Simplified inline comparison */}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                        <CheckCircle2 size={12} strokeWidth={2.2} className="text-emerald-600" aria-hidden="true" />
                        Kunci: {q.answer}
                        {q.answer_text ? ` (${q.answer_text})` : ""}
                      </span>

                      {q.top_wrong && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 font-medium text-rose-800">
                          <AlertCircle size={12} strokeWidth={2.2} className="text-rose-600" aria-hidden="true" />
                          Terkecoh: {q.top_wrong.key} ({q.top_wrong.count} siswa)
                        </span>
                      )}
                    </div>

                    {q.missed_by.length > 0 && (
                      <p className="mt-1.5 truncate text-caption text-muted" title={q.missed_by.join(", ")}>
                        <span className="font-medium text-ink">Perlu dibimbing:</span> {q.missed_by.slice(0, 3).join(", ")}
                        {q.missed_by.length > 3 ? ` (+${q.missed_by.length - 3})` : ""}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </InsightCard>
  );
}

/** Parts of the material, weakest first: what each question came from. Max 5 items & simplified. */
export function WeakTopics({ items }: { items: TeacherInsights["topics"] }) {
  const displayItems = items.slice(0, 5);

  return (
    <InsightCard
      title="Penguasaan Materi"
      hint="Maksimal 5 materi yang paling perlu penguatan."
      icon={<BookOpenCheck size={18} strokeWidth={2} className="text-primary" aria-hidden="true" />}
    >
      {displayItems.length === 0 ? (
        <EmptyNote>Belum ada kuis yang dinilai untuk analisis topik materi.</EmptyNote>
      ) : (
        <div className="divide-y divide-border/60">
          {displayItems.map((t, idx) => (
            <div key={t.topic} className="p-3 transition-colors hover:bg-bg/40 sm:px-5 sm:py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-caption font-bold text-muted">#{idx + 1}</span>
                    <p className="truncate text-small font-semibold text-ink" title={t.topic}>
                      {t.topic}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <RateChip rate={t.correct_rate} />
                  <span className="font-heading text-small font-bold tabular-nums text-ink">{pct(t.correct_rate)}</span>
                </div>
              </div>

              <div className="mt-2">
                <RateBar rate={t.correct_rate} className="h-1.5" />
              </div>

              <div className="mt-1.5 flex items-center justify-between text-caption text-muted">
                <span>
                  {t.questions} soal · {t.answered} jawaban ({t.wrong} salah)
                </span>
                {t.struggling_students > 0 && (
                  <span className="font-medium text-rose-700">{t.struggling_students} siswa perlu bimbingan</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </InsightCard>
  );
}

/** Each class: how much of it comes to sessions, and how well it answers. Max 5 items. */
export function ClassOverview({ items }: { items: TeacherInsights["classes"] }) {
  const displayItems = items.slice(0, 5);

  return (
    <InsightCard
      title="Kelas yang Diajar"
      hint="Tingkat partisipasi kehadiran dan nilai rata-rata."
      icon={<GraduationCap size={18} strokeWidth={2} className="text-primary" aria-hidden="true" />}
      action={
        <Link
          href="/teacher/classes"
          className="inline-flex items-center gap-1 text-caption font-semibold text-primary hover:text-primary-hover"
        >
          <span>Semua kelas</span>
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      {displayItems.length === 0 ? (
        <EmptyNote>Belum ada kelas terdaftar. Hubungi admin sekolah untuk penugasan kelas.</EmptyNote>
      ) : (
        <div className="divide-y divide-border/60">
          {displayItems.map((c) => (
            <div key={c.id} className="p-3.5 transition-colors hover:bg-bg/40 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 font-heading text-caption font-bold text-indigo-700">
                    {c.name.slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-small font-bold text-ink">{c.name}</p>
                    <p className="text-caption text-muted">
                      {c.student_count} siswa · {c.sessions} sesi
                    </p>
                  </div>
                </div>

                <span className="rounded-full bg-bg px-2 py-0.5 text-caption font-medium text-muted">
                  {c.last_session_at ? `Sesi: ${shortDate(c.last_session_at)}` : "Belum ada sesi"}
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-3 rounded-lg bg-bg/50 p-2 text-caption">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Kehadiran</span>
                    <span className="font-semibold text-ink">{pct(c.participation_rate)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.round((c.participation_rate ?? 0) * 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Jawaban Benar</span>
                    <span className="font-semibold text-ink">{pct(c.correct_rate)}</span>
                  </div>
                  <div className="mt-1">
                    <RateBar rate={c.correct_rate} className="h-1.5" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </InsightCard>
  );
}

const KIND_LABEL: Record<string, string> = { pretest: "Pre-Test", posttest: "Post-Test", quiz: "Kuis Latihan" };

/** The latest quizzes, with how many handed in and the class average; max 5 items. */
export function RecentQuizzes({ items }: { items: TeacherInsights["quizzes"] }) {
  const displayItems = items.slice(0, 5);

  return (
    <InsightCard
      title="Hasil Kuis Terbaru"
      hint="Kuis langsung dari sesi interaktif papan tulis."
      icon={<ClipboardList size={18} strokeWidth={2} className="text-primary" aria-hidden="true" />}
    >
      {displayItems.length === 0 ? (
        <EmptyNote>Belum ada kuis. Tambahkan kuis interaktif ke papan tulis saat sesi langsung berjalan.</EmptyNote>
      ) : (
        <div className="divide-y divide-border/60">
          {displayItems.map((q) => {
            const rate = q.average_percent === null ? null : q.average_percent / 100;
            const isOpen = q.status === "open";

            return (
              <div key={q.id}>
                <Link
                  href={`/teacher/sessions/${q.session_id}`}
                  className="group flex items-center gap-3 p-3 transition-colors hover:bg-bg sm:px-5 sm:py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-small font-semibold text-ink transition-colors group-hover:text-primary">
                        {q.title}
                      </p>
                      {isOpen ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-semibold text-emerald-800">
                          <span className="size-1.5 rounded-full bg-emerald-600 motion-safe:animate-pulse" aria-hidden="true" />
                          Dibuka
                        </span>
                      ) : (
                        <Lock size={12} strokeWidth={2} className="shrink-0 text-muted" aria-label="Selesai" />
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-caption text-muted">
                      {KIND_LABEL[q.kind] ?? "Kuis"} · {q.class_name} · {q.submitted}/{q.joined} siswa mengumpulkan
                    </p>
                  </div>

                  <div className="w-20 shrink-0 text-right">
                    <p className="font-heading text-small font-bold tabular-nums text-ink">
                      {q.average_percent === null ? "–" : `${Math.round(q.average_percent)}%`}
                    </p>
                    <RateBar rate={rate} className="mt-1 h-1.5" />
                  </div>

                  <ArrowRight
                    size={15}
                    strokeWidth={2}
                    className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </InsightCard>
  );
}
