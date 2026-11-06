"use client";

import { Activity, BarChart3, CheckCircle2, ChevronDown, Code2, Loader2, Lock, Puzzle, Send, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { listReadyProblemsAction } from "@/app/actions/problems";
import { closeSessionProblemAction, listSessionProblemsAction, problemResultsAction, sendProblemAction } from "@/app/actions/session-problems";
import { ProblemDialog } from "@/components/problems/problem-dialog";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { ProblemResults, ProblemSummary, SessionProblemView } from "@/lib/api/types";
import type { LiveChannel } from "../board/live-sync";

type Row = SessionProblemView & { opened: number; solved: number };

/** Calls `load` at most every 0.8 s while events that `matters` keeps arrive. */
function useThrottledRefresh(channel: LiveChannel | null, matters: (event: Parameters<Parameters<LiveChannel["subscribe"]>[0]>[0]) => boolean, load: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ matters, load });
  useEffect(() => {
    latest.current = { matters, load };
  });
  useEffect(() => {
    if (!channel) return;
    const unsubscribe = channel.subscribe((event) => {
      if (timer.current || !latest.current.matters(event)) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        latest.current.load();
      }, 800);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [channel]);
}

const ModeChips = ({ modes }: { modes: SessionProblemView["modes"] }) => (
  <span className="inline-flex gap-1">
    {modes.blocks && <span className="rounded-sm bg-bg px-1.5 py-0.5 text-caption font-semibold text-muted">🧩 Blok</span>}
    {modes.code && <span className="rounded-sm bg-bg px-1.5 py-0.5 font-mono text-caption font-semibold text-muted">{"</>"} JS</span>}
  </span>
);

/**
 * Problems in a live session, the way an interactive whiteboard pushes an activity: the teacher picks a ready problem,
 * it pops up on every student's screen, and the bar shows live how many solved it. Shown next to the session tabs.
 */
export function SessionProblems({ sessionId, materialId, channel, live }: { sessionId: string; materialId: string | null; channel: LiveChannel | null; live: boolean }) {
  const [items, setItems] = useState<Row[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => listSessionProblemsAction(sessionId).then((r) => r.ok && setItems(r.data.items)), [sessionId]);
  useEffect(() => {
    let alive = true;
    listSessionProblemsAction(sessionId).then((r) => alive && r.ok && setItems(r.data.items));
    return () => {
      alive = false;
    };
  }, [sessionId]);
  useThrottledRefresh(channel, (e) => e.type === "problem", () => void load());

  const open = (items ?? []).filter((p) => p.status === "open").reverse();
  const closed = (items ?? []).filter((p) => p.status === "closed").reverse();

  // A compact bar that sits next to the session tabs, so the whiteboard keeps its height: the problems being worked on
  // as chips, the closed ones behind a small dropdown, and the send button.
  return (
    <section aria-label="Soal pemecahan masalah" className="flex flex-wrap items-center justify-end gap-2">
      {open.length > 0 && (
        <ul aria-label="Soal yang sedang dikerjakan" className="flex min-w-0 flex-wrap items-center gap-2">
          {open.map((p) => (
            <ProblemChip key={p.id} problem={p} onWatch={() => setWatching(p.id)} />
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            aria-expanded={showAll}
            className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-caption font-semibold text-muted hover:bg-surface hover:text-ink"
          >
            <ChevronDown size={14} strokeWidth={2} className={`transition-transform ${showAll ? "rotate-180" : ""}`} aria-hidden="true" />
            {closed.length} soal sudah ditutup
          </button>
          {showAll && (
            <ul className="absolute right-0 top-full z-30 mt-1 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2 rounded-lg border border-border bg-surface p-2 shadow-[var(--shadow-overlay)]">
              {closed.map((p) => (
                <ProblemRow key={p.id} problem={p} onWatch={() => setWatching(p.id)} />
              ))}
            </ul>
          )}
        </div>
      )}
      {!live && <span className="text-caption text-muted">Bisa dikirim setelah sesi dimulai</span>}
      <Button
        onClick={() => setPicking(true)}
        disabled={!live}
        title={live ? "Soal langsung muncul sebagai popup di layar setiap siswa" : "Mulai sesi dulu untuk mengirim soal ke siswa"}
        className="min-h-10 px-3 text-small"
      >
        <Puzzle size={18} strokeWidth={1.75} aria-hidden="true" />
        Kirim soal ke siswa
      </Button>

      {picking && (
        <ProblemPicker
          sessionId={sessionId}
          materialId={materialId}
          onClose={() => setPicking(false)}
          onSent={(sent) => {
            setPicking(false);
            void load();
            setWatching(sent.id);
          }}
        />
      )}
      {watching && <ProblemResultsPanel sessionId={sessionId} problemId={watching} channel={channel} onClosed={() => void load()} onClose={() => setWatching(null)} />}
    </section>
  );
}

function ProblemChip({ problem, onWatch }: { problem: Row; onWatch: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md border border-success/40 bg-success/5 py-1 pl-3 pr-1">
      <span className="size-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />
      <span className="min-w-0 max-w-[14rem] truncate text-small font-semibold text-ink" title={problem.title}>
        {problem.title}
      </span>
      <span className="shrink-0 text-caption text-muted">
        <b className="text-success">{problem.solved}</b>/{problem.opened} selesai
      </span>
      <button
        type="button"
        onClick={onWatch}
        className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
      >
        <Activity size={14} strokeWidth={2} aria-hidden="true" />
        Pantau langsung
      </button>
    </li>
  );
}

function ProblemRow({ problem, onWatch }: { problem: Row; onWatch: () => void }) {
  const live = problem.status === "open";
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 ${live ? "border-success/40 bg-success/5" : "border-border"}`}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-small font-semibold text-ink">
          {live && <span className="size-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />}
          <span className="truncate">{problem.title}</span>
          <ModeChips modes={problem.modes} />
        </p>
        <p className="text-caption text-muted">
          {problem.opened} membuka · <b className="text-success">{problem.solved} selesai</b> · {live ? "Dibuka" : "Ditutup"}
        </p>
      </div>
      <button
        type="button"
        onClick={onWatch}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-caption font-semibold transition-colors ${live ? "bg-primary text-white hover:bg-primary-hover" : "border border-border text-ink hover:border-primary hover:text-primary"}`}
      >
        {live ? <Activity size={14} strokeWidth={2} aria-hidden="true" /> : <BarChart3 size={14} strokeWidth={2} aria-hidden="true" />}
        {live ? "Pantau langsung" : "Lihat hasil"}
      </button>
    </li>
  );
}

/** Choose a ready problem to send; those of the session's material first. */
function ProblemPicker({ sessionId, materialId, onClose, onSent }: { sessionId: string; materialId: string | null; onClose: () => void; onSent: (sent: SessionProblemView) => void }) {
  const id = useId();
  const toast = useToast();
  const [items, setItems] = useState<ProblemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listReadyProblemsAction().then((r) => {
      if (!alive) return;
      if (r.ok) setItems([...r.data].sort((a, b) => Number(b.material?.id === materialId) - Number(a.material?.id === materialId)));
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [materialId]);

  const send = async (problem: ProblemSummary) => {
    setSending(problem.id);
    const result = await sendProblemAction(sessionId, problem.id);
    setSending(null);
    if (!result.ok) return toast.error(result.message);
    toast.success(`“${problem.title}” dikirim ke siswa.`);
    onSent(result.data.problem);
  };

  return (
    <Modal open onClose={() => !sending && onClose()} labelledBy={`${id}-title`} className="max-w-[640px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-h2 font-semibold text-ink">
            Kirim soal ke siswa
          </h2>
          <p className="mt-1 text-small text-muted">Soal langsung muncul sebagai popup di layar setiap siswa di sesi ini. Hanya soal yang sudah ditandai siap yang bisa dikirim.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup" className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink">
          <X size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-4 max-h-[60dvh] overflow-y-auto">
        {error ? (
          <p className="text-small text-danger">{error}</p>
        ) : items === null ? (
          <p className="flex items-center gap-2 text-small text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Memuat soal…
          </p>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-small text-muted">Belum ada soal yang siap. Buat soal, coba sebagai siswa, lalu tandai siap.</p>
            <Link href="/teacher/problems" className="mt-2 inline-flex min-h-10 items-center text-small font-semibold text-primary hover:underline">
              Buka halaman Soal
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-small font-semibold text-ink">
                    <span className="truncate">{p.title}</span>
                    <ModeChips modes={p.modes} />
                  </p>
                  <p className="line-clamp-2 text-caption text-muted">{p.story}</p>
                  {p.material && <p className="mt-0.5 text-caption text-muted">{p.material.id === materialId ? "Materi sesi ini" : p.material.title}</p>}
                </div>
                <Button onClick={() => send(p)} loading={sending === p.id} disabled={sending !== null} aria-label={`Kirim ${p.title}`}>
                  <Send size={16} strokeWidth={1.75} aria-hidden="true" />
                  Kirim
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

const STATUS = {
  solved: { label: "Selesai", tone: "bg-success/10 text-success" },
  working: { label: "Mengerjakan", tone: "bg-primary-tint text-primary" },
  waiting: { label: "Belum membuka", tone: "bg-bg text-muted" },
} as const;

const duration = (ms: number | null) => (ms === null ? "–" : ms < 60_000 ? `${Math.round(ms / 1000)} dtk` : `${Math.floor(ms / 60_000)} mnt ${Math.round((ms % 60_000) / 1000)} dtk`);

/** Live view of one sent problem: who solved it, with blocks or JavaScript, after how many tries, and their code. */
export function ProblemResultsPanel({ sessionId, problemId, channel, onClosed, onClose }: { sessionId: string; problemId: string; channel: LiveChannel | null; onClosed: () => void; onClose: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<ProblemResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [codeOf, setCodeOf] = useState<string | null>(null);

  const load = useCallback(
    () =>
      problemResultsAction(sessionId, problemId).then((r) => {
        if (r.ok) setData(r.data);
        else setError(r.message);
      }),
    [problemId, sessionId],
  );
  useEffect(() => {
    let alive = true;
    problemResultsAction(sessionId, problemId).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [problemId, sessionId]);
  useThrottledRefresh(channel, (e) => (e.type === "problem" ? e.problemId === problemId : e.type === "presence"), () => void load());

  const close = async () => {
    setClosing(true);
    const result = await closeSessionProblemAction(sessionId, problemId);
    setClosing(false);
    if (!result.ok) return toast.error(result.message);
    toast.success("Soal ditutup. Siswa tidak bisa menjawab lagi.");
    onClosed();
    void load();
  };

  const s = data?.summary;
  const open = data?.problem.status === "open";
  const share = s && s.joined ? Math.round((s.solved / s.joined) * 100) : 0;

  return (
    <ProblemDialog
      eyebrow={open ? "Pantau langsung" : "Hasil soal"}
      title={data?.problem.title ?? "Memuat…"}
      onClose={onClose}
      actions={
        open ? (
          <Button variant="secondary" onClick={close} loading={closing}>
            <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
            Tutup soal
          </Button>
        ) : data ? (
          <span className="rounded-sm bg-bg px-2 py-1 text-caption font-semibold text-muted">Ditutup</span>
        ) : null
      }
    >
      {error ? (
        <p className="text-small text-danger">{error}</p>
      ) : !data || !s ? (
        <p className="flex items-center gap-2 text-small text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Memuat hasil…
        </p>
      ) : (
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Selesai" value={`${s.solved}/${s.joined}`} tone="text-success" Icon={CheckCircle2} />
            <Tile label="Dengan blok" value={s.solved_blocks} Icon={Puzzle} />
            <Tile label="Dengan JavaScript" value={s.solved_code} Icon={Code2} />
            <Tile label="Belum membuka" value={Math.max(0, s.joined - s.opened)} Icon={Users} />
          </div>
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
              <span className="block h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${share}%` }} />
            </span>
            <span className="text-caption font-semibold tabular-nums text-muted">{share}% kelas selesai</span>
          </div>

          <section aria-label="Siswa" className="overflow-hidden rounded-lg border border-border bg-surface">
            {data.students.length === 0 ? (
              <p className="p-6 text-center text-small text-muted">Belum ada siswa di sesi ini.</p>
            ) : (
              <table className="w-full text-left text-small">
                <thead className="bg-bg text-caption font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2">Siswa</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="hidden px-4 py-2 sm:table-cell">Cara</th>
                    <th className="px-4 py-2">Percobaan</th>
                    <th className="hidden px-4 py-2 md:table-cell">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((row) => (
                    <StudentRow key={row.student_id} row={row} expanded={codeOf === row.student_id} onToggle={() => setCodeOf((c) => (c === row.student_id ? null : row.student_id))} />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </ProblemDialog>
  );
}

function Tile({ label, value, tone = "text-ink", Icon }: { label: string; value: string | number; tone?: string; Icon: typeof Puzzle }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        {label}
      </p>
      <p className={`mt-1 text-h2 font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function StudentRow({ row, expanded, onToggle }: { row: ProblemResults["students"][number]; expanded: boolean; onToggle: () => void }) {
  const status = STATUS[row.status];
  const tries = [row.block_checks ? `${row.block_checks}× periksa blok` : null, row.code_runs ? `${row.code_runs}× jalankan kode` : null].filter(Boolean).join(" · ");
  return (
    <>
      <tr className="border-t border-border">
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <span className={`size-2 shrink-0 rounded-full ${row.online ? "bg-success" : "bg-border"}`} aria-label={row.online ? "di sesi" : "keluar dari sesi"} />
            {row.name}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-caption font-semibold ${status.tone}`}>{status.label}</span>
        </td>
        <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{row.solved_with === "blocks" ? "🧩 Blok" : row.solved_with === "code" ? "</> JavaScript" : "–"}</td>
        <td className="px-4 py-2.5 text-muted">
          <span className="block">{tries || "–"}</span>
          {row.code_total !== null && (
            <span className="block text-caption">
              tes lolos {row.code_passed}/{row.code_total}
            </span>
          )}
          {row.code && (
            <button type="button" onClick={onToggle} aria-expanded={expanded} className="text-caption font-semibold text-primary hover:underline">
              {expanded ? "Sembunyikan kode" : "Lihat kode"}
            </button>
          )}
        </td>
        <td className="hidden px-4 py-2.5 tabular-nums text-muted md:table-cell">{duration(row.duration_ms)}</td>
      </tr>
      {expanded && row.code && (
        <tr>
          <td colSpan={5} className="px-4 pb-3">
            <pre className="max-h-64 overflow-auto rounded-md bg-[#1e2129] p-3 font-mono text-caption text-[#e6e8ee]">{row.code}</pre>
          </td>
        </tr>
      )}
    </>
  );
}
