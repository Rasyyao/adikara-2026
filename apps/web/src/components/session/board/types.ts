// The class whiteboard's data. Element types and field names follow Excalidraw's scene format
// (rectangle, ellipse, diamond, line, arrow, freedraw, text), so a saved scene stays readable.

export type ShapeKind = "rectangle" | "ellipse" | "diamond";
export type PointsKind = "line" | "arrow" | "freedraw";
export type Tool = "select" | "hand" | ShapeKind | "line" | "arrow" | "freedraw" | "text" | "eraser";

export type Point = [number, number];

export interface Style {
  strokeColor: string;
  /** "transparent" or a colour. */
  backgroundColor: string;
  strokeWidth: number;
}

interface Base extends Style {
  id: string;
  x: number;
  y: number;
  /** Bumped on every change; the autosave compares `id:version` to know what changed. */
  version: number;
  /** Elements that share a group id are selected, moved and copied together. */
  groupId?: string;
  /** Set on the shapes of a diagram the AI drew (flow, timeline, comparison), so the board can play it step by step. */
  diagram?: DiagramTag;
}

export type DiagramKind = "flow" | "timeline" | "comparison" | "trace";
export type FlowNodeKind = "start" | "step" | "decision" | "end";

/**
 * Which part of a diagram a shape is. A flow keeps its nodes (`node`, `nodeKind`) and arrows (`from`, `to`), so its
 * playback is walked from the shapes as they are now, however the teacher moved or resized them; a timeline or a
 * comparison lights its parts up in `step` order.
 */
export interface DiagramTag {
  id: string;
  kind: DiagramKind;
  node?: string;
  nodeKind?: FlowNodeKind;
  from?: string;
  to?: string;
  /** The branch an arrow stands for ("Ya", "Tidak"). */
  label?: string;
  step?: number;
  /** A one-line explanation for a beginner, shown while the playback is on this part. */
  hint?: string;
  /** Decoration (badge, legend, branch pill): drawn, but never lit up on its own. */
  deco?: boolean;
  /** On a code simulation: a variable whose value this step gave or changed, lit up with the line that did it. */
  changed?: boolean;
}

export interface BoxElement extends Base {
  type: ShapeKind;
  width: number;
  height: number;
  /** Text in the middle of the shape, added by double click. */
  label?: string;
  /** Size of the label; it grows and shrinks with the shape (LABEL_FONT when absent). */
  fontSize?: number;
}

export interface PointsElement extends Base {
  type: PointsKind;
  /** Relative to x, y. */
  points: Point[];
}

export interface TextElement extends Base {
  type: "text";
  text: string;
  fontSize: number;
}

/** A node of a mindmap placed on the board. `text` is the question the node sends to the AI (absent on boards saved before it was kept). */
export interface BoardMindmapNode {
  id: string;
  parent_id: string | null;
  label: string;
  text?: string;
}

/** A whole mindmap as one object: it moves, scales and is deleted as a unit; its branches open and close. */
export interface MindmapElement extends Base {
  type: "mindmap";
  title: string;
  nodes: BoardMindmapNode[];
  /** Ids of the nodes whose branches are folded. */
  collapsed: string[];
  scale: number;
}

/** Size a quiz card is drawn at before scaling; it keeps these proportions when resized. */
export const QUIZ_CARD = { w: 360, h: 460 };

/**
 * A quiz put on the board: a card with its title and a QR code. A student scans the code or clicks the card to take
 * it; the teacher clicks it to follow the results. `closed` is set when the teacher closed the quiz.
 */
export interface QuizElement extends Base {
  type: "quiz";
  width: number;
  height: number;
  quizId: string;
  sessionId: string;
  title: string;
  kind: string;
  questionCount: number;
  closed?: boolean;
}

export type BoardElement = BoxElement | PointsElement | TextElement | MindmapElement | QuizElement;

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface View {
  /** Where the scene origin is on screen, in pixels. */
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const DEFAULT_FONT_SIZE = 24;

export const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#6741d9"];
export const FILL_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99", "#d0bfff"];
export const STROKE_WIDTHS = [
  { value: 2, label: "Tipis" },
  { value: 4, label: "Sedang" },
  { value: 7, label: "Tebal" },
];

export const DEFAULT_STYLE: Style = { strokeColor: "#1e1e1e", backgroundColor: "transparent", strokeWidth: 2 };

export const TOOL_LABELS: Record<Tool, string> = {
  select: "Pilih",
  hand: "Geser kanvas",
  rectangle: "Persegi",
  ellipse: "Elips",
  diamond: "Belah ketupat",
  line: "Garis",
  arrow: "Panah",
  freedraw: "Pena",
  text: "Teks",
  eraser: "Penghapus",
};

/** Excalidraw's single-key shortcuts. */
export const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "hand",
  r: "rectangle",
  o: "ellipse",
  d: "diamond",
  l: "line",
  a: "arrow",
  p: "freedraw",
  t: "text",
  e: "eraser",
};
