"use client";

import { ChevronDown, Code2, MousePointerClick, Plus, Sparkles, Wand2, Workflow } from "lucide-react";
import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Spinner } from "@/components/ui/loaders";
import { diagramPartInfo, diagramPseudocode, diagramSteps, type PartInfo } from "./diagram";
import { DiagramPlayback, FocusRing, PartDetail, PartHeader, PlaybackBar, PseudocodeView, SectionLabel, StepCaption, usePlaybackClock, type Playback } from "./diagram-playback";
import { ElementView } from "./element-view";
import { boundsOf, boundsOfAll, hitElement } from "./geometry";
import type { PseudoLine } from "./pseudocode";
import type { BoardElement } from "./types";
import { VISUAL_LABELS, visualElements, type Visual } from "./visual";
import { useVisualAsk, type VisualAsk } from "./visual-ask";
import { SaveVisualButton } from "./visual-library";
import { diagramExplainPrompt, partExplainPrompt, simplerPrompt } from "./visual-prompts";

const PAD = 24;
const POPUP_W = 340;
/** Below this width the popup spans the card instead of standing beside the part. */
const WIDE_STAGE = 680;
const WHOLE = "__diagram__";

/** Where the popup of a part goes, in pixels inside the drawing. */
interface Anchor {
  element: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  stageWidth: number;
}

/**
 * The AI's explanation of one part (or the whole diagram), asked from the card and read back from the conversation:
 * the first answer, then "simpler" follow-ups, newest shown.
 */
function AiExplain({
  ask,
  asked,
  question,
  simpler,
  onAsked,
  heading = "Penjelasan AI",
}: {
  ask: VisualAsk;
  asked: string[];
  question: string;
  simpler: string;
  onAsked: (id: string) => void;
  heading?: string;
}) {
  const [sending, setSending] = useState(false);
  const latest = asked[asked.length - 1];
  const answer = latest ? ask.answerTo(latest) : null;
  const waiting = sending || Boolean(answer?.pending);

  const send = async (text: string) => {
    setSending(true);
    const id = await ask.ask(text);
    setSending(false);
    if (id) onAsked(id);
  };

  return (
    <div className="rounded-md border border-primary/25 bg-primary-tint/60 p-3">
      <SectionLabel icon={<Sparkles size={12} strokeWidth={2} aria-hidden="true" />}>{heading}</SectionLabel>
      {answer?.content ? (
        <div className="diagram-caption max-h-64 overflow-y-auto text-small leading-relaxed text-ink">
          {ask.render ? ask.render(answer.content) : <p className="whitespace-pre-wrap">{answer.content}</p>}
        </div>
      ) : waiting ? (
        <p role="status" className="flex items-center gap-2 text-small text-muted">
          <Spinner size={14} />
          AI sedang menyusun penjelasan…
        </p>
      ) : (
        <p className="text-caption text-muted">Minta AI menjelaskan dengan bahasa sederhana, lengkap dengan perumpamaan dan contoh untuk kelas.</p>
      )}
      {!waiting && (
        <button
          type="button"
          disabled={ask.busy}
          onClick={() => void send(answer?.content ? simpler : question)}
          className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {answer?.content ? <Wand2 size={14} strokeWidth={2} aria-hidden="true" /> : <Sparkles size={14} strokeWidth={2} aria-hidden="true" />}
          {ask.busy ? "AI sedang menjawab pertanyaan lain…" : answer?.content ? "Jelaskan lebih sederhana" : "Jelaskan pakai AI"}
        </button>
      )}
    </div>
  );
}

/**
 * A visualization in the chat, drawn with the same shapes it will have on the board (fanning in part by part). A click
 * on a part opens a popup beside it: what the part means, where the flow goes, its pseudocode, and an explanation by the
 * AI of this page. The playback walks the diagram step by step, and a flow is written out as pseudocode whose line
 * follows the step being shown.
 */
export function VisualCard({
  visual,
  onAdd,
  save,
}: {
  visual: Visual;
  onAdd?: (elements: BoardElement[]) => void;
  /** Whether the visual is saved for class, and how to change that; no button when the reply cannot be saved. */
  save?: { saved: boolean; saving: boolean; onToggle: () => void };
}) {
  const ask = useVisualAsk();
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const elements = useMemo(() => visualElements(visual), [visual]);
  const box = useMemo(() => boundsOfAll(elements), [elements]);
  const target = elements[0]?.diagram?.id ?? "";
  const steps = useMemo(() => diagramSteps(elements, target), [elements, target]);
  const lines = useMemo(() => diagramPseudocode(elements, target), [elements, target]);
  /** Only a visual with code is played step by step; a timeline or a comparison is simply shown. */
  const playable = lines.length > 0 && steps.length > 1;
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(true);
  /** The questions sent to the AI, per part (its node, or its title on a timeline / comparison) and for the whole diagram. */
  const [asked, setAsked] = useState<Record<string, string[]>>({});
  usePlaybackClock(playback, steps, setPlayback);

  const step = playback?.step ?? -1;
  const current = steps[step];
  const info = anchor ? diagramPartInfo(elements, target, anchor.element, steps) : null;
  const visited = new Set(steps.slice(0, Math.max(0, step)).flatMap((s) => (s.node ? [s.node] : [])));
  const byId = (id: string | null | undefined) => (id ? elements.find((e) => e.id === id) : undefined);
  const hoverElement = hoverNode ? elements.find((e) => e.diagram?.node === hoverNode && !e.diagram.deco) : undefined;
  const keyOf = (part: PartInfo) => part.node ?? part.title;
  const remember = (key: string) => (id: string) => setAsked((all) => ({ ...all, [key]: [...(all[key] ?? []), id] }));

  const changePlayback = (next: Playback | null) => {
    if (next?.playing) setAnchor(null);
    setPlayback(next);
  };

  /** Opens the popup of a part, beside where it is drawn. */
  const openPart = (elementId: string | null) => {
    const svg = svgRef.current;
    const stage = stageRef.current;
    const el = byId(elementId);
    const matrix = svg?.getScreenCTM();
    if (!el || !svg || !stage || !matrix) return setAnchor(null);
    const b = boundsOf(el);
    const origin = stage.getBoundingClientRect();
    const topLeft = new DOMPoint(b.x, b.y).matrixTransform(matrix);
    const bottomRight = new DOMPoint(b.x + b.w, b.y + b.h).matrixTransform(matrix);
    setAnchor({
      element: el.id,
      left: topLeft.x - origin.left,
      top: topLeft.y - origin.top,
      right: bottomRight.x - origin.left,
      bottom: bottomRight.y - origin.top,
      stageWidth: origin.width,
    });
    if (playback?.playing) setPlayback({ ...playback, playing: false });
  };

  /** The part under a click, in the diagram's own units. */
  const onSvgClick = (event: MouseEvent<SVGSVGElement>) => {
    const matrix = svgRef.current?.getScreenCTM()?.inverse();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    const hit = [...elements].reverse().find((e) => hitElement(e, [point.x, point.y], 6));
    openPart(hit ? (diagramPartInfo(elements, target, hit.id, steps)?.element ?? null) : null);
  };

  const goToLine = (line: PseudoLine) => {
    const at = steps.findIndex((s) => s.node === line.node);
    if (at >= 0) changePlayback({ target, step: at, playing: false, speed: playback?.speed });
    setAnchor(null);
  };

  // beside the part on a wide card, under it across the card on a narrow one
  const popupStyle = anchor
    ? anchor.stageWidth >= WIDE_STAGE
      ? {
          left: anchor.right + 12 + POPUP_W <= anchor.stageWidth ? anchor.right + 12 : Math.max(8, anchor.left - 12 - POPUP_W),
          top: Math.max(8, anchor.top - 8),
          width: POPUP_W,
        }
      : { left: 8, right: 8, top: Math.max(8, anchor.bottom + 10) }
    : undefined;

  return (
    <div className="@container flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
            <Workflow size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-ink">{visual.title}</p>
            <p className="text-caption text-muted">
              {VISUAL_LABELS[visual.type]}
              {playable && ` · ${steps.length} langkah`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {save && <SaveVisualButton {...save} />}
          {onAdd && (
            <button
              type="button"
              onClick={() => onAdd(elements)}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              Ke papan
            </button>
          )}
        </div>
      </div>

      {/* the diagram and its pseudocode side by side in one frame on a wide card, one under the other on a narrow one */}
      <div
        className={`grid gap-3 ${
          lines.length > 0 ? "@3xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] @3xl:gap-0 @3xl:overflow-visible @3xl:rounded-lg @3xl:border @3xl:border-border" : ""
        }`}
      >
        <div className={`flex min-w-0 flex-col gap-3 ${lines.length > 0 ? "@3xl:p-3" : ""}`}>
          {box && (
            <div ref={stageRef} className="relative">
              <svg
                ref={svgRef}
                role="img"
                aria-label={`${VISUAL_LABELS[visual.type]}: ${visual.title}. Klik bagian diagram untuk penjelasan.`}
                viewBox={`${box.x - PAD} ${box.y - PAD} ${box.w + PAD * 2} ${box.h + PAD * 2}`}
                preserveAspectRatio="xMidYMin meet"
                className="max-h-[30rem] min-h-40 w-full cursor-pointer rounded-md bg-bg"
                onClick={onSvgClick}
              >
                {elements.map((el) => (
                  <ElementView key={el.id} el={el} />
                ))}
                {step >= 0 && <DiagramPlayback elements={elements} target={target} steps={steps} step={step} />}
                {info && !playback?.playing && <FocusRing el={byId(info.element)} />}
                {hoverElement && <FocusRing el={hoverElement} dashed />}
              </svg>

              {info && popupStyle && (
                <div
                  role="dialog"
                  aria-label={`Penjelasan ${info.title}`}
                  className="diagram-caption absolute z-20 flex max-h-[32rem] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-overlay)]"
                  style={popupStyle}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setAnchor(null);
                  }}
                >
                  <PartHeader info={info} onClose={() => setAnchor(null)} />
                  {ask && (
                    <AiExplain
                      key={keyOf(info)}
                      ask={ask}
                      asked={asked[keyOf(info)] ?? []}
                      question={partExplainPrompt(visual.title, info, lines)}
                      simpler={simplerPrompt(info.title)}
                      onAsked={remember(keyOf(info))}
                    />
                  )}
                  <PartDetail
                    info={info}
                    lines={lines}
                    onGo={openPart}
                    onPlayFrom={playable ? (at) => changePlayback({ target, step: at, playing: true, speed: playback?.speed }) : undefined}
                  />
                </div>
              )}
            </div>
          )}

          {playable && <PlaybackBar target={target} steps={steps} playback={playback} onChange={changePlayback} />}

          {current ? (
            <StepCaption step={current} index={step} />
          ) : (
            <p className="flex items-center gap-1.5 text-caption text-muted">
              <MousePointerClick size={14} strokeWidth={1.75} aria-hidden="true" />
              {playable
                ? "Tekan Putar untuk melihat programnya berjalan, atau klik kotak mana saja untuk penjelasannya."
                : "Klik kotak mana saja di gambar untuk melihat penjelasan dan meminta AI menjelaskannya."}
            </p>
          )}
        </div>
        {lines.length > 0 && (
          <div className="relative min-w-0 @3xl:border-l @3xl:border-border @3xl:bg-[#fbfbfd]">
            <div className="flex min-h-0 flex-col @3xl:absolute @3xl:inset-3">
              <button
                type="button"
                onClick={() => setCodeOpen((open) => !open)}
                aria-expanded={codeOpen}
                className="mb-1.5 flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-ink @3xl:pointer-events-none"
              >
                <Code2 size={12} strokeWidth={2} aria-hidden="true" />
                Pseudocode
                <span className="ml-1 hidden font-normal normal-case tracking-normal @3xl:inline">· baris yang menyala = langkah di diagram</span>
                <ChevronDown size={14} strokeWidth={1.75} className={`ml-auto transition-transform @3xl:hidden ${codeOpen ? "" : "-rotate-90"}`} aria-hidden="true" />
              </button>
              <div className={`min-h-0 flex-col @3xl:flex @3xl:flex-1 ${codeOpen ? "flex" : "hidden"}`}>
                <PseudocodeView
                  lines={lines}
                  step={current}
                  visited={visited}
                  marked={current ? null : (info?.node ?? null)}
                  onLine={goToLine}
                  onHover={setHoverNode}
                  className="max-h-64 @3xl:max-h-none @3xl:min-h-0 @3xl:flex-1"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {ask && steps.length > 1 && (
        <AiExplain
          ask={ask}
          asked={asked[WHOLE] ?? []}
          question={diagramExplainPrompt(visual.title, VISUAL_LABELS[visual.type], steps.filter((s, i) => steps.findIndex((t) => t.focus[0] === s.focus[0]) === i).map((s) => s.title), lines)}
          simpler={simplerPrompt(visual.title)}
          onAsked={remember(WHOLE)}
          heading="Penjelasan AI untuk seluruh diagram"
        />
      )}
    </div>
  );
}
