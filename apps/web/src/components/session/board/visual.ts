// The AI's structured visualization (a ```visual block of JSON) as ordinary board shapes: flow, timeline, comparison.
// Shapes, not text, so the teacher can move, restyle and edit every part of it on the board.

import { boundsOfAll, LABEL_FONT, lineHeightOf, measureText, newId, wrapToWidth } from "./geometry";
import { DEFAULT_STYLE, type BoardElement, type BoxElement, type DiagramKind, type DiagramTag, type FlowNodeKind, type Point, type PointsElement } from "./types";

export type FlowKind = FlowNodeKind;
export interface FlowNode {
  id: string;
  kind: FlowKind;
  label: string;
  /** What the step means, in plain words for someone new to programming; shown while a playback is on it. */
  hint?: string | null;
}
export interface FlowEdge {
  from: string;
  to: string;
  label: string | null;
}

/** One line of a code simulation running: the line, what happens in plain words, and the variables after it. */
export interface TraceStep {
  /** 1-based line of `code`. */
  line: number;
  say: string | null;
  /** The variables this line gave a value; the others keep theirs. */
  vars: { name: string; value: string }[];
  /** What the line prints on the screen. */
  output: string | null;
}

export type Visual = (
  | { type: "flow"; title: string; nodes: FlowNode[]; edges: FlowEdge[] }
  | { type: "timeline"; title: string; items: { label: string; detail: string | null }[] }
  | { type: "comparison"; title: string; columns: { title: string; points: string[] }[] }
  | {
      type: "trace";
      title: string;
      code: string[];
      steps: TraceStep[];
      /** What a variable is in the analogy ("kotak", "loker", "gelas"), and its icon: the board names the boxes so. */
      thing: string;
      icon: string;
    }
) & {
  /** An everyday comparison ("a variable is a labelled box"), shown above the drawing so students grasp the idea first. */
  analogy?: string | null;
};

export const VISUAL_LABELS: Record<Visual["type"], string> = { flow: "Diagram alur", timeline: "Linimasa", comparison: "Perbandingan", trace: "Simulasi kode" };

const KINDS: FlowKind[] = ["start", "step", "decision", "end"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A value as a student reads it in a box: text as written, numbers and lists as code writes them. */
const valueText = (v: unknown): string => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

const MAX_CODE_LINES = 14;
const MAX_TRACE_STEPS = 12;

function parseTrace(raw: Record<string, unknown>, title: string): Visual | null {
  const code = (Array.isArray(raw.code) ? raw.code : typeof raw.code === "string" ? raw.code.split("\n") : [])
    .map((l) => (typeof l === "string" ? l.replace(/\s+$/, "") : ""))
    .filter((l, i, all) => l || (i > 0 && i < all.length - 1))
    .slice(0, MAX_CODE_LINES);
  if (code.length === 0) return null;
  const varsOf = (v: unknown): TraceStep["vars"] =>
    Array.isArray(v)
      ? v.flatMap((x) => (isObject(x) && str(x.name) ? [{ name: str(x.name), value: valueText(x.value) }] : []))
      : isObject(v)
        ? Object.entries(v).flatMap(([name, value]) => (name.trim() ? [{ name: name.trim(), value: valueText(value) }] : []))
        : [];
  let steps = (Array.isArray(raw.steps) ? raw.steps : []).flatMap((x, i): TraceStep[] => {
    if (!isObject(x)) return [];
    const n = Number(x.line);
    const line = Number.isInteger(n) && n >= 1 && n <= code.length ? n : Math.min(i + 1, code.length);
    const output = valueText(x.output);
    return [{ line, say: str(x.say) || str(x.explain) || str(x.detail) || null, vars: varsOf(x.vars ?? x.variables), output: output || null }];
  });
  // only the code: every non-empty line runs once, in order
  if (steps.length === 0) steps = code.flatMap((l, i) => (l.trim() ? [{ line: i + 1, say: null, vars: [], output: null }] : []));
  // the object of the analogy, a word or two; an icon only when it is a short symbol, never text
  const thing = str(raw.thing).toLowerCase().split(/\s+/).slice(0, 2).join(" ").slice(0, 16) || "kotak";
  const icon = /^[^\p{L}\p{N}\s]{1,4}$/u.test(str(raw.icon)) ? str(raw.icon) : "📦";
  return { type: "trace", title, code, steps: steps.slice(0, MAX_TRACE_STEPS), thing, icon };
}

/** A visualization read from the worker's JSON; null when it is not one (a malformed block is shown as plain text instead). */
export function parseVisual(raw: unknown): Visual | null {
  const visual = parseVisualShape(raw);
  const analogy = visual && isObject(raw) ? str(raw.analogy) || str(raw.perumpamaan) : "";
  return visual && analogy ? { ...visual, analogy } : visual;
}

function parseVisualShape(raw: unknown): Visual | null {
  if (!isObject(raw)) return null;
  const title = str(raw.title) || "Visualisasi";
  if (raw.type === "trace") return parseTrace(raw, title);
  if (raw.type === "flow" && Array.isArray(raw.nodes) && Array.isArray(raw.edges)) {
    const nodes = raw.nodes.flatMap((n): FlowNode[] =>
      isObject(n) && str(n.id) && str(n.label) && KINDS.includes(n.kind as FlowKind)
        ? [{ id: str(n.id), kind: n.kind as FlowKind, label: str(n.label), hint: str(n.hint) || str(n.detail) || null }]
        : [],
    );
    const ids = new Set(nodes.map((n) => n.id));
    const edges = raw.edges.flatMap((e): FlowEdge[] =>
      isObject(e) && ids.has(str(e.from)) && ids.has(str(e.to)) && str(e.from) !== str(e.to) ? [{ from: str(e.from), to: str(e.to), label: str(e.label) || null }] : [],
    );
    return nodes.length > 0 ? { type: "flow", title, nodes, edges } : null;
  }
  if (raw.type === "timeline" && Array.isArray(raw.items)) {
    const items = raw.items.flatMap((i) => (isObject(i) && str(i.label) ? [{ label: str(i.label), detail: str(i.detail) || null }] : []));
    return items.length > 0 ? { type: "timeline", title, items } : null;
  }
  if (raw.type === "comparison" && Array.isArray(raw.columns)) {
    const columns = raw.columns.flatMap((c) =>
      isObject(c) && str(c.title) ? [{ title: str(c.title), points: (Array.isArray(c.points) ? c.points : []).map(str).filter(Boolean) }] : [],
    );
    return columns.length > 0 ? { type: "comparison", title, columns } : null;
  }
  return null;
}

const TYPE_ALIASES: Record<string, Visual["type"]> = {
  flow: "flow",
  flowchart: "flow",
  diagram: "flow",
  timeline: "timeline",
  comparison: "comparison",
  compare: "comparison",
  trace: "trace",
  simulation: "trace",
  simulasi: "trace",
  code: "trace",
};
const TYPE_HINT = /"type"\s*:\s*"(flow|flowchart|diagram|timeline|comparison|compare|trace|simulation|simulasi|code)"/i;

/** JSON as models write it: smart quotes, trailing commas, or cut off before the closing brackets. null when it still does not parse. */
function parseLooseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // repaired below
  }
  let fixed = text.replace(/[\u201c\u201d]/g, '"').replace(/,(\s*[}\]])/g, "$1");
  const closers: string[] = [];
  let inString = false;
  for (let i = 0; i < fixed.length; i++) {
    const c = fixed[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") closers.push("}");
    else if (c === "[") closers.push("]");
    else if (c === "}" || c === "]") closers.pop();
  }
  if (inString) fixed += '"';
  fixed = fixed.replace(/,\s*$/, "") + closers.reverse().join("");
  try {
    return JSON.parse(fixed.replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return null;
  }
}

/** The end of the JSON object that starts at `from` (the text length when it is cut off). */
function objectEnd(text: string, from: number): number {
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return text.length;
}

/** Where a visual's JSON sits in a reply: a ```visual / ```json / bare fence (closed or cut off), or bare JSON with no fence at all. */
function visualRegion(content: string): { json: string; start: number; end: number } | null {
  const fence = /```([\w-]*)[^\n]*\n?([\s\S]*?)(?:```|$)/g;
  for (const m of content.matchAll(fence)) {
    const lang = m[1].toLowerCase();
    if (lang === "mindmap" || lang === "assessment") continue;
    if (/"parent_id"\s*:/.test(m[2])) continue;
    if (lang !== "visual" && !TYPE_HINT.test(m[2])) continue;
    const start = m.index ?? 0;
    return { json: m[2].trim(), start, end: start + m[0].length };
  }
  if (/```(?:mindmap|assessment)\b/i.test(content) || /"parent_id"\s*:/.test(content)) return null;
  const hint = TYPE_HINT.exec(content);
  if (!hint) return null;
  const start = content.lastIndexOf("{", hint.index);
  if (start < 0) return null;
  const end = objectEnd(content, start);
  return { json: content.slice(start, end), start, end };
}

/** The raw JSON of a reply's visual with its type spelled the way `parseVisual` reads it; null when there is none. */
function rawVisualOf(content: string): { raw: Record<string, unknown>; start: number; end: number } | null {
  const found = visualRegion(content);
  if (!found) return null;
  const raw = parseLooseJson(found.json);
  if (!isObject(raw)) return null;
  if (typeof raw.type === "string") raw.type = TYPE_ALIASES[raw.type.toLowerCase()] ?? raw.type;
  return { raw, start: found.start, end: found.end };
}

/**
 * The visual block of a reply, with the text around it; the JSON itself is never part of that text. `saved` is the
 * teacher's mark that the visual is ready for class: it is listed on the board, to be put there without asking the AI.
 */
export function extractVisualFromContent(content: string): { visual: Visual; saved: boolean; introText: string; outroText: string } | null {
  const found = rawVisualOf(content);
  const visual = found ? parseVisual(found.raw) : null;
  return found && visual ? { visual, saved: found.raw.saved === true, introText: content.slice(0, found.start).trim(), outroText: content.slice(found.end).trim() } : null;
}

/** The reply with its visual marked (or no longer marked) as saved for class; null when it holds no visual. */
export function setVisualSaved(content: string, saved: boolean): string | null {
  const found = rawVisualOf(content);
  if (!found || !parseVisual(found.raw)) return null;
  const rest = { ...found.raw };
  delete rest.saved;
  const json = JSON.stringify(saved ? { ...rest, saved: true } : rest, null, 2);
  return `${content.slice(0, found.start)}\`\`\`visual\n${json}\n\`\`\`${content.slice(found.end)}`;
}

/** A reply with a visual's JSON taken out, for when the visual itself could not be read: the client never sees raw JSON. */
export function withoutVisualJson(content: string): string {
  const found = visualRegion(content);
  return found ? `${content.slice(0, found.start)}${content.slice(found.end)}`.trim() : content;
}

// ---- shapes -----------------------------------------------------------------------------------------------------------

/** Fill and outline pairs for the parts of a timeline or comparison; the outline doubles as the text colour. */
const PALETTE = [
  { fill: "#d0ebff", stroke: "#1971c2" },
  { fill: "#d3f9d8", stroke: "#2b8a3e" },
  { fill: "#fff3bf", stroke: "#e67700" },
  { fill: "#ffe3e3", stroke: "#c92a2a" },
  { fill: "#e5dbff", stroke: "#6741d9" },
];
/** Each kind of flow node has its own shape and colour, the same as in the legend under the flow. */
export const FLOW_STYLE: Record<FlowKind, { fill: string; stroke: string; name: string }> = {
  start: { fill: "#d3f9d8", stroke: "#2b8a3e", name: "Mulai" },
  step: { fill: "#dbe4ff", stroke: "#3b5bdb", name: "Langkah" },
  decision: { fill: "#fff3bf", stroke: "#e67700", name: "Keputusan" },
  end: { fill: "#ffe3e3", stroke: "#c92a2a", name: "Selesai" },
};
const ARROW_COLOR = "#495057";
const GAP_X = 56;
const GAP_Y = 88;
const LANE = 36;
const PILL_FONT = 16;
const BADGE = 34;
/** Labels of a flow's nodes: larger than a hand-drawn shape's, so the back of the class can read them. */
const FLOW_FONT = 20;

export function box(
  type: BoxElement["type"],
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  backgroundColor: string,
  strokeColor = DEFAULT_STYLE.strokeColor,
  diagram?: DiagramTag,
  fontSize?: number,
): BoxElement {
  return {
    ...DEFAULT_STYLE,
    id: newId(),
    type,
    x,
    y,
    width,
    height,
    label,
    backgroundColor,
    strokeColor,
    version: 1,
    ...(diagram ? { diagram } : {}),
    ...(fontSize ? { fontSize } : {}),
  };
}

export function text(x: number, y: number, value: string, fontSize: number, strokeColor = DEFAULT_STYLE.strokeColor, diagram?: DiagramTag): BoardElement {
  return { ...DEFAULT_STYLE, id: newId(), type: "text", x, y, text: value, fontSize, strokeColor, version: 1, ...(diagram ? { diagram } : {}) };
}

export function path(type: "arrow" | "line", points: Point[], strokeWidth = DEFAULT_STYLE.strokeWidth, strokeColor = DEFAULT_STYLE.strokeColor, diagram?: DiagramTag): PointsElement {
  const [x, y] = points[0];
  return { ...DEFAULT_STYLE, id: newId(), type, x, y, points: points.map((p): Point => [p[0] - x, p[1] - y]), strokeWidth, strokeColor, version: 1, ...(diagram ? { diagram } : {}) };
}

/** A branch name ("Ya", "Tidak") as a small coloured pill, so a beginner sees at once which way each arrow goes. */
export function branchPill(x: number, y: number, label: string, diagram: DiagramTag): BoxElement {
  const tone = /^(ya|yes|benar|true)$/i.test(label) ? PALETTE[1] : /^(tidak|no|salah|false)$/i.test(label) ? PALETTE[3] : { fill: "#f1f3f5", stroke: "#495057" };
  return { ...box("rectangle", x, y, pillWidth(label), 30, label, tone.fill, tone.stroke, { ...diagram, deco: true }, PILL_FONT), strokeWidth: 2 };
}
export const pillWidth = (label: string) => measureText(label, PILL_FONT).w + 28;

/**
 * The number of a step, in a circle just outside the top-left of its shape (never over its label): the order a
 * beginner should read the flow in.
 */
function badge(shape: BoxElement, n: number, stroke: string, diagram: DiagramTag): BoxElement {
  const [cx, cy] =
    shape.type === "rectangle"
      ? [shape.x - 4, shape.y - 4]
      : shape.type === "diamond"
        ? [shape.x + shape.width * 0.25 - 14, shape.y + shape.height * 0.25 - 14]
        : [shape.x + 4, shape.y + 2];
  return { ...box("ellipse", cx - BADGE / 2, cy - BADGE / 2, BADGE, BADGE, String(n), "#ffffff", stroke, { ...diagram, deco: true }, 16), strokeWidth: 2.5 };
}

/** Height a shape needs for its wrapped label; the label may use 85% of the width (55% in a diamond). */
function heightFor(label: string, width: number, min: number, diamond = false, font = LABEL_FONT): number {
  const lines = wrapToWidth(label, font, width * (diamond ? 0.55 : 0.85)).length;
  const textHeight = lines * lineHeightOf(font);
  return Math.max(min, diamond ? textHeight * 1.8 + 24 : textHeight + 28);
}

const title = (value: string, centreX: number, y: number, id: string, kind: DiagramKind) =>
  text(centreX - measureText(value, 26).w / 2, y, value, 26, "#212529", { id, kind, node: "title", step: 0, deco: true });

/** A decision reads as a yes / no question. */
const asQuestion = (label: string) => (/[?？]$/.test(label) ? label : `${label}?`);

// ---- flow -------------------------------------------------------------------------------------------------------------

interface Placed {
  node: FlowNode;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
}

type FlowShape = { nodes: FlowNode[]; edges: FlowEdge[] };

function flowLayout(v: Extract<Visual, { type: "flow" }>, id: string): BoardElement[] {
  const outOf = new Map<string, FlowEdge[]>(v.nodes.map((n) => [n.id, []]));
  for (const e of v.edges) outOf.get(e.from)?.push(e);
  const labelOf = (n: FlowNode) => (n.kind === "decision" ? asQuestion(n.label) : n.label);

  // an edge into a node still being visited closes a loop: it is drawn on the side and does not count for the layers
  const start = v.nodes.find((n) => n.kind === "start") ?? v.nodes[0];
  const state = new Map<string, 1 | 2>();
  const back = new Set<FlowEdge>();
  const visit = (nodeId: string) => {
    state.set(nodeId, 1);
    for (const e of outOf.get(nodeId) ?? []) {
      const s = state.get(e.to);
      if (s === 1) back.add(e);
      else if (!s) visit(e.to);
    }
    state.set(nodeId, 2);
  };
  visit(start.id);
  const forward = v.edges.filter((e) => !back.has(e));

  const layerOf = new Map(v.nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < v.nodes.length; pass++) {
    let changed = false;
    for (const e of forward) {
      const next = (layerOf.get(e.from) ?? 0) + 1;
      if (next > (layerOf.get(e.to) ?? 0)) {
        layerOf.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows: FlowNode[][] = [];
  for (const n of v.nodes) (rows[layerOf.get(n.id) ?? 0] ??= []).push(n);

  const placed = new Map<string, Placed>();
  const layerTop: number[] = [];
  const layerBottom: number[] = [];
  let y = 0;
  rows.forEach((row, layer) => {
    if (!row) return;
    // a node goes under the average place of the nodes that lead to it, so branches do not cross needlessly
    const centre = (n: FlowNode) => {
      const xs = forward.filter((e) => e.to === n.id && placed.has(e.from)).map((e) => placed.get(e.from)!.x + placed.get(e.from)!.w / 2);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    };
    row.sort((a, b) => centre(a) - centre(b));
    const sizes = row.map((n) => {
      const w = n.kind === "decision" ? (labelOf(n).length > 24 ? 340 : 280) : n.kind === "step" ? 250 : 200;
      return { w, h: heightFor(labelOf(n), w, n.kind === "decision" ? 128 : n.kind === "step" ? 72 : 64, n.kind === "decision", FLOW_FONT) };
    });
    const total = sizes.reduce((sum, s) => sum + s.w, 0) + GAP_X * (row.length - 1);
    const rowHeight = Math.max(...sizes.map((s) => s.h));
    // the row sits under the nodes that lead to it, so a branch is below its decision, not at the middle of the page
    const parentCentres = row.flatMap((n) => forward.filter((e) => e.to === n.id && placed.has(e.from)).map((e) => placed.get(e.from)!.x + placed.get(e.from)!.w / 2));
    const rowCentre = parentCentres.length ? parentCentres.reduce((a, b) => a + b, 0) / parentCentres.length : 0;
    let x = rowCentre - total / 2;
    row.forEach((node, i) => {
      placed.set(node.id, { node, x, y: y + (rowHeight - sizes[i].h) / 2, w: sizes[i].w, h: sizes[i].h, layer });
      x += sizes[i].w + GAP_X;
    });
    layerTop[layer] = y;
    layerBottom[layer] = y + rowHeight;
    y += rowHeight + GAP_Y;
  });

  const all = [...placed.values()];
  const maxX = Math.max(...all.map((p) => p.x + p.w));
  const minX = Math.min(...all.map((p) => p.x));
  const maxY = Math.max(...all.map((p) => p.y + p.h));
  const tag = (extra: Omit<DiagramTag, "id" | "kind">): DiagramTag => ({ id, kind: "flow", ...extra });
  const out: BoardElement[] = [title(v.title, (minX + maxX) / 2, -64, id, "flow")];

  // the number of each node is the order the playback first reaches it
  const order = new Map<string, number>();
  for (const s of flowSteps(v)) if (!order.has(s.node)) order.set(s.node, order.size + 1);
  const badges: BoardElement[] = [];
  for (const p of all) {
    const look = FLOW_STYLE[p.node.kind];
    const shape = box(
      p.node.kind === "decision" ? "diamond" : p.node.kind === "step" ? "rectangle" : "ellipse",
      p.x,
      p.y,
      p.w,
      p.h,
      labelOf(p.node),
      look.fill,
      look.stroke,
      tag({ node: p.node.id, nodeKind: p.node.kind, step: p.layer * 2 + 1, ...(p.node.hint ? { hint: p.node.hint } : {}) }),
    );
    out.push({ ...shape, strokeWidth: 2.5, fontSize: FLOW_FONT });
    const n = order.get(p.node.id);
    if (n) badges.push(badge(shape, n, look.stroke, tag({ node: p.node.id, step: p.layer * 2 + 2 })));
  }

  const middle = (minX + maxX) / 2;
  const lanes = { left: 0, right: 0 };
  const laneAt = (side: "left" | "right") => (side === "right" ? maxX + LANE + 28 * lanes.right++ : minX - LANE - 28 * lanes.left++);
  /** Nothing of the node's row on that side of it, so a run out of that side crosses no node. */
  const sideFree = (a: Placed, side: "left" | "right") =>
    !all.some((p) => p !== a && p.layer === a.layer && (side === "left" ? p.x + p.w <= a.x : p.x >= a.x + a.w));
  /** The side a loop or skipping edge leaves by: the nearer outer edge of the diagram when its row is clear. */
  const exitSide = (a: Placed): "left" | "right" => {
    const nearer = a.x + a.w / 2 < middle ? "left" : "right";
    const other = nearer === "left" ? "right" : "left";
    return sideFree(a, nearer) || !sideFree(a, other) ? nearer : other;
  };
  /** Whether the straight run from a decision's corner to its target crosses no other node of its row. */
  const cornerIsFree = (a: Placed, targetX: number) => {
    const [from, to] = targetX < a.x ? [targetX, a.x] : [a.x + a.w, targetX];
    return !all.some((p) => p !== a && p.layer === a.layer && p.x < to && p.x + p.w > from);
  };
  const pills: BoardElement[] = [];
  for (const e of v.edges) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    const sx = a.x + a.w / 2;
    const dx = b.x + b.w / 2;
    const ay = a.y + a.h / 2;
    const decision = a.node.kind === "decision";
    const labelWidth = e.label ? pillWidth(e.label) : 0;
    let points: Point[];
    let labelAt: Point;
    if (back.has(e) || b.layer - a.layer > 1) {
      // a loop back, or a jump over rows: out of the side of its node, along a lane outside the diagram, and into the top
      // of the target through the gap above it, so it never runs through the nodes in between
      const side = exitSide(a);
      const laneX = laneAt(side);
      const gapAbove = layerTop[b.layer] - GAP_Y / 2;
      const edgeX = side === "right" ? a.x + a.w : a.x;
      points = [[edgeX, ay], [laneX, ay], [laneX, gapAbove], [dx, gapAbove], [dx, b.y]];
      labelAt = [side === "right" ? edgeX + 8 : edgeX - labelWidth - 8, ay - 32];
    } else if (decision && Math.abs(dx - sx) > a.w / 2 && cornerIsFree(a, dx)) {
      // a decision leaves by the corner on the side of a target that lies beyond it
      const left = dx < sx;
      const cornerX = left ? a.x : a.x + a.w;
      points = [[cornerX, ay], [dx, ay], [dx, b.y]];
      labelAt = [left ? cornerX - labelWidth - 8 : cornerX + 8, ay - 32];
    } else if (Math.abs(dx - sx) <= 1) {
      points = [[sx, a.y + a.h], [dx, b.y]];
      labelAt = [sx + 10, a.y + a.h + 8];
    } else {
      const midY = layerBottom[a.layer] + GAP_Y / 2;
      points = [[sx, a.y + a.h], [sx, midY], [dx, midY], [dx, b.y]];
      labelAt = [dx < sx ? sx - labelWidth - 10 : sx + 10, a.y + a.h + 6];
    }
    const edgeTag = tag({ from: e.from, to: e.to, step: a.layer * 2 + 2, ...(e.label ? { label: e.label } : {}) });
    out.push(path("arrow", points, 3, ARROW_COLOR, edgeTag));
    if (e.label) pills.push(branchPill(labelAt[0], labelAt[1], e.label, edgeTag));
  }

  // a legend of the shapes, so a newcomer knows what an oval, a box and a diamond stand for
  const used = (["start", "step", "decision"] as const).filter((k) => all.some((p) => p.node.kind === k || (k === "start" && p.node.kind === "end")));
  const legendStep = rows.length * 2 + 2;
  const legend: BoardElement[] = [];
  let lx = 0;
  for (const kind of used) {
    const look = FLOW_STYLE[kind];
    const name = kind === "start" ? "Mulai / Selesai" : kind === "decision" ? "Keputusan (Ya/Tidak)" : "Langkah / perintah";
    const w = measureText(name, 15).w + (kind === "decision" ? 72 : 44);
    legend.push(box(kind === "decision" ? "diamond" : kind === "step" ? "rectangle" : "ellipse", lx, 0, w, kind === "decision" ? 58 : 40, name, look.fill, look.stroke, tag({ deco: true, node: "legend", step: legendStep }), 15));
    lx += w + 16;
  }
  const legendLeft = (minX + maxX) / 2 - (lx - 16) / 2;
  const legendTop = maxY + 48;
  for (const el of legend) out.push({ ...el, x: el.x + legendLeft, y: legendTop + (58 - (el as BoxElement).height) / 2 });

  return [...out, ...pills, ...badges];
}

/**
 * The order a playback walks a flow: start to end, then again down the branches not yet taken, so every side of each
 * decision is shown once ("Ya" first, then "Tidak"). Each step is a node, plus the edge taken to reach it.
 */
export function flowSteps(v: FlowShape): { node: string; edge: FlowEdge | null }[] {
  if (v.nodes.length === 0) return [];
  const outOf = new Map<string, FlowEdge[]>(v.nodes.map((n) => [n.id, []]));
  for (const e of v.edges) outOf.get(e.from)?.push(e);
  // "Ya" is walked before "Tidak", whatever order the edges were written in
  const rank = (e: FlowEdge) => (e.label && /^(ya|yes|benar|true)$/i.test(e.label) ? 0 : e.label && /^(tidak|no|salah|false)$/i.test(e.label) ? 2 : 1);
  for (const list of outOf.values()) list.sort((a, b) => rank(a) - rank(b));
  const taken = new Set<FlowEdge>();
  const start = v.nodes.find((n) => n.kind === "start") ?? v.nodes[0];
  const steps: { node: string; edge: FlowEdge | null }[] = [];
  const MAX_STEPS = 60;
  for (let run = 0; run < 6 && steps.length < MAX_STEPS; run++) {
    let id = start.id;
    let via: FlowEdge | null = null;
    let newEdge = run === 0;
    const walk: { node: string; edge: FlowEdge | null }[] = [];
    const seenInRun = new Set<FlowEdge>();
    for (;;) {
      walk.push({ node: id, edge: via });
      const next = (outOf.get(id) ?? []).filter((e) => !seenInRun.has(e));
      // prefer an edge no earlier run has taken, so a second run shows the other branch; else one that leads to such an
      // edge further down, so a branch nested under an already walked one is reached too
      const reachesUntaken = (from: string) => {
        const seen = new Set<string>();
        const stack = [from];
        while (stack.length) {
          const at = stack.pop()!;
          if (seen.has(at)) continue;
          seen.add(at);
          for (const e of outOf.get(at) ?? []) {
            if (!taken.has(e)) return true;
            stack.push(e.to);
          }
        }
        return false;
      };
      const pick = next.find((e) => !taken.has(e)) ?? next.find((e) => reachesUntaken(e.to)) ?? next[0];
      if (!pick) break;
      if (!taken.has(pick)) newEdge = true;
      taken.add(pick);
      seenInRun.add(pick);
      via = pick;
      id = pick.to;
    }
    if (!newEdge) break;
    steps.push(...walk);
  }
  return steps.slice(0, MAX_STEPS);
}

// ---- timeline ---------------------------------------------------------------------------------------------------------

function timelineElements(v: Extract<Visual, { type: "timeline" }>, id: string): BoardElement[] {
  const W = 210;
  const GAP = 40;
  const total = v.items.length * W + (v.items.length - 1) * GAP;
  const left = -total / 2;
  const cardHeight = Math.max(...v.items.map((i) => heightFor(i.label, W, 60)));
  const tag = (extra: Omit<DiagramTag, "id" | "kind">): DiagramTag => ({ id, kind: "timeline", ...extra });
  // the axis is an arrow: time runs to the right
  const out: BoardElement[] = [title(v.title, 0, -84, id, "timeline"), path("arrow", [[left - 28, 0], [left + total + 40, 0]], 4, ARROW_COLOR, tag({ deco: true, node: "axis", step: 0 }))];
  v.items.forEach((item, i) => {
    const centre = left + i * (W + GAP) + W / 2;
    const look = PALETTE[i % PALETTE.length];
    const part = tag({ step: i + 1, ...(item.detail ? { hint: item.detail } : {}) });
    out.push(path("line", [[centre, 17], [centre, 44]], 2, look.stroke, part));
    out.push(box("ellipse", centre - 17, -17, 34, 34, String(i + 1), "#ffffff", look.stroke, { ...part, deco: true }, 15));
    out.push({ ...box("rectangle", centre - W / 2, 44, W, cardHeight, item.label, look.fill, look.stroke, part), strokeWidth: 2.5 });
    if (item.detail) out.push(text(centre - W / 2 + 6, 44 + cardHeight + 12, wrapToWidth(item.detail, 15, W - 12).join("\n"), 15, "#495057", part));
  });
  return out;
}

// ---- comparison -------------------------------------------------------------------------------------------------------

function comparisonElements(v: Extract<Visual, { type: "comparison" }>, id: string): BoardElement[] {
  const W = 250;
  const GAP = 32;
  const total = v.columns.length * W + (v.columns.length - 1) * GAP;
  const left = -total / 2;
  const headHeight = Math.max(...v.columns.map((c) => heightFor(c.title, W, 60)));
  const out: BoardElement[] = [title(v.title, 0, -64, id, "comparison")];
  let step = 1;
  v.columns.forEach((column, i) => {
    const x = left + i * (W + GAP);
    const look = PALETTE[i % PALETTE.length];
    out.push({ ...box("rectangle", x, 0, W, headHeight, column.title, look.fill, look.stroke, { id, kind: "comparison", step: step++, node: "head" }), strokeWidth: 3 });
    let y = headHeight + 14;
    for (const point of column.points) {
      const h = heightFor(point, W, 56);
      out.push(box("rectangle", x, y, W, h, point, "#ffffff", look.stroke, { id, kind: "comparison", step: step++ }));
      y += h + 12;
    }
  });
  return out;
}

// ---- code simulation -------------------------------------------------------------------------------------------------

const CODE_FONT_SIZE = 18;
/** The code font is wider than the one text is measured in. */
const codeWidth = (line: string, font = CODE_FONT_SIZE) => measureText(line, font).w * 1.25;
const VALUE_FONT = 24;
const ROW_H = 68;
const ROW_GAP = 26;
const SAY_FONT = 16;
const TONE = {
  fresh: { fill: "#d3f9d8", stroke: "#2b8a3e" },
  changed: { fill: "#fff3bf", stroke: "#e67700" },
  same: { fill: "#f8f9fa", stroke: "#495057" },
  code: { fill: "#edf2ff", stroke: "#364fc7" },
  screen: { fill: "#e7f5ff", stroke: "#1864ab" },
};

/**
 * Code as it runs, the way a class traces it on paper: the whole program on the left, and on the right one row per
 * line that runs (in order, a loop's lines again), with every variable as a labelled box holding its value after that
 * line. A box that gets a value lights up: green when it is new, yellow when its old value is thrown away for the new.
 */
function traceElements(v: Extract<Visual, { type: "trace" }>, id: string): BoardElement[] {
  const tag = (extra: Omit<DiagramTag, "id" | "kind">): DiagramTag => ({ id, kind: "trace", ...extra });
  const names: string[] = [];
  for (const s of v.steps) for (const x of s.vars) if (!names.includes(x.name)) names.push(x.name);
  const hasScreen = v.steps.some((s) => s.output);

  // every row's state is the one before it with this line's values written in
  let state = new Map<string, string>();
  const rows = v.steps.map((step) => {
    const before = state;
    state = new Map(before);
    for (const x of step.vars) state.set(x.name, x.value);
    return { step, before, after: state };
  });

  const programText = v.code.map((l, i) => `${String(i + 1).padStart(2, " ")}  ${l}`).join("\n");
  const programW = Math.max(240, ...v.code.map((l) => codeWidth(`00  ${l}`, 17))) + 32;
  const programH = v.code.length * lineHeightOf(17) + 64;
  const codeW = Math.min(380, Math.max(200, ...v.steps.map((s) => codeWidth(v.code[s.line - 1]?.trim() ?? "") + 40)));
  const valueW = (name: string) => Math.min(220, Math.max(120, measureText(name, 16).w + 36, ...rows.map((r) => measureText(r.after.get(name) ?? "", VALUE_FONT).w + 40)));
  const varWs = names.map(valueW);
  const screenW = hasScreen ? Math.min(240, Math.max(150, ...v.steps.map((s) => measureText(s.output ?? "", 20).w + 40))) : 0;

  const stripX = programW + 56;
  const codeX = stripX + BADGE + 12;
  const varsX = codeX + codeW + 64;
  const colX = names.map((_, i) => varsX + varWs.slice(0, i).reduce((a, w) => a + w + 20, 0));
  const screenX = (names.length ? colX[names.length - 1] + varWs[names.length - 1] : varsX - 20) + 36;
  const right = hasScreen ? screenX + screenW : names.length ? colX[names.length - 1] + varWs[names.length - 1] : codeX + codeW;
  const sayW = right - codeX;

  const out: BoardElement[] = [];
  // the program, always shown, so the class reads the whole code and sees which line each row is
  out.push({ ...box("rectangle", 0, 0, programW, programH, "", "#f8f9fa", "#343a40", tag({ deco: true, node: "program", step: 0 })), strokeWidth: 2 });
  out.push(text(16, 14, "Program", 15, "#495057", tag({ deco: true, node: "varhead", step: 0 })));
  out.push(text(16, 44, programText, 17, "#212529", tag({ deco: true, node: "program", step: 0 })));

  // the column heads: what each box is called, above its column
  const headY = 0;
  out.push(text(codeX, headY + 6, "Baris yang dijalankan", 15, "#495057", tag({ deco: true, node: "varhead", step: 0 })));
  names.forEach((name, i) => {
    out.push({ ...box("rectangle", colX[i], headY, varWs[i], 32, `${v.icon} ${name}`, "#f1f3f5", "#343a40", tag({ deco: true, node: "varhead", step: 0 }), 16), strokeWidth: 2 });
  });
  if (hasScreen) out.push({ ...box("rectangle", screenX, headY, screenW, 32, "🖥️ Layar", "#f1f3f5", "#343a40", tag({ deco: true, node: "varhead", step: 0 }), 16), strokeWidth: 2 });

  let y = headY + 52;
  rows.forEach(({ step, before, after }, i) => {
    const n = i + 1;
    const line = v.code[step.line - 1]?.trim() ?? "";
    const part = (extra: Omit<DiagramTag, "id" | "kind"> = {}) => tag({ step: n, node: `L${step.line}`, ...extra });
    // the line first: it is the part a step is about
    out.push({ ...box("rectangle", codeX, y, codeW, ROW_H, line, TONE.code.fill, TONE.code.stroke, part(step.say ? { hint: step.say } : {}), CODE_FONT_SIZE), strokeWidth: 2.5 });
    out.push({ ...box("ellipse", stripX, y + ROW_H / 2 - BADGE / 2, BADGE, BADGE, String(n), "#ffffff", TONE.code.stroke, part({ deco: true }), 16), strokeWidth: 2.5 });
    if (names.length || hasScreen) out.push(path("arrow", [[codeX + codeW + 8, y + ROW_H / 2], [varsX - 12, y + ROW_H / 2]], 3, ARROW_COLOR, part({ deco: true })));
    let notes = 0;
    names.forEach((name, c) => {
      const value = after.get(name);
      if (value === undefined) return; // the box is not made yet
      const written = step.vars.some((x) => x.name === name);
      const old = before.get(name);
      const tone = !written ? TONE.same : old === undefined ? TONE.fresh : TONE.changed;
      out.push({
        ...box("rectangle", colX[c], y, varWs[c], ROW_H, value || "\"\"", tone.fill, tone.stroke, part({ deco: !written, ...(written ? { changed: true } : {}) }), VALUE_FONT),
        strokeWidth: written ? 3 : 1.5,
      });
      if (written && old !== undefined && old !== value) {
        const note = wrapToWidth(`✕ ${old} dibuang`, 14, varWs[c]).join("\n");
        out.push(text(colX[c] + 4, y + ROW_H + 6, note, 14, "#c92a2a", part({ deco: true })));
        notes = Math.max(notes, note.split("\n").length);
      } else if (written && old === undefined) {
        out.push(text(colX[c] + 4, y + ROW_H + 6, `✓ ${v.thing} baru`, 14, "#2b8a3e", part({ deco: true })));
        notes = Math.max(notes, 1);
      }
    });
    if (step.output) out.push({ ...box("rectangle", screenX, y, screenW, ROW_H, step.output, TONE.screen.fill, TONE.screen.stroke, part({ changed: true }), 20), strokeWidth: 3 });
    let bottom = y + ROW_H + (notes ? notes * lineHeightOf(14) + 8 : 0);
    if (step.say) {
      const said = wrapToWidth(step.say, SAY_FONT, sayW).join("\n");
      out.push(text(codeX, bottom + 8, said, SAY_FONT, "#495057", part({ deco: true })));
      bottom += 8 + said.split("\n").length * lineHeightOf(SAY_FONT);
    }
    y = bottom + ROW_GAP;
  });

  // centred on x = 0, like the other kinds
  const shift = -right / 2;
  const placed = out.map((e) => ({ ...e, x: e.x + shift }));
  return [title(v.title, 0, -64, id, "trace"), ...placed];
}

/**
 * The analogy of a visual as a yellow card between the title and the drawing: the everyday picture a student holds on
 * to ("a variable is a labelled box") before reading the shapes.
 */
function withAnalogy(elements: BoardElement[], analogy: string, id: string, kind: DiagramKind): BoardElement[] {
  const isTitle = (e: BoardElement) => e.diagram?.node === "title";
  const content = boundsOfAll(elements.filter((e) => !isTitle(e)));
  if (!content) return elements;
  const label = `💡 Perumpamaan: ${analogy}`;
  const w = Math.min(820, Math.max(420, measureText(label, 19).w / 0.8 + 32));
  const h = heightFor(label, w, 64, false, 19);
  const x = content.x + content.w / 2 - w / 2;
  const y = content.y - 28 - h;
  const card = { ...box("rectangle", x, y, w, h, label, "#fff9db", "#e67700", { id, kind, node: "analogy", step: 0, deco: true }, 19), strokeWidth: 2 };
  return [card, ...elements.map((e) => (isTitle(e) ? { ...e, y: y - 52 } : e))];
}

/** The shapes of a visualization, centred on x = 0 with the title above y = 0, all tagged as one diagram. */
export function visualElements(v: Visual): BoardElement[] {
  const id = newId();
  const shapes = (() => {
    switch (v.type) {
      case "flow":
        return flowLayout(v, id);
      case "timeline":
        return timelineElements(v, id);
      case "comparison":
        return comparisonElements(v, id);
      case "trace":
        return traceElements(v, id);
    }
  })();
  return v.analogy ? withAnalogy(shapes, v.analogy, id, v.type) : shapes;
}
