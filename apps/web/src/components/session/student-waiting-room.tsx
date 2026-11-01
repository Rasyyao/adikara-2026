"use client";

import { Hourglass, LogOut, PartyPopper, Play, UserMinus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { createLiveChannel, liveEventOf } from "./board/live-sync";
import { ConnectionBadge } from "./connection-badge";
import { QuizRunner } from "./quiz/quiz-runner";
import { SessionWhiteboard } from "./session-whiteboard";
import { StatusChip } from "./status-chip";
import { useSessionStream, type StreamHandler } from "./use-session-stream";
import type { SessionStatus } from "@/lib/api/types";

interface View {
  status: SessionStatus;
  locked: boolean;
  count: number;
  outcome: "in" | "kicked" | "ended";
}

/** The waiting room's messages, in a small card in the middle of the page. */
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-160px)] w-full items-center justify-center">
      <div className="w-full max-w-[440px] rounded-lg border border-border bg-surface p-8">{children}</div>
    </div>
  );
}

/**
 * A student's view of a live session: a waiting room until the teacher starts, then the class whiteboard, drawn on
 * together with the teacher (whose cursor shows with their name). The board is mounted from the start, hidden, so it
 * has the stream's first snapshot when the class begins.
 */
export function StudentWaitingRoom({ sessionId }: { sessionId: string }) {
  const [view, setView] = useState<View>({ status: "LOBBY", locked: false, count: 0, outcome: "in" });
  const [liveBoard] = useState(createLiveChannel);
  /** The quiz the student is taking, in a dialog over the board. */
  const [openQuiz, setOpenQuiz] = useState<string | null>(null);
  /** A quiz the teacher just opened, offered in a banner. */
  const [newQuiz, setNewQuiz] = useState<{ id: string; title: string; count: number } | null>(null);

  const onEvent = useCallback<StreamHandler>((type, data) => {
    const boardEvent = liveEventOf(type, data);
    if (boardEvent) liveBoard.emit(boardEvent);
    switch (type) {
      case "quiz_opened": {
        const quiz = data.quiz as { id?: unknown; title?: unknown; question_count?: unknown } | undefined;
        if (typeof quiz?.id === "string") setNewQuiz({ id: quiz.id, title: String(quiz.title ?? "Kuis"), count: Number(quiz.question_count) || 0 });
        break;
      }
      case "quiz_closed": {
        const quiz = data.quiz as { id?: unknown } | undefined;
        setNewQuiz((current) => (current && current.id === quiz?.id ? null : current));
        break;
      }
      case "snapshot": {
        const snapshot = data as { session: { status: SessionStatus; locked: boolean }; participant_count: number };
        setView((v) => ({
          ...v,
          status: snapshot.session.status,
          locked: snapshot.session.locked,
          count: snapshot.participant_count,
          outcome: snapshot.session.status === "ENDED" ? "ended" : "in",
        }));
        break;
      }
      case "participant_joined":
        setView((v) => ({ ...v, count: Number(data.participant_count) || v.count }));
        break;
      case "session_started":
        setView((v) => ({ ...v, status: "ACTIVE" }));
        break;
      case "session_locked":
        setView((v) => ({ ...v, locked: true }));
        break;
      case "session_unlocked":
        setView((v) => ({ ...v, locked: false }));
        break;
      case "session_ended":
        setView((v) => ({ ...v, status: "ENDED", outcome: "ended" }));
        break;
      case "kicked":
        setView((v) => ({ ...v, outcome: "kicked" }));
        break;
    }
  }, [liveBoard]);

  const streamStatus = useSessionStream(sessionId, onEvent);

  if (view.outcome === "kicked" || view.outcome === "ended") {
    const kicked = view.outcome === "kicked";
    const Icon = kicked ? UserMinus : PartyPopper;
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 text-center">
        <Icon size={48} strokeWidth={1.75} className={kicked ? "text-danger" : "text-primary"} aria-hidden="true" />
        <h1 className="text-h1 font-semibold">{kicked ? "Anda dikeluarkan dari sesi" : "Sesi sudah selesai"}</h1>
        <p className="text-body text-muted">
          {kicked ? "Guru mengeluarkan Anda dari sesi ini. Tanyakan pada guru jika ini keliru." : "Terima kasih sudah ikut. Kehadiran Anda sudah tercatat."}
        </p>
        <Link href="/student" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 font-semibold hover:bg-primary-tint">
          Kembali
        </Link>
        </div>
      </Card>
    );
  }

  // The stream closed without an end/kick event: the server refused it or the connection is gone for good.
  if (streamStatus === "closed") {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 text-center">
        <LogOut size={48} strokeWidth={1.75} className="text-warning" aria-hidden="true" />
        <h1 className="text-h1 font-semibold">Koneksi ke sesi terputus</h1>
        <p className="text-body text-muted">Masukkan PIN lagi untuk kembali. Kehadiran Anda tidak hilang.</p>
        <Link href="/student" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
          Masukkan PIN lagi
        </Link>
        </div>
      </Card>
    );
  }

  const started = view.status === "ACTIVE";
  return (
    <>
      {!started && (
        <Card>
          <div className="flex flex-col items-center gap-4 text-center">
            <ConnectionBadge status={streamStatus} />
            <Hourglass size={48} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
            <h1 className="text-h1 font-semibold">Anda sudah masuk</h1>
            <p className="text-body text-muted" aria-live="polite">
              Tunggu sebentar, guru akan segera memulai sesi. Papan kelas muncul di sini begitu sesi dimulai.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatusChip status={view.status} />
              <span className="rounded-sm border border-border bg-surface px-2 py-1 text-small font-semibold">{view.count} siswa di dalam</span>
            </div>
          </div>
        </Card>
      )}
      <section aria-label="Papan kelas" className={started ? "flex w-full flex-col gap-3" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-h3 font-semibold text-ink">Papan kelas</h1>
            <p className="text-caption text-muted" aria-live="polite">
              Ikuti kursor guru yang bertanda nama. Bila guru mengizinkan, Anda bisa ikut menggambar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ConnectionBadge status={streamStatus} />
            <StatusChip status={view.status} />
            <span className="rounded-sm border border-border bg-surface px-2 py-1 text-small font-semibold">{view.count} siswa di dalam</span>
          </div>
        </div>
        {newQuiz && openQuiz !== newQuiz.id && (
          <div role="status" className="diagram-caption flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary-tint p-3">
            <span className="text-2xl" aria-hidden="true">
              📝
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold uppercase tracking-wide text-primary">Kuis baru dari guru</p>
              <p className="truncate text-body font-semibold text-ink">
                {newQuiz.title} · {newQuiz.count} soal
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenQuiz(newQuiz.id)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-small font-semibold text-white hover:bg-primary-hover"
            >
              <Play size={16} strokeWidth={2.25} aria-hidden="true" />
              Kerjakan
            </button>
            <button type="button" onClick={() => setNewQuiz(null)} aria-label="Sembunyikan" className="flex size-9 items-center justify-center rounded-md text-muted hover:text-ink">
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )}
        <SessionWhiteboard sessionId={sessionId} initial={null} live={{ channel: liveBoard, role: "student" }} onOpenQuiz={(card) => setOpenQuiz(card.quizId)} />
      </section>
      {openQuiz && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={(event) => event.target === event.currentTarget && setOpenQuiz(null)}>
          <div role="dialog" aria-modal="true" aria-label="Kuis" className="max-h-[100dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-[var(--shadow-overlay)] sm:max-h-[90dvh] sm:rounded-2xl sm:p-6">
            <QuizRunner key={openQuiz} sessionId={sessionId} quizId={openQuiz} entry="board" onClose={() => setOpenQuiz(null)} />
          </div>
        </div>
      )}
    </>
  );
}
