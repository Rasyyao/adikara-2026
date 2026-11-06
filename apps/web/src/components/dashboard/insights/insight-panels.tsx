import { AlertTriangle, ArrowRight, BookOpenCheck, CheckCircle2, CircleDot, ClipboardList, Lock, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TeacherInsights } from "@/lib/api/types";

// Shared language for "how well did the class do": the colour never stands alone, a word and an icon go with it.
export type Tone = "good" | "fair" | "poor" | "none";
export const toneOf = (rate: number | null): Tone => (rate === null ? "none" : rate >= 0.7 ? "good" : rate >= 0.4 ? "fair" : "poor");
export const TONE_BAR: Record<Tone, string> = { good: "bg-success", fair: "bg-warning", poor: "bg-danger", none: "bg-border" };
const TONE_CHIP: Record<Tone, string> = {
  good: "bg-success/10 text-success",
  fair: "bg-warning/10 text-warning",
  poor: "bg-danger/10 text-danger",
  none: "bg-bg text-muted",
};
const TONE_WORD: Record<Tone, string> = { good: "Dikuasai", fair: "Cukup", poor: "Perlu diulang", none: "Belum ada data" };

export const pct = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const DATE_TIME = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
export const shortDate = (iso: string) => DATE.format(new Date(iso));
export const dateTime = (iso: string) => DATE_TIME.format(new Date(iso));

export function RateChip({ rate, label }: { rate: number | null; label?: string }) {
  const tone = toneOf(rate);
  const Icon = tone === "good" ? CheckCircle2 : tone === "poor" ? AlertTriangle : CircleDot;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-semibold ${TONE_CHIP[tone]}`}>
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      {label ?? TONE_WORD[tone]}
    </span>
  );
}

export function RateBar({ rate, className = "h-2" }: { rate: number | null; className?: string }) {
  return (
    <span className={`block overflow-hidden rounded-full bg-bg ${className}`} aria-hidden="true">
      <span className={`block h-full rounded-full ${TONE_BAR[toneOf(rate)]}`} style={{ width: `${Math.max(rate === null ? 0 : 3, Math.round((rate ?? 0) * 100))}%` }} />
    </span>
  );
}

/** A dashboard card with a heading, an optional one-line explanation and an optional action at the right. */
export function InsightCard({ title, hint, icon, action, children, className = "" }: { title: string; hint?: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface ${className}`}>
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-h3 font-semibold text-ink">
            {icon}
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-small text-muted">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="mt-3 flex-1">{children}</div>
    </section>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="mx-4 mb-4 rounded-md border border-dashed border-border p-5 text-center text-small text-muted sm:mx-6 sm:mb-6">{children}</p>;
}

/** The questions most of the class got wrong, with the wrong option that drew them: where to re-teach first. */
export function HardestQuestions({ items }: { items: TeacherInsights["hardest_questions"] }) {
  return (
    <InsightCard
      title="Soal paling banyak salah"
      hint="Dari semua kuis yang sudah dikumpulkan. Pengecoh terbanyak menunjukkan salah paham yang paling umum."
      icon={<AlertTriangle size={20} strokeWidth={1.75} className="text-danger" aria-hidden="true" />}
    >
      {items.length === 0 ? (
        <EmptyNote>Belum ada soal yang salah dijawab. Hasil muncul setelah siswa mengumpulkan kuis.</EmptyNote>
      ) : (
        <ol className="flex flex-col">
          {items.map((q, i) => (
            <li key={`${q.quiz_id}:${q.question_id}`} className="border-t border-border px-4 py-4 first:border-t-0 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-danger/10 text-caption font-semibold text-danger">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-small font-semibold text-ink">{q.question}</p>
                  <p className="mt-0.5 truncate text-caption text-muted">
                    {q.topic} · {q.quiz_title} · {q.class_name}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <RateBar rate={q.correct_rate} className="h-1.5 flex-1" />
                    <span className="shrink-0 text-caption font-semibold text-ink">
                      {q.wrong}/{q.answered} salah
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-1 text-caption sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="inline text-muted">Kunci: </dt>
                      <dd className="inline font-semibold text-success">
                        {q.answer}
                        {q.answer_text ? `. ${q.answer_text}` : ""}
                      </dd>
                    </div>
                    {q.top_wrong && (
                      <div className="min-w-0">
                        <dt className="inline text-muted">Banyak memilih: </dt>
                        <dd className="inline font-semibold text-danger">
                          {q.top_wrong.key}. {q.top_wrong.text} ({q.top_wrong.count})
                        </dd>
                      </div>
                    )}
                  </dl>
                  {q.missed_by.length > 0 && (
                    <p className="mt-1.5 text-caption text-muted" title={q.missed_by.join(", ")}>
                      Salah: {q.missed_by.slice(0, 4).join(", ")}
                      {q.missed_by.length > 4 ? ` +${q.missed_by.length - 4} lainnya` : ""}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </InsightCard>
  );
}

/** Parts of the material, weakest first: what each question came from (its source), so a weak part shows across quizzes. */
export function WeakTopics({ items }: { items: TeacherInsights["topics"] }) {
  return (
    <InsightCard
      title="Penguasaan per materi"
      hint="Persentase jawaban benar per bagian materi (sumber soal). Yang paling lemah di atas."
      icon={<BookOpenCheck size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />}
    >
      {items.length === 0 ? (
        <EmptyNote>Belum ada kuis yang dinilai.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-4 px-4 pb-5 sm:px-6">
          {items.map((t) => (
            <li key={t.topic}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-small font-semibold text-ink" title={t.topic}>
                  {t.topic}
                </p>
                <span className="shrink-0 text-small font-semibold tabular-nums text-ink">{pct(t.correct_rate)}</span>
              </div>
              <RateBar rate={t.correct_rate} className="mt-1.5 h-2" />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
                <RateChip rate={t.correct_rate} />
                <span>
                  {t.questions} soal · {t.wrong}/{t.answered} jawaban salah
                </span>
                {t.struggling_students > 0 && (
                  <span className="inline-flex items-center gap-1 text-danger">
                    <Users size={12} strokeWidth={2} aria-hidden="true" />
                    {t.struggling_students} siswa kesulitan
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </InsightCard>
  );
}

/** Each class: how much of it comes to sessions, and how well it answers. */
export function ClassOverview({ items }: { items: TeacherInsights["classes"] }) {
  return (
    <InsightCard title="Kelas Anda" icon={<Users size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />}>
      {items.length === 0 ? (
        <EmptyNote>Belum ada kelas. Admin menambahkan kelas untuk Anda.</EmptyNote>
      ) : (
        <ul>
          {items.map((c) => (
            <li key={c.id} className="border-t border-border px-4 py-4 first:border-t-0 sm:px-6">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-body font-semibold text-ink">{c.name}</p>
                <p className="text-caption text-muted">{c.last_session_at ? `Terakhir ${shortDate(c.last_session_at)}` : "Belum ada sesi"}</p>
              </div>
              <p className="text-small text-muted">
                {c.student_count} siswa · {c.sessions} sesi
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-caption text-muted">Kehadiran</dt>
                  <dd className="text-small font-semibold text-ink">{pct(c.participation_rate)}</dd>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-tint" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((c.participation_rate ?? 0) * 100)}%` }} />
                  </div>
                </div>
                <div>
                  <dt className="text-caption text-muted">Jawaban benar</dt>
                  <dd className="text-small font-semibold text-ink">{pct(c.correct_rate)}</dd>
                  <RateBar rate={c.correct_rate} className="mt-1 h-1.5" />
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </InsightCard>
  );
}

const KIND_LABEL: Record<string, string> = { pretest: "Pre-Test", posttest: "Post-Test", quiz: "Kuis" };

/** The latest quizzes, with how many handed in and the class average; an open one links back to its live session. */
export function RecentQuizzes({ items }: { items: TeacherInsights["quizzes"] }) {
  return (
    <InsightCard title="Hasil kuis terbaru" icon={<ClipboardList size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />}>
      {items.length === 0 ? (
        <EmptyNote>Belum ada kuis. Tempel kuis ke papan tulis saat sesi berjalan.</EmptyNote>
      ) : (
        <ul>
          {items.slice(0, 6).map((q) => {
            const rate = q.average_percent === null ? null : q.average_percent / 100;
            return (
              <li key={q.id} className="border-t border-border first:border-t-0">
                <Link href={`/teacher/sessions/${q.session_id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-small font-semibold text-ink">
                      <span className="truncate">{q.title}</span>
                      {q.status === "open" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">
                          <span className="size-1.5 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />
                          Dibuka
                        </span>
                      ) : (
                        <Lock size={12} strokeWidth={2} className="shrink-0 text-muted" aria-label="Ditutup" />
                      )}
                    </p>
                    <p className="truncate text-caption text-muted">
                      {KIND_LABEL[q.kind] ?? "Kuis"} · {q.class_name} · {dateTime(q.opened_at)} · {q.submitted}/{q.joined} mengumpulkan
                    </p>
                  </div>
                  <div className="w-24 shrink-0 text-right">
                    <p className="text-small font-semibold tabular-nums text-ink">{q.average_percent === null ? "–" : `${Math.round(q.average_percent)}%`}</p>
                    <RateBar rate={rate} className="mt-1 h-1.5" />
                  </div>
                  <ArrowRight size={16} strokeWidth={1.75} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </InsightCard>
  );
}
