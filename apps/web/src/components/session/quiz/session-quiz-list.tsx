"use client";

import { BarChart3, ClipboardList } from "lucide-react";
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
        <p className="mt-1 text-small text-muted">Buka papan dalam layar penuh, tekan Materi, lalu Tempel ke papan sebagai kuis. Siswa scan QR atau klik kartunya.</p>
      </div>
      {items === null ? (
        <p className="text-small text-muted">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-small text-muted">Belum ada kuis di sesi ini.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((quiz) => (
            <li key={quiz.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-semibold text-ink">{quiz.title}</p>
                <p className="text-caption text-muted">
                  {quiz.question_count} soal · {quiz.started} mulai · {quiz.submitted} selesai ·{" "}
                  <span className={quiz.status === "open" ? "font-semibold text-success" : ""}>{quiz.status === "open" ? "Dibuka" : "Ditutup"}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(quiz.id)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-caption font-semibold text-ink hover:border-primary hover:text-primary"
              >
                <BarChart3 size={14} strokeWidth={2} aria-hidden="true" />
                Lihat hasil
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <QuizResultsPanel sessionId={sessionId} quizId={open} channel={channel} onClosedQuiz={() => void load()} onClose={() => setOpen(null)} />}
    </section>
  );
}
