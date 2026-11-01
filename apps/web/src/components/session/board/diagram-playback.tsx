"use client";

import { ArrowRight, CircleHelp, Code2, Gauge, Pause, Play, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { BoxShape, ElementView } from "./element-view";
import { boundsOfAll } from "./geometry";
import { stepDuration, type DiagramStep, type PartInfo } from "./diagram";
import { linesForStep, type PseudoLine } from "./pseudocode";
import type { BoardElement } from "./types";

const HIGHLIGHT = "#7048e8";
const VEIL_PAD = 28;
const SPEEDS = [0.75, 1, 1.5];

/** A diagram being played: which one, the step it is on (-1 before the first), whether it moves on by itself, and how fast. */
export interface Playback {
  target: string;
  step: number;
  playing: boolean;
  speed?: number;
}

/** Moves a playing playback on to its next step after the current one has been shown long enough. */
export function usePlaybackClock(playback: Playback | null, steps: DiagramStep[], onChange: (next: Playback | null) => void) {
  const playing = playback?.playing ?? false;
  const step = playback?.step ?? -1;
  const count = steps.length;
  // the steps are read again on every render of the board; only their number and this step's time restart the clock
  const wait = step < 0 ? 200 : stepDuration(steps[step]) / (playback?.speed ?? 1);
  useEffect(() => {
    if (!playback || !playing) return;
    const timer = window.setTimeout(() => {
      onChange(step + 1 >= count ? { ...playback, playing: false } : { ...playback, step: step + 1 });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [playback, playing, step, count, wait, onChange]);
}

const isPart = (e: BoardElement, target: string) => e.diagram?.id === target;
/** The parts that stay readable the whole time: the title, the analogy, the legend, a timeline's axis, a simulation's program and column heads. */
const alwaysShown = (e: BoardElement) => ["title", "analogy", "legend", "axis", "program", "varhead"].includes(e.diagram?.node ?? "");
const YES = /^(ya|yes|benar|true)$/i;
const NO = /^(tidak|no|salah|false)$/i;

/**
 * The diagram lit up step by step: a veil over the parts not reached yet, the parts already passed drawn again above it,
 * the arrow just taken as a moving dashed line with a dot running to its end, and the current shape with a pulsing glow.
 */
export function DiagramPlayback({ elements, target, steps, step }: { elements: BoardElement[]; target: string; steps: DiagramStep[]; step: number }) {
  const parts = elements.filter((e) => isPart(e, target));
  const bounds = boundsOfAll(parts);
  const current = steps[step];
  if (!bounds || !current) return null;
  const reached = new Set(steps.slice(0, step + 1).flatMap((s) => s.ids));
  const edge = current.edge ? parts.find((e) => e.id === current.edge) : undefined;
  const edgePoints = edge && (edge.type === "arrow" || edge.type === "line") ? edge.points.map(([x, y]) => `${x + edge.x},${y + edge.y}`) : null;
  return (
    <g pointerEvents="none">
      <rect x={bounds.x - VEIL_PAD} y={bounds.y - VEIL_PAD} width={bounds.w + VEIL_PAD * 2} height={bounds.h + VEIL_PAD * 2} rx={18} fill="#ffffff" opacity={0.55} />
      {parts
        .filter((e) => (reached.has(e.id) || alwaysShown(e)) && !current.ids.includes(e.id))
        .map((e) => (
          <ElementView key={e.id} el={e} still />
        ))}
      {/* the parts of this step pop in each time it is reached, so the class sees what just happened */}
      {parts
        .filter((e) => current.ids.includes(e.id))
        .map((e) => (
          <g key={`${e.id}-${step}`} className="diagram-enter">
            <ElementView el={e} still />
          </g>
        ))}
      {edgePoints && (
        <g fill="none" stroke={HIGHLIGHT} strokeLinecap="round" strokeLinejoin="round">
          <polyline points={edgePoints.join(" ")} strokeWidth={10} opacity={0.18} />
          <polyline key={`${current.edge}-${step}`} points={edgePoints.join(" ")} strokeWidth={4} strokeDasharray="12 10" className="visual-edge-flow" />
          <circle r={7} fill={HIGHLIGHT} stroke="#ffffff" strokeWidth={2}>
            <animateMotion key={step} dur="0.9s" repeatCount="indefinite" path={`M ${edgePoints.join(" L ")}`} />
          </circle>
        </g>
      )}
      {current.focus.map((id) => {
        const el = parts.find((e) => e.id === id);
        return el ? <FocusRing key={`${id}-${step}`} el={el} pulse /> : null;
      })}
    </g>
  );
}

/** A glow around one shape: the part a popup explains, or the one a pseudocode line points at. */
export function FocusRing({ el, pulse = false, dashed = false }: { el: BoardElement | undefined; pulse?: boolean; dashed?: boolean }) {
  if (!el || (el.type !== "rectangle" && el.type !== "ellipse" && el.type !== "diamond")) return null;
  return (
    <g fill="none" stroke={HIGHLIGHT} strokeLinejoin="round" pointerEvents="none">
      <BoxShape el={el} strokeWidth={16} opacity={0.16} />
      <BoxShape el={el} strokeWidth={4} className={pulse ? "diagram-pulse" : undefined} strokeDasharray={dashed ? "8 6" : undefined} />
    </g>
  );
}

const iconButton =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40";

/** Play / pause, step back and forth, speed, and how far along the playback is. */
export function PlaybackBar({ target, steps, playback, onChange }: { target: string; steps: DiagramStep[]; playback: Playback | null; onChange: (next: Playback | null) => void }) {
  const mine = playback?.target === target ? playback : null;
  const step = mine?.step ?? -1;
  const playing = mine?.playing ?? false;
  const speed = mine?.speed ?? 1;
  const finished = step + 1 >= steps.length && !playing && step >= 0;

  const toggle = () => {
    if (playing) return onChange({ target, step, playing: false, speed });
    onChange({ target, step: step < 0 || finished ? 0 : step, playing: true, speed });
  };
  const go = (to: number) => onChange({ target, step: Math.max(0, Math.min(steps.length - 1, to)), playing: false, speed });
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          {playing ? <Pause size={14} strokeWidth={2} aria-hidden="true" /> : finished ? <RotateCcw size={14} strokeWidth={2} aria-hidden="true" /> : <Play size={14} strokeWidth={2} aria-hidden="true" />}
          {playing ? "Jeda" : finished ? "Putar ulang" : step >= 0 ? "Lanjutkan" : "Putar animasi"}
        </button>
        <button type="button" onClick={() => go(step - 1)} disabled={step <= 0} aria-label="Langkah sebelumnya" title="Langkah sebelumnya" className={iconButton}>
          <SkipBack size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => go(step + 1)} disabled={step + 1 >= steps.length} aria-label="Langkah berikutnya" title="Langkah berikutnya" className={iconButton}>
          <SkipForward size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onChange({ target, step, playing, speed: nextSpeed })}
          title="Ubah kecepatan animasi"
          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-caption font-semibold tabular-nums text-muted transition-colors hover:bg-bg hover:text-ink"
        >
          <Gauge size={14} strokeWidth={1.75} aria-hidden="true" />
          {speed}x
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${step >= 0 ? ((step + 1) / steps.length) * 100 : 0}%` }} />
        </div>
        <span className="shrink-0 text-caption tabular-nums text-muted" aria-live="polite">
          {step >= 0 ? `${step + 1} / ${steps.length}` : `${steps.length} langkah`}
        </span>
      </div>
    </div>
  );
}

/** A coloured chip for a branch: green for "Ya", red for "Tidak". */
export function BranchChip({ label, prefix = "" }: { label: string; prefix?: string }) {
  const tone = YES.test(label) ? "bg-[#d3f9d8] text-[#2b8a3e]" : NO.test(label) ? "bg-[#ffe3e3] text-[#c92a2a]" : "bg-bg text-ink";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{`${prefix}${label}`}</span>;
}

const KindChip = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">{children}</span>
);

/** What the current step is, in words a newcomer follows: its kind, the answer that led here, and what it means. */
export function StepCaption({ step, index }: { step: DiagramStep | undefined; index: number }) {
  if (!step) return null;
  return (
    <div key={index} className="diagram-caption rounded-md border border-primary/25 bg-primary-tint px-3 py-2 text-small text-ink">
      <p className="flex flex-wrap items-center gap-1.5">
        <KindChip>{step.kindLabel}</KindChip>
        {step.branch && <BranchChip label={step.branch} prefix="Jawaban: " />}
      </p>
      <p className="mt-1 font-semibold [overflow-wrap:anywhere]">{step.title}</p>
      {step.hint && <p className="mt-0.5 text-caption text-muted [overflow-wrap:anywhere]">{step.hint}</p>}
    </div>
  );
}

const KEYWORD = /^(MULAI|SELESAI|JIKA TIDAK|JIKA|SELAIN ITU|AKHIR JIKA|SELAMA TIDAK|SELAMA|AKHIR SELAMA|KEMBALI KE)\b/;
const KEYWORD_COLOR: Record<string, string> = {
  MULAI: "text-[#2b8a3e]",
  SELESAI: "text-[#c92a2a]",
  SELAMA: "text-[#6741d9]",
  "SELAMA TIDAK": "text-[#6741d9]",
  "AKHIR SELAMA": "text-[#6741d9]",
  "KEMBALI KE": "text-[#6741d9]",
};

/** One line of pseudocode with its keywords coloured like the shapes they stand for. */
function PseudoText({ text }: { text: string }) {
  const lead = KEYWORD.exec(text)?.[1];
  const rest = lead ? text.slice(lead.length) : text;
  const tail = lead ? /\s(MAKA|LAKUKAN)$/.exec(rest)?.[1] : undefined;
  const middle = tail ? rest.slice(0, -tail.length) : rest;
  const color = lead ? (KEYWORD_COLOR[lead] ?? "text-[#e67700]") : "";
  return (
    <>
      {lead && <span className={`font-bold ${color}`}>{lead}</span>}
      <span>{middle}</span>
      {tail && <span className={`font-bold ${color}`}>{tail}</span>}
    </>
  );
}

/**
 * The flow as pseudocode. The line of the current step is lit (▶), the JIKA / SELAIN ITU / SELAMA line of the branch
 * taken to reach it is marked too, lines already passed are ticked. A click on a line goes to that step; hovering one
 * shows its shape on the diagram.
 */
export function PseudocodeView({
  lines,
  step,
  visited,
  marked,
  onLine,
  onHover,
  compact = false,
  fill = false,
  className,
}: {
  lines: PseudoLine[];
  step: DiagramStep | undefined;
  /** Nodes the playback has passed. */
  visited?: Set<string>;
  /** A node marked from outside the playback (the part a popup explains). */
  marked?: string | null;
  onLine?: (line: PseudoLine) => void;
  onHover?: (node: string | null) => void;
  compact?: boolean;
  /** Takes all the height its container leaves, beside a diagram. */
  fill?: boolean;
  /** Sizing classes that replace the default height limits. */
  className?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const lit = step ? linesForStep(lines, step.node, step.via) : { main: [], branch: [] };
  const markedLines = marked ? linesForStep(lines, marked, null).main : [];
  const first = lit.main[0] ?? markedLines[0];

  // keep the lit line in view inside the list, without scrolling the page
  useEffect(() => {
    const list = listRef.current;
    const row = first === undefined ? null : (list?.children[first] as HTMLElement | undefined);
    if (!list || !row) return;
    if (row.offsetTop < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: row.offsetTop - list.clientHeight / 3, behavior: "smooth" });
    }
  }, [first]);

  if (lines.length === 0) return null;
  return (
    <ol
      ref={listRef}
      className={`relative overflow-y-auto rounded-md border border-border bg-[#fbfbfd] py-1 font-mono text-caption leading-relaxed ${className ?? (fill ? "min-h-24 flex-1" : compact ? "max-h-40" : "max-h-64")}`}
      onPointerLeave={() => onHover?.(null)}
    >
      {lines.map((line, i) => {
        const main = lit.main.includes(i) || markedLines.includes(i);
        const branch = !main && lit.branch.includes(i);
        const done = !main && !branch && line.node !== null && visited?.has(line.node);
        const row = (
          <>
            <span className="w-6 shrink-0 select-none pr-1 text-right tabular-nums text-muted/70">{i + 1}</span>
            <span className={`w-3 shrink-0 select-none text-center ${main ? "text-primary" : "text-[#2b8a3e]"}`} aria-hidden="true">
              {main ? "▶" : done ? "✓" : ""}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ paddingLeft: `${line.indent * 1.1}rem` }}>
              <PseudoText text={line.text} />
            </span>
          </>
        );
        const tone = main ? "bg-primary-tint font-semibold text-ink shadow-[inset_3px_0_0_#7048e8]" : branch ? "bg-[#fff3bf]/70 text-ink" : done ? "text-muted" : "text-ink";
        return (
          <li key={i} className={`flex items-start gap-1 px-1.5 transition-colors duration-300 ${tone}`}>
            {onLine && line.node ? (
              <button
                type="button"
                onClick={() => onLine(line)}
                onPointerEnter={() => onHover?.(line.node)}
                className="flex w-full items-start gap-1 rounded-sm text-left hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {row}
              </button>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A heading for a section of a panel or popup. */
export const SectionLabel = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
    {icon}
    {children}
  </p>
);

/**
 * What a clicked part of a diagram is: what it means, where the flow comes from and where each answer leads, and its
 * lines of pseudocode.
 */
export function PartDetail({
  info,
  lines,
  onGo,
  onPlayFrom,
}: {
  info: PartInfo;
  lines: PseudoLine[];
  /** Opens the part a "from" or "next" link names. */
  onGo: (element: string) => void;
  onPlayFrom?: (step: number) => void;
}) {
  const own = info.node ? linesForStep(lines, info.node, null).main : [];
  const from = own.length ? Math.max(0, Math.min(...own) - 1) : 0;
  const to = own.length ? Math.min(lines.length, Math.max(...own) + 2) : 0;
  const isFlow = info.node !== null;
  const link = (l: PartInfo["prev"][number], next: boolean) => (
    <li key={`${l.element}-${l.branch ?? ""}`}>
      <button type="button" onClick={() => onGo(l.element)} className="flex w-full items-center gap-1.5 rounded-md bg-bg px-2 py-1.5 text-left text-ink transition-colors hover:bg-primary-tint">
        {l.branch && <BranchChip label={l.branch} prefix={next ? "Jika " : ""} />}
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{l.title}</span>
        <ArrowRight size={14} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
      </button>
    </li>
  );
  return (
    <div className="flex flex-col gap-3 text-small">
      {info.hint && (
        <div>
          <SectionLabel icon={<CircleHelp size={12} strokeWidth={2} aria-hidden="true" />}>Apa yang terjadi</SectionLabel>
          <p className="text-ink [overflow-wrap:anywhere]">{info.hint}</p>
        </div>
      )}
      <div>
        <SectionLabel icon={<ArrowRight size={12} strokeWidth={2} aria-hidden="true" />}>Alurnya</SectionLabel>
        <div className="flex flex-col gap-2">
          {info.prev.length > 0 ? (
            <div>
              <p className="mb-1 text-caption text-muted">{isFlow ? "Datang dari" : "Sebelumnya"}</p>
              <ul className="flex flex-col gap-1">{info.prev.map((l) => link(l, false))}</ul>
            </div>
          ) : (
            <p className="text-caption text-muted">{isFlow ? "Alur dimulai di sini." : "Ini bagian pertama."}</p>
          )}
          {info.next.length > 0 ? (
            <div>
              <p className="mb-1 text-caption text-muted">{info.next.length > 1 ? "Lalu, tergantung jawabannya" : "Lalu lanjut ke"}</p>
              <ul className="flex flex-col gap-1">{info.next.map((l) => link(l, true))}</ul>
            </div>
          ) : (
            <p className="text-caption text-muted">{isFlow ? "Alur berakhir di sini." : "Ini bagian terakhir."}</p>
          )}
        </div>
      </div>
      {own.length > 0 && (
        <div>
          <SectionLabel icon={<Code2 size={12} strokeWidth={2} aria-hidden="true" />}>Di pseudocode</SectionLabel>
          <PseudocodeView
            lines={lines.slice(from, to).map((l) => ({ ...l, indent: Math.max(0, l.indent - (lines[from]?.indent ?? 0)) }))}
            step={undefined}
            marked={info.node}
            compact
          />
        </div>
      )}
      {onPlayFrom && info.firstStep >= 0 && (
        <button
          type="button"
          onClick={() => onPlayFrom(info.firstStep)}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-primary px-3 text-caption font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
        >
          <Play size={14} strokeWidth={2} aria-hidden="true" />
          Putar animasi dari sini
        </button>
      )}
    </div>
  );
}

/** The header of a part's details: its number in the reading order, its kind and its label. */
export function PartHeader({ info, onClose }: { info: PartInfo; onClose: () => void }) {
  return (
    <header className="flex items-start gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-surface text-small font-bold tabular-nums text-primary">{info.number}</span>
      <div className="min-w-0 flex-1">
        <KindChip>{info.kindLabel}</KindChip>
        <h3 className="mt-1 text-body font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{info.title}</h3>
      </div>
      <button type="button" onClick={onClose} aria-label="Tutup penjelasan" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink">
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </header>
  );
}
