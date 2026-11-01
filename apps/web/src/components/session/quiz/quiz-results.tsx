"use client";

import { AlertTriangle, BarChart3, Clock, Download, Lock, RefreshCw, Repeat, Trophy, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { closeQuizAction, quizExportAction, quizResultsAction } from "@/app/actions/quizzes";
import { Spinner } from "@/components/ui/loaders";
import { useToast } from "@/components/ui/toast";
import type { QuizResults } from "@/lib/api/types";
import type { LiveChannel } from "../board/live-sync";

const KIND_LABEL: Record<string, string> = { pretest: "Pre-Test", posttest: "Post-Test", quiz: "Kuis" };
const MEDALS = ["🥇", "🥈", "🥉"];

/** "1 mnt 20 dtk", "45 dtk". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "–";
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} mnt ${s % 60} dtk` : `${s} dtk`;
}

/** Green when most got it, amber when half, red when few: how a question went at a glance. */
const toneOf = (rate: number | null) => (rate === null ? "bg-border" : rate >= 0.7 ? "bg-success" : rate >= 0.4 ? "bg-warning" : "bg-danger");

function Tile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
        {icon}
        {label}
      </p>
      <p className="text-h3 font-semibold text-ink">{value}</p>
      {hint && <p className="text-caption text-muted">{hint}</p>}
    </div>
  );
}

/**
 * How the class is doing on a quiz, live: who is answering, the ranking (score, then time), and per question how many
 * got it right, which wrong option drew them (the likely misconception) and who changed their mind. The teacher closes
 * the quiz and downloads every answer for analysis here.
 */
export function QuizResultsPanel({
  sessionId,
  quizId,
  channel,
  onClosedQuiz,
  onClose,
}: {
  sessionId: string;
  quizId: string;
  /** The session's live events; the panel refreshes as students answer. */
  channel: LiveChannel | null;
  /** The quiz was closed here, so its cards on the board can say so. */
  onClosedQuiz: (quizId: string) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [results, setResults] = useState<QuizResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"rank" | "questions">("rank");
  const [busy, setBusy] = useState<"close" | "export" | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    () =>
      quizResultsAction(sessionId, quizId).then((result) => {
        if (result.ok) {
          setResults(result.data);
          setError(null);
        } else setError(result.message);
      }),
    [quizId, sessionId],
  );

  useEffect(() => {
    let live = true;
    quizResultsAction(sessionId, quizId).then((result) => {
      if (!live) return;
      if (result.ok) setResults(result.data);
      else setError(result.message);
    });
    return () => {
      live = false;
    };
  }, [quizId, sessionId]);

  // a student answered: refresh, at most twice a second however many answer at once
  useEffect(() => {
    if (!channel) return;
    const unsubscribe = channel.subscribe((event) => {
      if (event.type !== "quiz" || event.quizId !== quizId || refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        void load();
      }, 500);
    });
    return () => {
      unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, [channel, load, quizId]);

  async function closeQuiz() {
    setBusy("close");
    const result = await closeQuizAction(sessionId, quizId);
    setBusy(null);
    if (!result.ok) return toast.error(result.message);
    onClosedQuiz(quizId);
    toast.success("Kuis ditutup. Jawaban siswa yang belum selesai ikut dikumpulkan.");
    void load();
  }

  async function download() {
    setBusy("export");
    const result = await quizExportAction(sessionId, quizId);
    setBusy(null);
    if (!result.ok) return toast.error(result.message);
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `kuis-${(results?.quiz.title ?? "hasil").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const open = results?.quiz.status === "open";
  const s = results?.summary;
  const hardest = results ? [...results.questions].filter((q) => q.correct_rate !== null).sort((a, b) => (a.correct_rate ?? 1) - (b.correct_rate ?? 1))[0] : undefined;

  return (
    <aside
      role="dialog"
      aria-label="Hasil kuis"
      className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[560px] flex-col border-l border-border bg-bg shadow-[var(--shadow-overlay)]"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-start gap-3 border-b border-border bg-surface p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
          <BarChart3 size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted">
            {KIND_LABEL[results?.quiz.kind ?? "quiz"] ?? "Kuis"} · {results ? `${results.quiz.question_count} soal` : "…"}
          </p>
          <h2 className="break-words text-h3 font-semibold text-ink">{results?.quiz.title ?? "Hasil kuis"}</h2>
          {results && (
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ${open ? "bg-success/15 text-success" : "bg-border text-muted"}`}>
              {open ? <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden="true" /> : <Lock size={12} strokeWidth={2} aria-hidden="true" />}
              {open ? "Dibuka, hasil masuk langsung" : "Ditutup"}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup panel hasil" className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink">
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      {!results ? (
        <div className="flex flex-1 items-center justify-center p-6 text-small text-muted">
          {error ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p>{error}</p>
              <button type="button" onClick={() => void load()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 font-semibold text-ink hover:bg-surface">
                <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
                Coba lagi
              </button>
            </div>
          ) : (
            <Spinner size={28} />
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            {open && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void closeQuiz()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-caption font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Lock size={14} strokeWidth={2} aria-hidden="true" />
                {busy === "close" ? "Menutup…" : "Tutup kuis"}
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void download()}
              title="Semua jawaban per siswa per soal, lengkap dengan jawaban pertama, perubahan jawaban, dan waktu. Untuk analisis AI."
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-caption font-semibold text-ink hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <Download size={14} strokeWidth={2} aria-hidden="true" />
              {busy === "export" ? "Menyiapkan…" : "Unduh data (JSON)"}
            </button>
            <button type="button" onClick={() => void load()} aria-label="Muat ulang hasil" className="ml-auto flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink">
              <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile icon={<Users size={13} strokeWidth={2} aria-hidden="true" />} label="Selesai" value={`${s!.submitted}/${s!.joined}`} hint={`${s!.started - s!.submitted} masih mengerjakan`} />
            <Tile icon={<BarChart3 size={13} strokeWidth={2} aria-hidden="true" />} label="Rata-rata" value={s!.average_percent === null ? "–" : `${Math.round(s!.average_percent)}%`} hint={s!.average_score === null ? undefined : `${s!.average_score} benar`} />
            <Tile icon={<Trophy size={13} strokeWidth={2} aria-hidden="true" />} label="Tertinggi" value={s!.highest === null ? "–" : `${s!.highest}/${results.quiz.question_count}`} hint={s!.lowest === null ? undefined : `terendah ${s!.lowest}`} />
            <Tile icon={<Clock size={13} strokeWidth={2} aria-hidden="true" />} label="Waktu rata-rata" value={formatDuration(s!.average_duration_ms)} />
          </div>

          {hardest && (hardest.correct_rate ?? 1) < 0.6 && (
            <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/5 p-3 text-small text-ink">
              <AlertTriangle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
              <p>
                <b>Soal {hardest.id} paling sulit</b>: hanya {Math.round((hardest.correct_rate ?? 0) * 100)}% benar.
                {hardest.top_wrong && (
                  <>
                    {" "}
                    Banyak yang memilih <b>{hardest.top_wrong.key}. {hardest.top_wrong.text}</b> ({hardest.top_wrong.count} siswa), kemungkinan ada salah paham di sini.
                  </>
                )}
              </p>
            </div>
          )}

          <div role="tablist" aria-label="Tampilan hasil" className="flex gap-1 rounded-lg bg-surface p-1">
            {(
              [
                { id: "rank", label: "Peringkat", Icon: Trophy },
                { id: "questions", label: "Per soal", Icon: BarChart3 },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-caption font-semibold ${tab === id ? "bg-primary text-white" : "text-muted hover:text-ink"}`}
              >
                <Icon size={14} strokeWidth={2} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {tab === "rank" ? (
            results.leaderboard.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-surface p-4 text-center text-small text-muted">
                Belum ada siswa yang mulai. Minta siswa scan QR di papan atau klik kartu kuisnya.
              </p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {results.leaderboard.map((row) => (
                  <li
                    key={row.student_id}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 ${row.rank !== null && row.rank <= 3 ? "border-warning/40 bg-warning/5" : "border-border bg-surface"}`}
                  >
                    <span className="flex w-8 shrink-0 justify-center text-h3 font-semibold text-muted">{row.rank === null ? "…" : (MEDALS[row.rank - 1] ?? row.rank)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small font-semibold text-ink">{row.name}</p>
                      {row.status === "submitted" ? (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                            <span className={`block h-full rounded-full ${toneOf(row.percent / 100)}`} style={{ width: `${row.percent}%` }} />
                          </span>
                          <span className="text-caption text-muted">{formatDuration(row.duration_ms)}</span>
                        </div>
                      ) : (
                        <p className="text-caption text-muted">
                          Sedang mengerjakan · {row.answered}/{row.total} dijawab
                        </p>
                      )}
                    </div>
                    {row.status === "submitted" && (
                      <span className="shrink-0 text-right">
                        <span className="block text-body font-semibold text-ink">
                          {row.score}/{row.total}
                        </span>
                        <span className="text-caption text-muted">{row.percent}%</span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )
          ) : (
            <ol className="flex flex-col gap-3">
              {results.questions.map((q) => (
                <li key={q.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-tint text-caption font-semibold text-primary">{q.id}</span>
                    <p className="min-w-0 flex-1 text-small font-semibold text-ink">{q.question}</p>
                    <span className="shrink-0 text-small font-semibold text-ink">{q.correct_rate === null ? "–" : `${Math.round(q.correct_rate * 100)}%`}</span>
                  </div>
                  <span className="mt-2 block h-2 overflow-hidden rounded-full bg-border">
                    <span className={`block h-full rounded-full ${toneOf(q.correct_rate)}`} style={{ width: `${Math.round((q.correct_rate ?? 0) * 100)}%` }} />
                  </span>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {q.options.map((o) => {
                      const share = q.answered ? Math.round((o.count / q.answered) * 100) : 0;
                      return (
                        <li key={o.key} className="text-caption">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`min-w-0 truncate ${o.is_answer ? "font-semibold text-success" : q.top_wrong?.key === o.key ? "font-semibold text-danger" : "text-ink"}`}>
                              {o.key}. {o.text}
                              {o.is_answer && " ✓"}
                            </span>
                            <span className="shrink-0 text-muted">
                              {o.count} siswa · {share}%
                            </span>
                          </div>
                          <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-bg">
                            <span className={`block h-full rounded-full ${o.is_answer ? "bg-success" : "bg-danger/60"}`} style={{ width: `${share}%` }} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted">
                    <span>
                      {q.correct}/{q.answered} benar
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} strokeWidth={2} aria-hidden="true" />
                      rata-rata {formatDuration(q.average_time_ms)}
                    </span>
                    {q.changed > 0 && (
                      <span className="inline-flex items-center gap-1" title="Siswa yang mengganti jawabannya">
                        <Repeat size={12} strokeWidth={2} aria-hidden="true" />
                        {q.changed} ganti jawaban ({q.wrong_to_right} jadi benar, {q.right_to_wrong} jadi salah)
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </aside>
  );
}
