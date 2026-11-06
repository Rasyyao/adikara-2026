"use client";

import { CheckCircle2, Pause, Play, RotateCcw, SkipForward, Square, TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BlockKind, PuzzleBlock, PuzzleNode } from "@/lib/api/types";
import { KINDS, flowView, traceFlow, treeAsOutline, type FlowStep, type FlowView } from "./blocks";

const SPEEDS = [
  { label: "0,5×", ms: 1400 },
  { label: "1×", ms: 850 },
  { label: "2×", ms: 450 },
] as const;

export interface FlowPlayer {
  /** What the workspace highlights; null when nothing is running. */
  view: FlowView | null;
  step: FlowStep | null;
  steps: FlowStep[];
  index: number;
  total: number;
  playing: boolean;
  finished: boolean;
  speed: number;
  setSpeed: (speed: number) => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  jumpTo: (stepIndex: number) => void;
  restart: () => void;
  stop: () => void;
}

/**
 * Runs an arrangement block by block, in the order it would run: play, pause, one step at a time, at three speeds.
 * A finished run stays on screen until it is stopped or played again; any change to the blocks ends it.
 */
export function useFlowPlayer(tree: PuzzleNode[], blocks: PuzzleBlock[]): FlowPlayer {
  const steps = useMemo(() => traceFlow(tree, new Map(blocks.map((b) => [b.id, b]))), [tree, blocks]);
  const [run, setRun] = useState<{ steps: FlowStep[]; index: number; playing: boolean } | null>(null);
  const [speed, setSpeed] = useState(1);
  // a run belongs to the arrangement it started on
  const current = run && run.steps === steps ? run : null;
  const last = steps.length - 1;
  const finished = current !== null && current.index === last && !current.playing;

  useEffect(() => {
    if (!current?.playing) return;
    const timer = setTimeout(
      () => setRun((r) => (r ? (r.index < r.steps.length - 1 ? { ...r, index: r.index + 1 } : { ...r, playing: false }) : r)),
      SPEEDS[speed].ms,
    );
    return () => clearTimeout(timer);
  }, [current, speed]);

  const view = useMemo(() => (current ? flowView(current.steps, current.index, finished) : null), [current, finished]);

  return {
    view,
    step: current ? current.steps[current.index] : null,
    steps,
    index: current?.index ?? 0,
    total: steps.length,
    playing: current?.playing ?? false,
    finished,
    speed,
    setSpeed,
    play: () => setRun(!current || finished ? (steps.length ? { steps, index: 0, playing: true } : null) : { ...current, playing: true }),
    pause: () => current && setRun({ ...current, playing: false }),
    next: () => setRun(!current || finished ? (steps.length ? { steps, index: 0, playing: false } : null) : { ...current, index: Math.min(current.index + 1, last), playing: false }),
    jumpTo: (stepIndex: number) => {
      if (!steps.length) return;
      const clamped = Math.max(0, Math.min(stepIndex, last));
      setRun({ steps, index: clamped, playing: false });
    },
    restart: () => setRun(steps.length ? { steps, index: 0, playing: true } : null),
    stop: () => setRun(null),
  };
}

function Control({ label, onClick, disabled, primary, children }: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={primary ? undefined : label}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md text-small font-semibold transition-transform hover:scale-[1.04] active:scale-95 disabled:pointer-events-none disabled:opacity-35 ${
        primary ? "bg-ink px-3 text-white" : "size-9 border border-border bg-surface text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** The run controls, what is running now, and how far along the run is. */
export function FlowBar({ player, label = "Jalankan" }: { player: FlowPlayer; label?: string }) {
  const { step, index, total, playing, finished, view, speed, setSpeed, play, pause, next, restart, stop } = player;
  const active = view !== null;
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors ${finished ? "border-success/40 bg-success/5" : active ? "border-[#ffd23f] bg-[#fff8e1]" : "border-border bg-bg"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {playing ? (
          <Control label="Jeda" onClick={pause} primary>
            <Pause size={16} strokeWidth={2} aria-hidden="true" />
            Jeda
          </Control>
        ) : (
          <Control label={finished ? "Jalankan lagi" : active ? "Lanjutkan" : label} onClick={play} disabled={total === 0} primary>
            <Play size={16} strokeWidth={2} aria-hidden="true" />
            {finished ? "Jalankan lagi" : active ? "Lanjutkan" : label}
          </Control>
        )}
        <Control label="Langkah berikutnya" onClick={next} disabled={total === 0 || playing}>
          <SkipForward size={16} strokeWidth={2} aria-hidden="true" />
        </Control>
        <Control label="Ulang dari awal" onClick={restart} disabled={!active}>
          <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
        </Control>
        <Control label="Hentikan" onClick={stop} disabled={!active}>
          <Square size={14} strokeWidth={2.25} aria-hidden="true" />
        </Control>
        <div role="group" aria-label="Kecepatan" className="ml-auto inline-flex rounded-md border border-border bg-surface p-0.5">
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={speed === i}
              onClick={() => setSpeed(i)}
              className={`min-h-8 rounded-sm px-2 text-caption font-semibold ${speed === i ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-ink" aria-live="polite">
          {finished ? (
            <span className="pstage-enter inline-flex items-center gap-1.5 font-semibold text-success">
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
              Program selesai dijalankan · {total} langkah
            </span>
          ) : active && step ? (
            <span key={index} className="pstage-enter inline-block">
              <b className="font-semibold">Langkah {index + 1}</b> · {step.note}
            </span>
          ) : (
            <span className="text-muted">Jalankan program untuk melihat urutan blok dijalankan, termasuk setiap putaran ulangi dan pemeriksaan jika.</span>
          )}
        </p>
        {active && (
          <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-white" aria-hidden="true">
            <span className={`block h-full rounded-full transition-[width] duration-300 ${finished ? "bg-success" : "bg-[#e0a800]"}`} style={{ width: `${((index + 1) / total) * 100}%` }} />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The arrangement as a code outline, run line by line: the line running now is highlighted and the lines already
 * run are ticked. Blocks read like code (containers open and close a brace), so the same picture carries over to
 * the JavaScript mode.
 */
export function FlowVisualizer({
  tree,
  blocks,
  player,
  label = "Jalankan",
}: {
  tree: PuzzleNode[];
  blocks: PuzzleBlock[];
  player: FlowPlayer;
  label?: string;
}) {
  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const lines = useMemo(() => treeAsOutline(tree, byId), [tree, byId]);
  const view = player.view;

  return (
    <section aria-label="Simulasi program" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-small font-semibold text-ink">
          <TerminalSquare size={16} strokeWidth={2} className="text-primary" aria-hidden="true" />
          Simulasi program
        </h3>
        <p className="text-caption text-muted">Susunan blokmu dibaca seperti kode. Jalankan untuk melihat baris mana yang dikerjakan, termasuk tiap putaran dan pemeriksaan syarat.</p>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-caption text-muted">Belum ada blok. Susun blok di atas, lalu jalankan di sini.</p>
      ) : (
        <>
          <FlowBar player={player} label={label} />
          <ol className="overflow-x-auto rounded-md border border-border bg-bg py-2 font-mono text-caption">
            {lines.map((line, i) => {
              const closing = line.kind === "close";
              const active = !closing && view?.active === line.block;
              const visited = !closing && !active && (view?.trail.has(line.block) ?? false);
              const meta = closing ? null : KINDS[line.kind as BlockKind];
              const round = !closing && line.kind === "loop" ? view?.rounds[line.block] : undefined;
              return (
                <li
                  key={`${line.block}-${i}`}
                  className={`flex min-h-7 items-center gap-2 pr-3 transition-colors ${active ? "bg-[#fff1b8]" : visited ? "bg-success/5" : ""}`}
                >
                  <span className={`w-8 shrink-0 select-none text-right ${active ? "font-bold text-ink" : "text-muted/70"}`} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 items-center">
                    {Array.from({ length: line.depth }, (_, d) => (
                      <span key={d} className="ml-1 h-7 w-[14px] shrink-0 border-l border-border" aria-hidden="true" />
                    ))}
                    {meta && <span className="mr-2 size-2.5 shrink-0 rounded-[3px]" style={{ background: meta.fill }} aria-hidden="true" />}
                    <span className={`whitespace-pre ${closing ? "text-muted" : active ? "font-semibold text-ink" : "text-ink"}`}>{line.text}</span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-3 font-sans">
                    {round && <span className="rounded-full bg-[#B85C00] px-2 py-0.5 text-[11px] font-semibold text-white">putaran {round}</span>}
                    {active && <span className="text-[11px] font-semibold text-[#8F6800]">◀ sedang jalan</span>}
                    {visited && <CheckCircle2 size={13} strokeWidth={2.25} className="text-success" aria-label="sudah dijalankan" />}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

const COLORS = ["#7445CC", "#B85C00", "#2B7A3D", "#2F6FD6", "#F2B705", "#E0457B"];

/** A short burst of confetti from the middle of its parent (which must be `relative`). Hidden for reduced motion. */
export function Confetti({ pieces = 26 }: { pieces?: number }) {
  return (
    <span className="pconfetti pointer-events-none absolute left-1/2 top-1/2 z-10" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + (i % 3) * 0.3;
        const distance = 70 + ((i * 37) % 90);
        return (
          <span
            key={i}
            className="absolute block h-2.5 w-1.5 rounded-[2px]"
            style={{
              background: COLORS[i % COLORS.length],
              ["--dx" as string]: `${Math.cos(angle) * distance}px`,
              ["--dy" as string]: `${Math.sin(angle) * distance - 30}px`,
              ["--rot" as string]: `${(i * 67) % 360}deg`,
              animationDelay: `${(i % 5) * 25}ms`,
            }}
          />
        );
      })}
    </span>
  );
}
