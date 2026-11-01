"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Lock, PartyPopper, Play, Send, Trophy, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { answerQuizAction, playQuizAction, startQuizAction, submitQuizAction } from "@/app/actions/quizzes";
import { Spinner } from "@/components/ui/loaders";
import { useToast } from "@/components/ui/toast";
import type { QuizChoiceChange, StudentQuiz } from "@/lib/api/types";
import { formatDuration } from "./quiz-results";

const KIND_LABEL: Record<string, string> = { pretest: "Pre-Test", posttest: "Post-Test", quiz: "Kuis" };

/** How a question was answered, kept as it happens: the time on it (paused while the tab is hidden), visits and picks. */
interface Track {
  timeMs: number;
  enteredAt: number | null;
  visits: number;
  changes: QuizChoiceChange[];
}

/** The device, for the analysis: phone or laptop, screen, language and time zone. */
function clientInfo(): Record<string, unknown> {
  return {
    user_agent: navigator.userAgent,
    platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
  };
}

function cheer(percent: number): { emoji: string; text: string } {
  if (percent >= 90) return { emoji: "🏆", text: "Luar biasa! Kamu menguasai materi ini." };
  if (percent >= 70) return { emoji: "🎉", text: "Hebat! Sedikit lagi sempurna." };
  if (percent >= 50) return { emoji: "👍", text: "Bagus! Cek pembahasan di bawah untuk soal yang terlewat." };
  return { emoji: "💪", text: "Tidak apa-apa. Pelajari pembahasannya, kamu pasti bisa." };
}

/**
 * A student takes a quiz: a start screen, one question at a time with big answer buttons, then the score, their place
 * in the class and every question with the right answer and its explanation. Each pick is saved at once, with the time
 * it took and every change of mind, so the teacher can see where the class goes wrong.
 */
export function QuizRunner({
  sessionId,
  quizId,
  entry,
  onClose,
  backHref,
}: {
  sessionId: string;
  quizId: string;
  /** How the quiz was opened. */
  entry: "board" | "qr" | "link";
  /** Shown as a close button (in a dialog over the board). */
  onClose?: () => void;
  /** Shown as a back link (on its own page). */
  backHref?: string;
}) {
  const toast = useToast();
  const [data, setData] = useState<StudentQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<"start" | "submit" | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [unsaved, setUnsaved] = useState(0);
  const tracks = useRef(new Map<number, Track>());
  const current = useRef<number | null>(null);

  const trackOf = (id: number) => {
    let t = tracks.current.get(id);
    if (!t) {
      t = { timeMs: 0, enteredAt: null, visits: 0, changes: [] };
      tracks.current.set(id, t);
    }
    return t;
  };
  const elapsed = (t: Track) => t.timeMs + (t.enteredAt === null ? 0 : performance.now() - t.enteredAt);
  const leave = () => {
    const id = current.current;
    if (id === null) return;
    const t = trackOf(id);
    t.timeMs = elapsed(t);
    t.enteredAt = null;
    current.current = null;
  };
  const enter = (id: number) => {
    leave();
    const t = trackOf(id);
    t.visits += 1;
    t.enteredAt = performance.now();
    current.current = id;
  };

  /** Applies what the server says; a running attempt picks up where it was. */
  const show = (next: StudentQuiz) => {
    setData(next);
    setError(null);
    const answers = next.attempt?.answers ?? [];
    setPicks(Object.fromEntries(answers.map((a) => [a.question_id, a.choice])));
    if (next.attempt && !next.attempt.submitted_at) {
      const first = next.questions.findIndex((q) => !answers.some((a) => a.question_id === q.id));
      const at = first >= 0 ? first : 0;
      setIndex(at);
      enter(next.questions[at].id);
    } else leave();
  };

  useEffect(() => {
    let live = true;
    playQuizAction(sessionId, quizId).then((result) => {
      if (!live) return;
      if (result.ok) show(result.data);
      else setError(result.message);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once per quiz; `show` only sets state and refs
  }, [quizId, sessionId]);

  // time on a question stops while the tab is hidden
  useEffect(() => {
    const onVisibility = () => {
      const id = current.current;
      if (id === null) return;
      const t = trackOf(id);
      if (document.visibilityState === "hidden") {
        t.timeMs = elapsed(t);
        t.enteredAt = null;
      } else if (t.enteredAt === null) t.enteredAt = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  async function start() {
    setBusy("start");
    const result = await startQuizAction(sessionId, quizId, entry, clientInfo());
    setBusy(null);
    if (!result.ok) return toast.error(result.message);
    show(result.data);
  }

  async function save(questionId: number, choice: string) {
    const t = trackOf(questionId);
    const result = await answerQuizAction(sessionId, quizId, { question_id: questionId, choice, time_ms: Math.round(elapsed(t)), visits: Math.max(1, t.visits), changes: t.changes });
    if (!result.ok) {
      setUnsaved((n) => n + 1);
      toast.error(result.message);
      if (/ditutup/.test(result.message)) playQuizAction(sessionId, quizId).then((r) => r.ok && show(r.data));
    }
  }

  function pick(questionId: number, choice: string) {
    if (picks[questionId] === choice) return;
    const t = trackOf(questionId);
    t.changes = [...t.changes, { choice, at_ms: Math.round(elapsed(t)) }].slice(-50);
    setPicks((all) => ({ ...all, [questionId]: choice }));
    void save(questionId, choice);
  }

  function goTo(at: number) {
    if (!data) return;
    const next = Math.max(0, Math.min(data.questions.length - 1, at));
    enter(data.questions[next].id);
    setIndex(next);
    setConfirmSubmit(false);
  }

  async function submit() {
    if (!data) return;
    setBusy("submit");
    // the time on the last question counts too
    const id = current.current;
    if (id !== null && picks[id]) await save(id, picks[id]);
    leave();
    const result = await submitQuizAction(sessionId, quizId);
    setBusy(null);
    setConfirmSubmit(false);
    if (!result.ok) return toast.error(result.message);
    show(result.data);
  }

  // A-D (or 1-4) pick an answer, arrows move between questions
  useEffect(() => {
    if (!data?.attempt || data.attempt.submitted_at) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
      const q = data.questions[index];
      const key = event.key.toUpperCase();
      const byNumber = /^[1-6]$/.test(key) ? q.options[Number(key) - 1]?.key : undefined;
      const option = q.options.find((o) => o.key === key)?.key ?? byNumber;
      if (option) pick(q.id, option);
      else if (event.key === "ArrowRight") goTo(index + 1);
      else if (event.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const header = (
    <div className="flex items-center justify-between gap-2">
      {backHref ? (
        <Link href={backHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-small font-semibold text-muted hover:text-ink">
          <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
          Ke papan kelas
        </Link>
      ) : (
        <span />
      )}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Tutup kuis" className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink">
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="flex min-h-64 items-center justify-center text-center text-small text-muted">{error ? <p>{error}</p> : <Spinner size={28} />}</div>
      </div>
    );
  }

  const { quiz, questions, attempt } = data;
  const kind = KIND_LABEL[quiz.kind] ?? "Kuis";

  // ---- start ----------------------------------------------------------------------------------------------------------
  if (!attempt) {
    const closed = quiz.status === "closed";
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-tint text-3xl" aria-hidden="true">
            📝
          </span>
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-primary">{kind}</p>
            <h1 className="mt-1 text-h1 font-semibold text-ink">{quiz.title}</h1>
          </div>
          <ul className="flex flex-wrap justify-center gap-2 text-small text-muted">
            <li className="rounded-full border border-border bg-surface px-3 py-1">{quiz.question_count} soal pilihan ganda</li>
            <li className="rounded-full border border-border bg-surface px-3 py-1">Jawaban tersimpan otomatis</li>
            <li className="rounded-full border border-border bg-surface px-3 py-1">Bisa ganti jawaban sebelum dikumpulkan</li>
          </ul>
          {closed ? (
            <p className="flex items-center gap-2 rounded-lg bg-bg px-4 py-3 text-small font-semibold text-muted">
              <Lock size={16} strokeWidth={2} aria-hidden="true" />
              Kuis ini sudah ditutup guru.
            </p>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void start()}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-8 text-body font-semibold text-white shadow-sm transition-transform hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60"
            >
              {busy === "start" ? <Spinner size={18} /> : <Play size={18} strokeWidth={2.25} aria-hidden="true" />}
              Mulai kerjakan
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- result ---------------------------------------------------------------------------------------------------------
  if (attempt.submitted_at) {
    const score = attempt.score ?? 0;
    const percent = attempt.total ? Math.round((score / attempt.total) * 100) : 0;
    const mood = cheer(percent);
    const mine = new Map(attempt.answers.map((a) => [a.question_id, a]));
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-b from-primary-tint to-surface px-4 py-6 text-center">
          <span className="text-5xl" aria-hidden="true">
            {mood.emoji}
          </span>
          <p className="text-caption font-semibold uppercase tracking-wide text-primary">{quiz.title}</p>
          <p className="text-[3rem] font-bold leading-none text-ink">
            {score}
            <span className="text-h2 text-muted">/{attempt.total}</span>
          </p>
          <p className="text-body font-semibold text-ink">{mood.text}</p>
          <div className="flex flex-wrap justify-center gap-2 text-small">
            {attempt.rank !== null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 font-semibold text-ink">
                <Trophy size={14} strokeWidth={2} className="text-warning" aria-hidden="true" />
                Peringkat {attempt.rank} dari {attempt.ranked}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-muted">
              <Clock size={14} strokeWidth={2} aria-hidden="true" />
              {formatDuration(attempt.duration_ms)}
            </span>
          </div>
        </div>

        <h2 className="flex items-center gap-1.5 text-body font-semibold text-ink">
          <PartyPopper size={18} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
          Pembahasan
        </h2>
        <ol className="flex flex-col gap-3">
          {questions.map((q) => {
            const answer = mine.get(q.id);
            const right = answer?.is_correct === true;
            return (
              <li key={q.id} className={`rounded-xl border p-3 ${right ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
                <p className="flex items-start gap-2 text-small font-semibold text-ink">
                  {right ? (
                    <CheckCircle2 size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-success" aria-label="Benar" />
                  ) : (
                    <XCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" aria-label="Salah" />
                  )}
                  <span>
                    {q.id}. {q.question}
                  </span>
                </p>
                <ul className="mt-2 flex flex-col gap-1 pl-6 text-small">
                  {q.options.map((o) => (
                    <li
                      key={o.key}
                      className={o.key === q.answer ? "font-semibold text-success" : o.key === answer?.choice ? "text-danger line-through" : "text-muted"}
                    >
                      {o.key}. {o.text}
                      {o.key === q.answer && " ✓"}
                      {o.key === answer?.choice && o.key !== q.answer && " (jawabanmu)"}
                    </li>
                  ))}
                </ul>
                {!answer && <p className="mt-1 pl-6 text-caption font-semibold text-danger">Tidak dijawab</p>}
                {q.explanation && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-small leading-relaxed text-ink">💡 {q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // ---- answering ------------------------------------------------------------------------------------------------------
  const q = questions[index];
  const answered = questions.filter((x) => picks[x.id]).length;
  const empty = questions.length - answered;
  const last = index === questions.length - 1;
  return (
    <div className="flex flex-col gap-4">
      {header}
      <div>
        <div className="flex items-center justify-between text-caption font-semibold text-muted">
          <span>
            {kind} · Soal {index + 1} dari {questions.length}
          </span>
          <span>{answered} dijawab</span>
        </div>
        <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-border">
          <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(answered / questions.length) * 100}%` }} />
        </span>
      </div>

      <nav aria-label="Lompat ke soal" className="flex flex-wrap gap-1.5">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => goTo(i)}
            aria-current={i === index ? "step" : undefined}
            aria-label={`Soal ${i + 1}${picks[x.id] ? ", sudah dijawab" : ""}`}
            className={`flex size-9 items-center justify-center rounded-lg text-caption font-semibold transition-colors ${
              i === index ? "bg-primary text-white" : picks[x.id] ? "bg-primary-tint text-primary" : "border border-border bg-surface text-muted hover:text-ink"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <div key={q.id} className="diagram-caption flex flex-col gap-3">
        <h2 className="text-h3 font-semibold leading-snug text-ink">{q.question}</h2>
        <div role="radiogroup" aria-label={`Pilihan jawaban soal ${index + 1}`} className="flex flex-col gap-2">
          {q.options.map((o) => {
            const chosen = picks[q.id] === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={chosen}
                onClick={() => pick(q.id, o.key)}
                className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-body transition-all active:scale-[0.99] ${
                  chosen ? "border-primary bg-primary-tint font-semibold text-ink shadow-sm" : "border-border bg-surface text-ink hover:border-primary/50"
                }`}
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-small font-bold ${chosen ? "bg-primary text-white" : "bg-bg text-muted"}`}>{o.key}</span>
                <span className="min-w-0 flex-1 break-words">{o.text}</span>
                {chosen && <CheckCircle2 size={20} strokeWidth={2} className="shrink-0 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <p className="text-caption text-muted">Tip: tekan huruf A–D di keyboard untuk memilih, panah kiri dan kanan untuk pindah soal.</p>
      </div>

      {unsaved > 0 && <p className="text-caption font-semibold text-warning">Sebagian jawaban gagal tersimpan. Pilih ulang jawabannya bila perlu.</p>}

      {confirmSubmit ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
          <p className="text-small font-semibold text-ink">{empty > 0 ? `Masih ada ${empty} soal kosong. Soal kosong dihitung salah.` : "Yakin kumpulkan? Jawaban tidak bisa diubah lagi."}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmSubmit(false)} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-border bg-surface text-small font-semibold text-ink">
              Periksa lagi
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void submit()}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-small font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {busy === "submit" ? <Spinner size={16} /> : <Send size={16} strokeWidth={2} aria-hidden="true" />}
              Kumpulkan
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-small font-semibold text-ink disabled:opacity-40"
          >
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            Sebelumnya
          </button>
          {last ? (
            <button
              type="button"
              onClick={() => setConfirmSubmit(true)}
              className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-small font-semibold text-white hover:bg-primary-hover"
            >
              <Send size={16} strokeWidth={2} aria-hidden="true" />
              Kumpulkan
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-small font-semibold text-white hover:bg-primary-hover"
            >
              Berikutnya
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
