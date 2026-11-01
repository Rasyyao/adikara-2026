"use client";

import { ChevronDown, Code2, Maximize2, MousePointerClick, Workflow, X } from "lucide-react";
import { useState } from "react";
import { boundsOf } from "./geometry";
import type { DiagramStep, PartInfo } from "./diagram";
import { PartDetail, PartHeader, PlaybackBar, PseudocodeView, StepCaption, type Playback } from "./diagram-playback";
import type { PseudoLine } from "./pseudocode";
import type { BoardElement, View } from "./types";

const POPUP_W = 312;

/**
 * The playback of the diagram the teacher clicked, docked in a corner of the board so it never jumps while the board
 * is panned: what the diagram is, the controls, the caption of the step, and the pseudocode with the step's line lit.
 */
export function DiagramPanel({
  title,
  target,
  steps,
  lines,
  playback,
  marked,
  onChange,
  onHoverNode,
  onClose,
  onFocus,
  attached = null,
}: {
  /** Zooms the board so the diagram and this panel fill the screen. */
  onFocus?: () => void;
  /** The side of the diagram the panel is stuck to; it then fills its height and its inner corners are square. */
  attached?: "left" | "right" | null;
  title: string;
  target: string;
  steps: DiagramStep[];
  lines: PseudoLine[];
  playback: Playback | null;
  /** The node a popup is explaining, marked in the pseudocode too. */
  marked: string | null;
  onChange: (next: Playback | null) => void;
  onHoverNode: (node: string | null) => void;
  onClose: () => void;
}) {
  const [codeOpen, setCodeOpen] = useState(true);
  const step = playback?.target === target ? playback.step : -1;
  const current = steps[step];
  const visited = new Set(steps.slice(0, step).flatMap((s) => (s.node ? [s.node] : [])));
  /** A click on a line goes to the first step on its node, paused, so the teacher can talk it through. */
  const goToLine = (line: PseudoLine) => {
    const at = steps.findIndex((s) => s.node === line.node);
    if (at >= 0) onChange({ target, step: at, playing: false, speed: playback?.speed });
  };

  return (
    <section
      aria-label={`Animasi ${title}`}
      className={`flex flex-col overflow-hidden border border-border bg-surface ${
        attached === "right"
          ? "h-full rounded-r-xl shadow-[8px_8px_24px_-12px_rgb(15_23_42/0.25)]"
          : attached === "left"
            ? "h-full rounded-l-xl shadow-[-8px_8px_24px_-12px_rgb(15_23_42/0.25)]"
            : "max-h-full rounded-lg shadow-[var(--shadow-overlay)]"
      }`}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
          <Workflow size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-ink">{title}</p>
          <p className="text-caption text-muted">Animasi alur · {steps.length} langkah</p>
        </div>
        {onFocus && (
          <button
            type="button"
            onClick={onFocus}
            title="Perbesar diagram agar mudah dibaca"
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-caption font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
          >
            <Maximize2 size={14} strokeWidth={1.75} aria-hidden="true" />
            Perbesar
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Tutup animasi" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink">
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      <div className={`flex min-h-0 flex-col gap-3 p-3 ${attached ? "flex-1" : "overflow-y-auto"}`}>
        <PlaybackBar target={target} steps={steps} playback={playback} onChange={onChange} />
        {current ? (
          <StepCaption step={current} index={step} />
        ) : (
          <p className="flex items-center gap-1.5 text-caption text-muted">
            <MousePointerClick size={14} strokeWidth={1.75} aria-hidden="true" />
            Klik bagian diagram untuk melihat penjelasannya.
          </p>
        )}
        {lines.length > 0 && (
          <div className={attached && codeOpen ? "flex min-h-0 flex-1 flex-col" : undefined}>
            <button
              type="button"
              onClick={() => setCodeOpen((open) => !open)}
              aria-expanded={codeOpen}
              className="mb-1.5 flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink"
            >
              <Code2 size={12} strokeWidth={2} aria-hidden="true" />
              Pseudocode
              <ChevronDown size={14} strokeWidth={1.75} className={`ml-auto transition-transform ${codeOpen ? "" : "-rotate-90"}`} aria-hidden="true" />
            </button>
            {codeOpen && <PseudocodeView lines={lines} step={current} visited={visited} marked={current ? null : marked} onLine={goToLine} onHover={onHoverNode} fill={Boolean(attached)} />}
          </div>
        )}
      </div>
    </section>
  );
}

/** The explanation of one clicked part, beside it on the board (left of it when there is no room on the right). */
export function DiagramPartPopup({
  info,
  element,
  lines,
  view,
  area,
  reserveRight,
  onGo,
  onPlayFrom,
  onClose,
}: {
  info: PartInfo;
  element: BoardElement;
  lines: PseudoLine[];
  view: View;
  /** Size of the board in pixels, to keep the popup inside it. */
  area: { w: number; h: number };
  /** Pixels on the right covered by something else (the material panel). */
  reserveRight: number;
  onGo: (element: string) => void;
  /** Absent for a diagram with no code: it is only shown, not played. */
  onPlayFrom?: (step: number) => void;
  onClose: () => void;
}) {
  const b = boundsOf(element);
  const left = view.x + b.x * view.zoom;
  const right = view.x + (b.x + b.w) * view.zoom;
  const top = view.y + b.y * view.zoom;
  const room = area.w - reserveRight;
  const x = right + 14 + POPUP_W <= room - 12 ? right + 14 : left - 14 - POPUP_W >= 12 ? left - 14 - POPUP_W : Math.max(12, Math.min(room - POPUP_W - 12, left));
  const y = Math.max(64, Math.min(top - 8, area.h - 360));
  return (
    <div
      role="dialog"
      aria-label={`Penjelasan ${info.title}`}
      className="diagram-caption absolute z-20 flex max-h-[min(34rem,calc(100%-80px))] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-overlay)]"
      style={{ left: x, top: y, width: POPUP_W }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <PartHeader info={info} onClose={onClose} />
      <PartDetail info={info} lines={lines} onGo={onGo} onPlayFrom={onPlayFrom} />
    </div>
  );
}
