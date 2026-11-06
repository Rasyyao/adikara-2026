"use client";

import { Activity, BarChart3, ClipboardList } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { listQuizzesAction } from "@/app/actions/quizzes";
import type { QuizView } from "@/lib/api/types";
import type { LiveChannel } from "../board/live-sync";
import { QuizResultsPanel } from "./quiz-results";

type Row = QuizView & { started: number; submitted: number };

/** The quizzes of the session on the teacher's control tab, with how far the class is, and their results one click away. */
export function SessionQuizList({ sessionId, channel }: { sessionId: string; channel: LiveChannel | null }) {
  const [items, setItems] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => listQuizzesAction(sessionId).then((result) => result.ok && setItems(result.data.items)), [sessionId]);

  useEffect(() => {
    let live = true;
    listQuizzesAction(sessionId).then((result) => live && result.ok && setItems(result.data.items));
    return () => {
      live = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!channel) return;
    const unsubscribe = channel.subscribe((event) => {
      if (event.type !== "quiz" || timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        void load();
      }, 800);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [channel, load]);

  return (
    <section aria-label="Kuis sesi ini" className="flex flex-col gap-3 rounded-lg bg-surface p-6">
      <div>
        <h2 className="flex items-center gap-2 text-h3 font-semibold">
          <ClipboardList size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
          Kuis sesi ini
        </h2>
        <p className="mt-1 text-small text-muted">Buka Papan tulis, tekan Materi, lalu Tempel ke papan sebagai kuis. Siswa scan QR atau klik kartunya, dan Anda bisa memantau siapa yang sudah selesai di sini.</p>
      </div>
      {items === null ? (
        <p className="text-small text-muted">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-small text-muted">Belum ada kuis di sesi ini.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...items].reverse().map((quiz) => {
            const live = quiz.status === "open";
            const share = quiz.started ? Math.round((quiz.submitted / quiz.started) * 100) : 0;
            return (
              <li key={quiz.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${live ? "border-success/40 bg-success/5" : "border-border"}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-small font-semibold text-ink">
                      {live && <span className="size-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />}
                      <span className="truncate">{quiz.title}</span>
                    </p>
                    <p className="text-caption text-muted">
                      {quiz.question_count} soal · {quiz.started} mulai · {quiz.submitted} selesai ·{" "}
                      <span className={live ? "font-semibold text-success" : ""}>{live ? "Dibuka" : "Ditutup"}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(quiz.id)}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-caption font-semibold transition-colors ${
                      live ? "bg-primary text-white hover:bg-primary-hover" : "border border-border text-ink hover:border-primary hover:text-primary"
                    }`}
                  >
                    {live ? <Activity size={14} strokeWidth={2} aria-hidden="true" /> : <BarChart3 size={14} strokeWidth={2} aria-hidden="true" />}
                    Lihat hasil
                  </button>
                </div>
                {live && quiz.started > 0 && (
                  <div className="flex items-center gap-2" aria-label={`${quiz.submitted} dari ${quiz.started} siswa yang mulai sudah selesai`}>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                      <span className="block h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${share}%` }} />
                    </span>
                    <span className="shrink-0 text-caption tabular-nums text-muted">
                      {quiz.submitted}/{quiz.started} selesai
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && <QuizResultsPanel sessionId={sessionId} quizId={open} channel={channel} onClosedQuiz={() => void load()} onClose={() => setOpen(null)} />}
    </section>
  );
}
