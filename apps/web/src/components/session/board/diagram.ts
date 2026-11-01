// The playback of a diagram the AI drew, read back from its shapes as they are on the board now: the teacher may have
// moved, resized, restyled or deleted parts of it, and the playback lights up what is there.

import { pseudocodeOf, type PseudoLine } from "./pseudocode";
import type { BoardElement, DiagramTag, FlowNodeKind } from "./types";
import { flowSteps, type FlowEdge, type FlowNode } from "./visual";

export interface DiagramStep {
  /** Every element lit up on this step (the shape, its badge, the arrow taken to it and the arrow's pill). */
  ids: string[];
  /** The main shapes of the step, drawn with a pulsing outline. */
  focus: string[];
  /** The arrow taken to reach this step, drawn as a moving dashed line. */
  edge: string | null;
  /** What the step is called, for the caption. */
  title: string;
  /** "Mulai", "Langkah", "Keputusan", "Selesai" or the part of a timeline / comparison. */
  kindLabel: string;
  /** The branch taken to get here ("Ya" / "Tidak"), when there was one. */
  branch: string | null;
  /** A plain explanation for a beginner. */
  hint: string | null;
  /** The flow node of the step (null on a timeline or comparison). */
  node: string | null;
  /** The arrow taken to reach the step, as nodes. */
  via: FlowEdge | null;
}

const KIND_LABEL: Record<FlowNodeKind, string> = { start: "Mulai", step: "Langkah", decision: "Keputusan", end: "Selesai" };

/** What a beginner is told at each kind of node when the AI gave no explanation of its own. */
const KIND_HINT: Record<FlowNodeKind, string> = {
  start: "Program mulai berjalan dari sini.",
  step: "Komputer menjalankan perintah ini, lalu lanjut ke panah berikutnya.",
  decision: "Komputer memeriksa pertanyaan ini. Jawaban Ya dan Tidak membawa ke jalur yang berbeda.",
  end: "Program selesai di sini.",
};

const labelOf = (el: BoardElement) => (el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond" ? (el.label ?? "") : el.type === "text" ? el.text : "");

/** The diagram the selection belongs to: every selected element is a part of the same one. */
export function diagramOfSelection(selected: BoardElement[]): string | null {
  const id = selected[0]?.diagram?.id;
  return id && selected.every((e) => e.diagram?.id === id) ? id : null;
}

/** A flow as it is on the board: its nodes and arrows, read from the tags of the shapes that are still there. */
function flowGraphOf(parts: BoardElement[]) {
  const nodeEls = new Map<string, BoardElement>();
  const nodes: FlowNode[] = [];
  for (const e of parts) {
    const t = e.diagram!;
    if (t.deco || !t.node || !t.nodeKind || nodeEls.has(t.node)) continue;
    nodeEls.set(t.node, e);
    nodes.push({ id: t.node, kind: t.nodeKind, label: labelOf(e), hint: t.hint ?? null });
  }
  const edgeEls = new Map<FlowEdge, BoardElement>();
  const edges: FlowEdge[] = [];
  for (const e of parts) {
    const t = e.diagram!;
    if (t.deco || e.type !== "arrow" || !t.from || !t.to || !nodeEls.has(t.from) || !nodeEls.has(t.to)) continue;
    const edge: FlowEdge = { from: t.from, to: t.to, label: t.label ?? null };
    edges.push(edge);
    edgeEls.set(edge, e);
  }
  return { nodes, edges, nodeEls, edgeEls };
}

function flowStepsOf(parts: BoardElement[]): DiagramStep[] {
  const { nodes, edges, nodeEls, edgeEls } = flowGraphOf(parts);
  const decoOf = (match: (t: DiagramTag) => boolean) => parts.filter((e) => e.diagram!.deco && match(e.diagram!)).map((e) => e.id);
  return flowSteps({ nodes, edges }).map(({ node, edge }) => {
    const el = nodeEls.get(node)!;
    const kind = el.diagram!.nodeKind!;
    const arrow = edge ? edgeEls.get(edge) : undefined;
    const pills = edge ? decoOf((t) => t.from === edge.from && t.to === edge.to && (t.label ?? null) === edge.label) : [];
    return {
      ids: [el.id, ...decoOf((t) => t.node === node), ...(arrow ? [arrow.id] : []), ...pills],
      focus: [el.id],
      edge: arrow?.id ?? null,
      title: labelOf(el),
      kindLabel: KIND_LABEL[kind],
      branch: edge?.label ?? null,
      hint: el.diagram!.hint ?? KIND_HINT[kind],
      node,
      via: edge,
    };
  });
}

/** A timeline, a comparison or a code simulation: its parts in the order they were laid out. */
function orderedStepsOf(parts: BoardElement[], kind: "timeline" | "comparison" | "trace"): DiagramStep[] {
  const byStep = new Map<number, BoardElement[]>();
  for (const e of parts) {
    const s = e.diagram!.step;
    if (s === undefined || s < 1 || (e.diagram!.node === "title")) continue;
    if (!byStep.has(s)) byStep.set(s, []);
    byStep.get(s)!.push(e);
  }
  let column = 0;
  let point = 0;
  return [...byStep.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, els]): DiagramStep[] => {
      const main = els.find((e) => e.type === "rectangle" && !e.diagram!.deco) ?? els.find((e) => !e.diagram!.deco);
      if (!main) return [];
      if (kind === "trace") {
        // the line that ran, with the boxes it wrote a value into
        const line = main.diagram!.node ?? null;
        const focus = [main.id, ...els.filter((e) => e.diagram!.changed).map((e) => e.id)];
        return [
          {
            ids: els.map((e) => e.id),
            focus,
            edge: null,
            title: labelOf(main),
            kindLabel: `Baris ${line?.slice(1) ?? "?"}`,
            branch: null,
            hint: main.diagram!.hint ?? "Komputer menjalankan baris ini.",
            node: line,
            via: null,
          },
        ];
      }
      const head = main.diagram!.node === "head";
      if (head) {
        column += 1;
        point = 0;
      } else point += 1;
      const kindLabel = kind === "timeline" ? `Tahap ${main.diagram!.step}` : head ? `Kolom ${column}` : `Poin ${point}`;
      const hint = main.diagram!.hint ?? (kind === "comparison" ? (head ? "Kelompok yang dibandingkan." : "Ciri dari kelompok di atasnya.") : null);
      return [{ ids: els.map((e) => e.id), focus: [main.id], edge: null, title: labelOf(main), kindLabel, branch: null, hint, node: null, via: null }];
    });
}

/** The steps of one diagram on the board; empty when too little of it is left to play. */
export function diagramSteps(elements: BoardElement[], diagramId: string): DiagramStep[] {
  const parts = elements.filter((e) => e.diagram?.id === diagramId);
  const kind = parts[0]?.diagram?.kind;
  if (!kind) return [];
  const steps = kind === "flow" ? flowStepsOf(parts) : orderedStepsOf(parts, kind);
  return steps.length > 1 ? steps : [];
}

/** How long a step stays: longer for a longer caption, so a class can read it. */
export const stepDuration = (step: DiagramStep | undefined) => Math.min(4200, 1400 + ((step?.title.length ?? 0) + (step?.hint?.length ?? 0)) * 22);

/** The title of a diagram, as it reads on the board now. */
export function diagramTitle(elements: BoardElement[], diagramId: string): string {
  const el = elements.find((e) => e.diagram?.id === diagramId && e.diagram.node === "title");
  return (el && labelOf(el)) || "Visualisasi";
}

/**
 * The code of a diagram on the board, each line knowing its step: the pseudocode of a flow, or the program of a code
 * simulation (read from its program card, so an edit there shows). Empty for a timeline or a comparison: they have no
 * code, so they are shown as they are, with no playback.
 */
export function diagramPseudocode(elements: BoardElement[], diagramId: string): PseudoLine[] {
  const parts = elements.filter((e) => e.diagram?.id === diagramId);
  if (parts[0]?.diagram?.kind === "trace") {
    const program = parts.find((e) => e.type === "text" && e.diagram?.node === "program");
    if (!program || program.type !== "text") return [];
    return program.text.split("\n").map((raw, i) => {
      const code = raw.replace(/^\s*\d+ {2}/, "");
      const indent = Math.floor((code.length - code.trimStart().length) / 2);
      return { text: code.trim(), indent, kind: "step" as const, node: `L${i + 1}` };
    });
  }
  if (parts[0]?.diagram?.kind !== "flow") return [];
  const { nodes, edges } = flowGraphOf(parts);
  return pseudocodeOf({ nodes, edges });
}

/** A part of a diagram the next or previous arrow leads to, as the popup lists it. */
export interface PartLink {
  element: string;
  title: string;
  branch: string | null;
}

/** What the popup of a clicked part says: what it is, its place in the order, and where the flow comes from and goes. */
export interface PartInfo {
  element: string;
  node: string | null;
  number: number;
  kindLabel: string;
  title: string;
  hint: string | null;
  prev: PartLink[];
  next: PartLink[];
  /** The first playback step on this part, to play from here. */
  firstStep: number;
}

/** The part a click on `elementId` is about (a badge, a pill or an arrow speak for the shape they lead to); null for a title or legend. */
export function diagramPartInfo(elements: BoardElement[], diagramId: string, elementId: string, steps = diagramSteps(elements, diagramId)): PartInfo | null {
  const firstStep = steps.findIndex((s) => s.ids.includes(elementId));
  if (firstStep < 0) return null;
  const step = steps[firstStep];
  const main = step.focus[0];
  const first = steps.findIndex((s) => s.focus[0] === main);
  const base = { element: main, node: step.node, kindLabel: step.kindLabel, title: step.title, hint: step.hint, firstStep: first };
  if (!step.node || elements.find((e) => e.id === main)?.diagram?.kind !== "flow") {
    const order = steps.indexOf(steps[first]);
    const link = (s: DiagramStep | undefined): PartLink[] => (s ? [{ element: s.focus[0], title: s.title, branch: null }] : []);
    return { ...base, number: order + 1, prev: link(steps[order - 1]), next: link(steps[order + 1]) };
  }
  const parts = elements.filter((e) => e.diagram?.id === diagramId);
  const { edges, nodeEls } = flowGraphOf(parts);
  const seen: string[] = [];
  for (const s of steps) if (s.node && !seen.includes(s.node)) seen.push(s.node);
  const linkTo = (node: string, branch: string | null): PartLink[] => {
    const el = nodeEls.get(node);
    return el ? [{ element: el.id, title: labelOf(el), branch }] : [];
  };
  const rank = (b: string | null) => (b && /^(ya|yes|benar|true)$/i.test(b) ? 0 : b && /^(tidak|no|salah|false)$/i.test(b) ? 2 : 1);
  return {
    ...base,
    number: seen.indexOf(step.node) + 1,
    prev: edges.filter((e) => e.to === step.node).flatMap((e) => linkTo(e.from, e.label)),
    next: edges
      .filter((e) => e.from === step.node)
      .sort((a, b) => rank(a.label) - rank(b.label))
      .flatMap((e) => linkTo(e.to, e.label)),
  };
}
