"use client";

import { Activity, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { quizResultsAction } from "@/app/actions/quizzes";
import type { QuizResults } from "@/lib/api/types";
import type { LiveChannel } from "../board/live-sync";

/**
 * A small live counter on the board while a quiz is open: how many finished, are answering, and have not started. It
 * leaves the QR card visible for the class; a click opens the full activity panel.
 */
export function QuizActivityPill({ sessionId, quizId, title, channel, onOpen }: { sessionId: string; quizId: string; title: string; channel: LiveChannel | null; onOpen: () => void }) {
  const [results, setResults] = useState<QuizResults | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => quizResultsAction(sessionId, quizId).then((r) => r.ok && setResults(r.data)), [quizId, sessionId]);

  useEffect(() => {
    let live = true;
    quizResultsAction(sessionId, quizId).then((r) => live && r.ok && setResults(r.data));
    return () => {
      live = false;
    };
  }, [quizId, sessionId]);

  // students answering or joining: refresh at most every 0.8 s; a join changes who has "not started"
  useEffect(() => {
    if (!channel) return;
    const unsubscribe = channel.subscribe((event) => {
      if (timer.current) return;
      if (event.type === "quiz" ? event.quizId !== quizId : event.type !== "presence") return;
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
  }, [channel, load, quizId]);

  const done = results?.leaderboard.filter((r) => r.status === "submitted").length ?? 0;
  const busy = results?.leaderboard.filter((r) => r.status === "in_progress").length ?? 0;
  const idle = results?.waiting?.length ?? 0;
  const total = done + busy + idle;

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={`Aktivitas kuis ${title}: ${done} selesai, ${busy} mengerjakan, ${idle} belum mulai. Buka detail.`}
      className="group flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left shadow-[var(--shadow-overlay)] transition-colors hover:border-primary"
    >
      <span className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
          <Activity size={15} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-semibold text-ink">{title}</span>
          <span className="block text-caption text-muted">{results ? `${done}/${total} selesai` : "Memuat aktivitas…"}</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      <span className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-bg" aria-hidden="true">
        {done > 0 && <span className="h-full bg-success" style={{ width: `${(done / total) * 100}%` }} />}
        {busy > 0 && <span className="h-full bg-primary" style={{ width: `${(busy / total) * 100}%` }} />}
      </span>
      <span className="flex gap-3 text-caption text-muted">
        <span>
          <b className="text-success">{done}</b> selesai
        </span>
        <span>
          <b className="text-primary">{busy}</b> mengerjakan
        </span>
        <span>
          <b className="text-ink">{idle}</b> belum mulai
        </span>
      </span>
    </button>
  );
}
