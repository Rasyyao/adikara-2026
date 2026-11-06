import { layoutMindmap, type LayoutNode } from "../../materials/mindmap-layout";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_STYLE,
  type BoardElement,
  type BoardMindmapNode,
  type BoxElement,
  type Bounds,
  type DiagramKind,
  type DiagramTag,
  type FlowNodeKind,
  type MindmapElement,
  type Point,
  type PointsElement,
  type TextElement,
} from "./types";

export interface MindmapLayout {
  nodes: LayoutNode[];
  byId: Map<string, LayoutNode>;
  /** The layout's box in its own units: nodes start at (0, 0) after shifting by the top-left corner. */
  w: number;
  h: number;
}

/** Room right of a node for the fold button that sits on its edge. */
const MINDMAP_RIGHT_PAD = 28;
const layoutCache = new WeakMap<BoardMindmapNode[], { key: string; layout: MindmapLayout }>();

/** The tree layout of a mindmap element, in unscaled units with the top-left node corner at (0, 0). Cached per nodes array. */
export function mindmapLayoutOf(el: MindmapElement): MindmapLayout {
  const key = el.collapsed.join(",");
  const cached = layoutCache.get(el.nodes);
  if (cached && cached.key === key) return cached.layout;
  const { layoutNodes } = layoutMindmap(el.nodes.map((n) => ({ ...n, text: "" })), new Set(el.collapsed));
  const minX = Math.min(...layoutNodes.map((n) => n.x), 0);
  const minY = Math.min(...layoutNodes.map((n) => n.y), 0);
  const nodes = layoutNodes.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY }));
  const layout: MindmapLayout = {
    nodes,
    byId: new Map(nodes.map((n) => [n.id, n])),
    w: Math.max(0, ...nodes.map((n) => n.x + n.width + MINDMAP_RIGHT_PAD)),
    h: Math.max(0, ...nodes.map((n) => n.y + n.height)),
  };
  layoutCache.set(el.nodes, { key, layout });
  return layout;
}

let measureContext: CanvasRenderingContext2D | null | undefined;

export const FONT_FAMILY = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const LINE_HEIGHT = 1.25;

/** Width and height of a text element; measured with a canvas, estimated where there is none (server, tests). */
export function measureText(text: string, fontSize: number): { w: number; h: number } {
  const lines = text.split("\n");
  if (measureContext === undefined) {
    measureContext = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  let w = 0;
  for (const line of lines) {
    if (measureContext) {
      measureContext.font = `${fontSize}px ${FONT_FAMILY}`;
      w = Math.max(w, measureContext.measureText(line).width);
    } else {
      w = Math.max(w, line.length * fontSize * 0.6);
    }
  }
  return { w: Math.max(w, fontSize * 0.5), h: lines.length * fontSize * LINE_HEIGHT };
}

export const lineHeightOf = (fontSize: number) => fontSize * LINE_HEIGHT;

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `el-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The smallest box around an element, with positive width and height. */
export function boundsOf(el: BoardElement): Bounds {
  switch (el.type) {
    case "rectangle":
    case "ellipse":
    case "diamond":
      return { x: Math.min(el.x, el.x + el.width), y: Math.min(el.y, el.y + el.height), w: Math.abs(el.width), h: Math.abs(el.height) };
    case "text": {
      const { w, h } = measureText(el.text, el.fontSize);
      return { x: el.x, y: el.y, w, h };
    }
    case "mindmap": {
      const layout = mindmapLayoutOf(el);
      return { x: el.x, y: el.y, w: layout.w * el.scale, h: layout.h * el.scale };
    }
    case "quiz":
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    default: {
      const xs = el.points.map((p) => p[0] + el.x);
      const ys = el.points.map((p) => p[1] + el.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
  }
}

export function boundsOfAll(els: BoardElement[]): Bounds | null {
  if (els.length === 0) return null;
  const all = els.map(boundsOf);
  const x = Math.min(...all.map((b) => b.x));
  const y = Math.min(...all.map((b) => b.y));
  return { x, y, w: Math.max(...all.map((b) => b.x + b.w)) - x, h: Math.max(...all.map((b) => b.y + b.h)) - y };
}

export function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distToPolygon(p: Point, corners: Point[]): number {
  return Math.min(...corners.map((c, i) => distToSegment(p, c, corners[(i + 1) % corners.length])));
}

function insidePolygon(p: Point, corners: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, yi] = corners[i];
    const [xj, yj] = corners[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether `p` (scene coordinates) touches the element: its outline, or its inside when it is filled. `tol` is in scene units. */
export function hitElement(el: BoardElement, p: Point, tol: number): boolean {
  const reach = tol + el.strokeWidth / 2;
  switch (el.type) {
    case "text": {
      const b = boundsOf(el);
      return p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
    }
    case "mindmap": {
      const layout = mindmapLayoutOf(el);
      const px = (p[0] - el.x) / el.scale;
      const py = (p[1] - el.y) / el.scale;
      const slack = tol / el.scale;
      return layout.nodes.some((n) => px >= n.x - slack && px <= n.x + n.width + slack && py >= n.y - slack && py <= n.y + n.height + slack);
    }
    case "quiz": {
      const b = boundsOf(el);
      return p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
    }
    case "line":
    case "arrow":
    case "freedraw": {
      const pts = el.points.map((q): Point => [q[0] + el.x, q[1] + el.y]);
      if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= reach;
      return pts.some((q, i) => i > 0 && distToSegment(p, pts[i - 1], q) <= reach);
    }
    default: {
      const b = boundsOf(el);
      if (el.type === "ellipse") {
        const rx = b.w / 2 || 0.0001;
        const ry = b.h / 2 || 0.0001;
        const nx = (p[0] - (b.x + rx)) / rx;
        const ny = (p[1] - (b.y + ry)) / ry;
        const r = Math.hypot(nx, ny);
        if (r <= 1) return true;
        return Math.abs(r - 1) * Math.min(rx, ry) <= reach;
      }
      const corners: Point[] =
        el.type === "diamond"
          ? [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]]
          : [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
      if (insidePolygon(p, corners)) return true;
      return distToPolygon(p, corners) <= reach;
    }
  }
}

/** Font size of the text in the middle of a shape. */
export const LABEL_FONT = 18;

/** Wraps text to `maxWidth`, keeping the writer's own line breaks. */
export function wrapToWidth(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureText(next, fontSize).w > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** The width the label of a shape may use; a diamond has less room in its middle. */
export const labelWidthOf = (el: BoxElement) => Math.max(8, boundsOf(el).w * (el.type === "diamond" ? 0.55 : 0.85));

const MIN_LABEL_FONT = 5;
const labelFontCache = new Map<string, number>();

/**
 * The size a shape's label is drawn at: its own size (which a resize scales with the shape), made smaller still
 * while the wrapped text would not fit inside, so a shrunk shape never has its text spill out.
 */
export function labelFontOf(el: BoxElement): number {
  const base = el.fontSize ?? LABEL_FONT;
  if (!el.label) return base;
  const b = boundsOf(el);
  const key = `${el.type}|${b.w.toFixed(1)}|${b.h.toFixed(1)}|${base.toFixed(2)}|${el.label}`;
  const cached = labelFontCache.get(key);
  if (cached !== undefined) return cached;
  const maxW = labelWidthOf(el);
  const maxH = el.type === "diamond" ? b.h * 0.6 : el.type === "ellipse" ? b.h * 0.8 : Math.max(4, b.h - 8);
  let size = base;
  for (let i = 0; i < 24 && size > MIN_LABEL_FONT; i++) {
    const lines = wrapToWidth(el.label, size, maxW);
    if (lines.length * lineHeightOf(size) <= maxH && lines.every((line) => measureText(line, size).w <= maxW + 0.5)) break;
    size = Math.max(MIN_LABEL_FONT, size * 0.9);
  }
  if (labelFontCache.size > 2000) labelFontCache.clear();
  labelFontCache.set(key, size);
  return size;
}

/** The ids of `ids` plus everyone who shares a group with them. */
export function withGroupMembers(ids: string[], all: BoardElement[]): string[] {
  const groups = new Set(all.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId));
  return all.filter((e) => ids.includes(e.id) || (e.groupId && groups.has(e.groupId))).map((e) => e.id);
}

/** Copies with new ids, shifted by (dx, dy); every group and diagram is given a new id too, so a copy never joins the original's. */
export function cloneElements(els: BoardElement[], dx: number, dy: number): BoardElement[] {
  const groups = new Map<string, string>();
  const renamed = (id: string) => {
    if (!groups.has(id)) groups.set(id, newId());
    return groups.get(id)!;
  };
  return els.map((e) => {
    const copy: BoardElement = { ...moveElement(e, dx, dy), id: newId(), version: 1 };
    if (e.groupId) copy.groupId = renamed(e.groupId);
    if (e.diagram) copy.diagram = { ...e.diagram, id: renamed(e.diagram.id) };
    return copy;
  });
}

export function moveElement<T extends BoardElement>(el: T, dx: number, dy: number): T {
  return { ...el, x: el.x + dx, y: el.y + dy, version: el.version + 1 };
}

/**
 * Maps elements from box `from` onto box `to` (a resize). A negative width or height in `to` mirrors the elements,
 * which is what dragging a handle past the opposite edge does.
 */
export function transformElements(els: BoardElement[], from: Bounds, to: Bounds): BoardElement[] {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  const mapX = (x: number) => to.x + (x - from.x) * sx;
  const mapY = (y: number) => to.y + (y - from.y) * sy;
  return els.map((el): BoardElement => {
    const version = el.version + 1;
    switch (el.type) {
      case "rectangle":
      case "ellipse":
      case "diamond": {
        const x1 = mapX(el.x);
        const y1 = mapY(el.y);
        const x2 = mapX(el.x + el.width);
        const y2 = mapY(el.y + el.height);
        // the label grows and shrinks with the shape; the geometric mean keeps a stretch and its undo-stretch symmetric
        const fontSize = Math.max(MIN_LABEL_FONT, Math.min(160, (el.fontSize ?? LABEL_FONT) * Math.sqrt(Math.abs(sx * sy))));
        return { ...el, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), fontSize, version };
      }
      case "text": {
        const b = boundsOf(el);
        const fontSize = Math.max(8, el.fontSize * Math.abs(sy));
        const x1 = mapX(b.x);
        const x2 = mapX(b.x + b.w);
        return { ...el, x: Math.min(x1, x2), y: Math.min(mapY(b.y), mapY(b.y + b.h)), fontSize, version };
      }
      case "mindmap": {
        const b = boundsOf(el);
        const factor = Math.max(0.1, (Math.abs(sx) + Math.abs(sy)) / 2); // a mindmap keeps its proportions
        const x1 = mapX(b.x);
        const x2 = mapX(b.x + b.w);
        return { ...el, x: Math.min(x1, x2), y: Math.min(mapY(b.y), mapY(b.y + b.h)), scale: el.scale * factor, version };
      }
      case "quiz": {
        // a quiz card keeps its proportions, so its QR code stays square and scannable
        const factor = Math.max(0.3, (Math.abs(sx) + Math.abs(sy)) / 2);
        const x1 = mapX(el.x);
        const x2 = mapX(el.x + el.width);
        return { ...el, x: Math.min(x1, x2), y: Math.min(mapY(el.y), mapY(el.y + el.height)), width: el.width * factor, height: el.height * factor, version };
      }
      default: {
        const abs = el.points.map((q): Point => [mapX(q[0] + el.x), mapY(q[1] + el.y)]);
        const [ox, oy] = abs[0];
        return { ...el, x: ox, y: oy, points: abs.map((q): Point => [q[0] - ox, q[1] - oy]), version };
      }
    }
  });
}

/** A smooth SVG path through freehand points (quadratic curves between midpoints). */
export function freedrawPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]} l 0.01 0`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2;
    const my = (points[i][1] + points[i + 1][1]) / 2;
    d += ` Q ${points[i][0]} ${points[i][1]} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

/** The two short strokes of an arrow head at the end of the last segment. */
export function arrowHeadPath(el: PointsElement): string {
  const pts = el.points;
  if (pts.length < 2) return "";
  const [tx, ty] = pts[pts.length - 1];
  const [fx, fy] = pts[pts.length - 2];
  const angle = Math.atan2(ty - fy, tx - fx);
  const size = Math.min(Math.max(12, el.strokeWidth * 4), Math.hypot(tx - fx, ty - fy) || 12);
  const wing = (delta: number): Point => [tx - size * Math.cos(angle + delta), ty - size * Math.sin(angle + delta)];
  const [ax, ay] = wing(Math.PI / 7);
  const [bx, by] = wing(-Math.PI / 7);
  return `M ${ax} ${ay} L ${tx} ${ty} L ${bx} ${by}`;
}

const isPoint = (value: unknown): value is Point =>
  Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";

const DIAGRAM_KINDS: DiagramKind[] = ["flow", "timeline", "comparison", "trace"];
const NODE_KINDS: FlowNodeKind[] = ["start", "step", "decision", "end"];

function sanitizeDiagramTag(raw: unknown): DiagramTag | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !DIAGRAM_KINDS.includes(r.kind as DiagramKind)) return null;
  const tag: DiagramTag = { id: r.id, kind: r.kind as DiagramKind };
  for (const key of ["node", "from", "to", "label", "hint"] as const) if (typeof r[key] === "string") tag[key] = r[key];
  if (NODE_KINDS.includes(r.nodeKind as FlowNodeKind)) tag.nodeKind = r.nodeKind as FlowNodeKind;
  if (typeof r.step === "number") tag.step = r.step;
  if (r.deco === true) tag.deco = true;
  if (r.changed === true) tag.changed = true;
  return tag;
}

/** Reads elements saved earlier (ours or Excalidraw's) into the editor's shape; anything it cannot draw is dropped. */
export function sanitizeElements(raw: unknown[]): BoardElement[] {
  const out: BoardElement[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (r.isDeleted === true || typeof r.id !== "string" || typeof r.x !== "number" || typeof r.y !== "number") continue;
    const style = {
      strokeColor: typeof r.strokeColor === "string" ? r.strokeColor : DEFAULT_STYLE.strokeColor,
      backgroundColor: typeof r.backgroundColor === "string" ? r.backgroundColor : DEFAULT_STYLE.backgroundColor,
      strokeWidth: typeof r.strokeWidth === "number" ? r.strokeWidth : DEFAULT_STYLE.strokeWidth,
    };
    const diagram = sanitizeDiagramTag(r.diagram);
    const base = {
      id: r.id,
      x: r.x,
      y: r.y,
      version: typeof r.version === "number" ? r.version : 1,
      ...style,
      ...(typeof r.groupId === "string" ? { groupId: r.groupId } : {}),
      ...(diagram ? { diagram } : {}),
    };
    if (r.type === "rectangle" || r.type === "ellipse" || r.type === "diamond") {
      if (typeof r.width === "number" && typeof r.height === "number") {
        out.push({
          ...base,
          type: r.type,
          width: r.width,
          height: r.height,
          ...(typeof r.label === "string" && r.label ? { label: r.label } : {}),
          ...(typeof r.fontSize === "number" && r.fontSize > 0 ? { fontSize: r.fontSize } : {}),
        });
      }
    } else if (r.type === "line" || r.type === "arrow" || r.type === "freedraw") {
      const points = Array.isArray(r.points) ? r.points.filter(isPoint).map((p): Point => [p[0], p[1]]) : [];
      if (points.length > 0) out.push({ ...base, type: r.type, points });
    } else if (r.type === "mindmap" && Array.isArray(r.nodes)) {
      const nodes = r.nodes.flatMap((n): BoardMindmapNode[] => {
        const node = n as Record<string, unknown> | null;
        if (!node || typeof node.id !== "string" || typeof node.label !== "string") return [];
        return [{ id: node.id, parent_id: typeof node.parent_id === "string" ? node.parent_id : null, label: node.label, ...(typeof node.text === "string" && node.text ? { text: node.text } : {}) }];
      });
      if (nodes.length > 0) {
        out.push({
          ...base,
          type: "mindmap",
          title: typeof r.title === "string" ? r.title : "Mindmap",
          nodes,
          collapsed: Array.isArray(r.collapsed) ? r.collapsed.filter((id): id is string => typeof id === "string") : [],
          scale: typeof r.scale === "number" && r.scale > 0 ? r.scale : 1,
        });
      }
    } else if (r.type === "quiz" && typeof r.quizId === "string" && typeof r.sessionId === "string" && typeof r.width === "number" && typeof r.height === "number") {
      out.push({
        ...base,
        type: "quiz",
        width: r.width,
        height: r.height,
        quizId: r.quizId,
        sessionId: r.sessionId,
        title: typeof r.title === "string" ? r.title : "Kuis",
        kind: typeof r.kind === "string" ? r.kind : "quiz",
        questionCount: typeof r.questionCount === "number" ? r.questionCount : 0,
        ...(r.closed === true ? { closed: true } : {}),
      });
    } else if (r.type === "text" && typeof r.text === "string") {
      out.push({ ...base, type: "text", text: r.text, fontSize: typeof r.fontSize === "number" ? r.fontSize : DEFAULT_FONT_SIZE });
    }
  }
  return out;
}

export type { TextElement };
