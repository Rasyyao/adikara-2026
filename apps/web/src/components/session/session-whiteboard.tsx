"use client";

import { BookOpen, Lock, Maximize2, Minimize2, PencilLine, Radio, WifiOff } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createQuizAction } from "@/app/actions/quizzes";
import { saveBoardAction } from "@/app/actions/sessions";
import { useToast } from "@/components/ui/toast";
import type { BoardScene } from "@/lib/api/types";
import type { MindmapPayload } from "../materials/mindmap-layout";
import { defaultNodePrompt } from "../materials/mindmap-parse";
import type { AssessmentPayload } from "../materials/assessment-editor";
import { QuizResultsPanel } from "./quiz/quiz-results";
import { ElementView } from "./board/element-view";
import { ContextMenu, type MenuItem } from "./board/context-menu";
import { diagramOfSelection, diagramPartInfo, diagramPseudocode, diagramSteps, diagramTitle } from "./board/diagram";
import { DiagramPanel, DiagramPartPopup } from "./board/diagram-panel";
import { DiagramPlayback, FocusRing, usePlaybackClock, type Playback } from "./board/diagram-playback";
import { NodePopup } from "./board/node-popup";
import { noteElements } from "./board/note";
import { LiveCursors } from "./board/live-cursors";
import { useLiveSync, type LiveChannel } from "./board/live-sync";
import { MaterialPanel, PANEL_PX, type BoardMaterialInfo } from "./board/material-panel";
import {
  boundsOf,
  boundsOfAll,
  cloneElements,
  hitElement,
  labelFontOf,
  labelWidthOf,
  lineHeightOf,
  measureText,
  moveElement,
  newId,
  overlaps,
  sanitizeElements,
  transformElements,
  withGroupMembers,
  wrapToWidth,
  FONT_FAMILY,
} from "./board/geometry";
import { StylePanel, ToolBar, ViewBar } from "./board/toolbar";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_STYLE,
  MAX_ZOOM,
  MIN_ZOOM,
  TOOL_KEYS,
  type BoardElement,
  type BoxElement,
  type Bounds,
  type MindmapElement,
  type Point,
  QUIZ_CARD,
  type QuizElement,
  type Style,
  type TextElement,
  type Tool,
  type View,
} from "./board/types";

const SAVE_DELAY_MS = 1500;
const HISTORY_LIMIT = 100;
const HANDLE_PX = 10;
const BACKGROUND = "#ffffff";
/** The animation panel stuck to the side of its diagram, and the frame that joins them into one card. */
const DOCK_W = 360;
const DOCK_MIN_H = 380;
const FRAME_PAD = 32;

/** A rounded rectangle whose corners on `square` side are not rounded, where the panel joins it. */
function framePath(b: Bounds, r: number, square: "left" | "right"): string {
  const [tl, tr, br, bl] = square === "right" ? [r, 0, 0, r] : [0, r, r, 0];
  const { x, y, w, h } = b;
  return [
    `M ${x + tl} ${y}`,
    `H ${x + w - tr}`,
    tr ? `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : "",
    `V ${y + h - br}`,
    br ? `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : "",
    `H ${x + bl}`,
    bl ? `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : "",
    `V ${y + tl}`,
    tl ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : "",
    "Z",
  ].join(" ");
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Belum ada perubahan",
  dirty: "Ada perubahan…",
  saving: "Menyimpan…",
  saved: "Tersimpan",
  error: "Gagal menyimpan, mencoba lagi…",
};

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: { id: Handle; fx: number; fy: number; cursor: string }[] = [
  { id: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { id: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { id: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { id: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { id: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { id: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { id: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { id: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

/** What the pointer is doing right now; `before` is the elements as they were, for undo. */
type Gesture =
  | { kind: "pan"; startX: number; startY: number; origin: View }
  | { kind: "pinch"; distance: number; origin: View; centre: Point }
  | { kind: "create"; id: string; from: Point; before: BoardElement[]; tool: Tool }
  | { kind: "draw"; id: string; from: Point; before: BoardElement[] }
  | { kind: "move"; from: Point; originals: BoardElement[]; before: BoardElement[] }
  | { kind: "resize"; handle: Handle; from: Bounds; originals: BoardElement[]; before: BoardElement[] }
  | { kind: "marquee"; from: Point; keep: string[] }
  | { kind: "erase"; before: BoardElement[] };

interface TextEdit {
  id: string;
  /** Scene position of the text's top-left. */
  x: number;
  y: number;
  fontSize: number;
  color: string;
  value: string;
  existing: boolean;
  /** Set when the text is the label in the middle of a shape: where its middle is and how wide it may be. */
  box?: { cx: number; cy: number; maxW: number };
}

/** What a copy puts on the system clipboard, so elements can be pasted into another board or tab. */
const CLIPBOARD_MARK = "adikaraBoard";
const serializeElements = (els: BoardElement[]) => JSON.stringify({ [CLIPBOARD_MARK]: 1, elements: els });
function parseClipboard(text: string): BoardElement[] | null {
  if (!text.startsWith("{")) return null;
  try {
    const data = JSON.parse(text) as { [CLIPBOARD_MARK]?: number; elements?: unknown };
    if (data[CLIPBOARD_MARK] !== 1 || !Array.isArray(data.elements)) return null;
    const elements = sanitizeElements(data.elements);
    return elements.length > 0 ? elements : null;
  } catch {
    return null;
  }
}

const isBoxElement = (e: BoardElement): e is BoxElement => e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond";

const signatureOf = (elements: BoardElement[]) => elements.map((e) => `${e.id}:${e.version}`).join(",");

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * The class whiteboard: our own canvas editor, modelled on Excalidraw. Shapes, arrows, pen, text and eraser; select, move,
 * resize, duplicate and delete; pan and zoom; undo and redo; autosave a moment after every change.
 * `readOnly` shows the saved drawing (pan and zoom still work) without letting anyone change it.
 * With `live`, the board is shared with the class as it is drawn: the teacher and the students see each other's strokes
 * and cursors. A student's board is saved by the server, not by this component.
 */
export function SessionWhiteboard({
  sessionId,
  initial,
  readOnly: readOnlyProp = false,
  material = null,
  live = null,
  onOpenQuiz,
}: {
  sessionId: string;
  initial: BoardScene | null;
  readOnly?: boolean;
  /** The material assigned to the session; its panel opens in full screen. */
  material?: BoardMaterialInfo | null;
  /** The session's event stream, for drawing together; `role` is who is looking at this board. */
  live?: { channel: LiveChannel; role: "teacher" | "student" } | null;
  /** A student clicked a quiz card (the teacher's click opens the results here). */
  onOpenQuiz?: (card: QuizElement) => void;
}) {
  const toast = useToast();
  const gridId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [initialElements] = useState(() => sanitizeElements(initial?.elements ?? []));
  const [elements, setElementsState] = useState<BoardElement[]>(initialElements);
  const elementsRef = useRef(initialElements);
  const [selected, setSelectedState] = useState<string[]>([]);
  const selectedRef = useRef<string[]>([]);
  const [tool, setToolState] = useState<Tool>(readOnlyProp ? "hand" : "select");
  const toolRef = useRef<Tool>(tool);
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);
  const [view, setViewState] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [editing, setEditingState] = useState<TextEdit | null>(null);
  const editingRef = useRef<TextEdit | null>(null);
  const [panning, setPanning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** Width the teacher gave the material panel by dragging its edge or pressing expand; never wider than the board allows. */
  const [panelWidth, setPanelWidth] = useState(PANEL_PX);
  const panelMax = Math.max(PANEL_PX, size.w - 96);
  const panelPx = Math.min(panelWidth, panelMax);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; scene: Point } | null>(null);
  const [nodeDetail, setNodeDetail] = useState<{ elementId: string; nodeId: string } | null>(null);
  const clipboardRef = useRef<BoardElement[]>([]);
  const pasteCount = useRef(0);
  const clickNode = useRef<{ ref: string; x: number; y: number } | null>(null);
  const lastNodeClick = useRef<{ ref: string; at: number } | null>(null);
  /** A mindmap node sent to the AI; `id` changes on every ask so the same node can be asked twice. */
  const [askRequest, setAskRequest] = useState<{ id: number; text: string } | null>(null);
  const askCounter = useRef(0);
  /** The diagram being played step by step; it stays on when the selection moves elsewhere. */
  const [playback, setPlayback] = useState<Playback | null>(null);
  /** The part of a diagram whose explanation is open, after a click on it. */
  const [partDetail, setPartDetail] = useState<{ target: string; element: string } | null>(null);
  /** The flow node a pseudocode line under the pointer stands for, outlined on the diagram. */
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const clickPart = useRef<{ id: string; target: string; x: number; y: number } | null>(null);
  /** A quiz card under a press; a click (no drag) on it opens the quiz. */
  const clickQuiz = useRef<{ id: string; x: number; y: number } | null>(null);

  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const spaceDown = useRef(false);
  const undoStack = useRef<BoardElement[][]>([]);
  const redoStack = useRef<BoardElement[][]>([]);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });

  const [saveState, setSaveState] = useState<SaveState>(initialElements.length > 0 ? "saved" : "idle");
  const lastSaved = useRef(signatureOf(initialElements));
  const pending = useRef<{ elements: BoardElement[]; signature: string } | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const flushRef = useRef<() => Promise<void>>(async () => {}); // flush calls itself again, through the ref

  // ---- state helpers: every one updates the ref (read by event handlers) and the state (read by rendering) -------------

  const setElements = useCallback((next: BoardElement[]) => {
    elementsRef.current = next;
    setElementsState(next);
  }, []);
  const setSelected = useCallback((ids: string[]) => {
    selectedRef.current = ids;
    setSelectedState(ids);
  }, []);
  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);
  const setTool = useCallback(
    (next: Tool) => {
      toolRef.current = next;
      setToolState(next);
      if (next !== "select") setSelected([]);
    },
    [setSelected],
  );
  const setEditing = useCallback((next: TextEdit | null) => {
    editingRef.current = next;
    setEditingState(next);
  }, []);

  const syncHistory = useCallback(() => setHistory({ undo: undoStack.current.length, redo: redoStack.current.length }), []);

  /** Records `before` as an undo step when the elements changed since. */
  const commit = useCallback(
    (before: BoardElement[]) => {
      if (before === elementsRef.current) return;
      undoStack.current.push(before);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      redoStack.current = [];
      syncHistory();
    },
    [syncHistory],
  );

  // ---- drawing together ------------------------------------------------------------------------------------------------

  const student = live?.role === "student";
  /** The others' changes go into the board and into every undo step, so undo only takes back this viewer's own strokes. */
  const applyRemote = useCallback(
    (change: (all: BoardElement[]) => BoardElement[], replace = false) => {
      setElements(change(elementsRef.current));
      if (replace) {
        undoStack.current = [];
        redoStack.current = [];
      } else {
        undoStack.current = undoStack.current.map(change);
        redoStack.current = redoStack.current.map(change);
      }
      syncHistory();
      const present = new Set(elementsRef.current.map((e) => e.id));
      if (selectedRef.current.some((id) => !present.has(id))) setSelected(selectedRef.current.filter((id) => present.has(id)));
    },
    [setElements, setSelected, syncHistory],
  );
  const sync = useLiveSync({ sessionId, channel: live?.channel ?? null, elements, elementsRef, applyRemote, cursorEveryMs: student ? 120 : 60 });
  /** A student draws only while the teacher allows it. */
  const readOnly = readOnlyProp || (student && !sync.drawAllowed);
  /** The teacher's browser saves the board; a student's changes are saved by the server. */
  const saves = !readOnlyProp && !student;

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(elementsRef.current);
    setElements(previous);
    setSelected(selectedRef.current.filter((id) => previous.some((e) => e.id === id)));
    syncHistory();
  }, [setElements, setSelected, syncHistory]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(elementsRef.current);
    setElements(next);
    setSelected(selectedRef.current.filter((id) => next.some((e) => e.id === id)));
    syncHistory();
  }, [setElements, setSelected, syncHistory]);

  // ---- coordinates, zoom -----------------------------------------------------------------------------------------------

  const toScene = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return [(clientX - (rect?.left ?? 0) - v.x) / v.zoom, (clientY - (rect?.top ?? 0) - v.y) / v.zoom];
  }, []);

  /** Zooms keeping the scene point under `around` (screen pixels inside the board) where it is. */
  const zoomTo = useCallback(
    (zoom: number, around?: Point) => {
      const v = viewRef.current;
      const next = clampZoom(zoom);
      const [ax, ay] = around ?? [size.w / 2, size.h / 2];
      setView({ zoom: next, x: ax - ((ax - v.x) / v.zoom) * next, y: ay - ((ay - v.y) / v.zoom) * next });
    },
    [setView, size.h, size.w],
  );

  const fit = useCallback(() => {
    const box = boundsOfAll(elementsRef.current);
    if (!box || size.w === 0) return setView({ x: size.w / 2, y: size.h / 2, zoom: 1 });
    const zoom = clampZoom(Math.min((size.w - 120) / Math.max(box.w, 1), (size.h - 160) / Math.max(box.h, 1), 1.5));
    setView({ zoom, x: size.w / 2 - (box.x + box.w / 2) * zoom, y: size.h / 2 - (box.y + box.h / 2) * zoom });
  }, [setView, size.h, size.w]);

  const viewAnimation = useRef(0);
  /** Glides the view to `target` instead of jumping, so the class keeps its bearings. */
  const glideTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(viewAnimation.current);
      const from = viewRef.current;
      const started = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - started) / 380);
        const ease = 1 - (1 - t) ** 3;
        setView({ x: from.x + (target.x - from.x) * ease, y: from.y + (target.y - from.y) * ease, zoom: from.zoom + (target.zoom - from.zoom) * ease });
        if (t < 1) viewAnimation.current = requestAnimationFrame(frame);
      };
      viewAnimation.current = requestAnimationFrame(frame);
    },
    [setView],
  );

  /**
   * Zooms onto one diagram so it and its animation panel fill the board: the diagram as large as the room left of the
   * panel allows, so every label reads from the back of the class.
   */
  const focusDiagram = useCallback(
    (diagramId: string) => {
      const box = boundsOfAll(elementsRef.current.filter((e) => e.diagram?.id === diagramId));
      if (!box || size.w === 0) return;
      const reserved = fullscreen && panelOpen ? panelPx + 16 : 0;
      const roomW = size.w - reserved - DOCK_W - 48;
      const roomH = size.h - 72 - 24; // under the toolbar
      const w = box.w + FRAME_PAD * 2;
      const h = box.h + FRAME_PAD * 2;
      const zoom = clampZoom(Math.min(roomW / w, roomH / h, 2.5));
      const left = (size.w - reserved - (w * zoom + DOCK_W)) / 2;
      const top = 72 + (roomH - h * zoom) / 2;
      glideTo({ zoom, x: left - (box.x - FRAME_PAD) * zoom, y: top - (box.y - FRAME_PAD) * zoom });
    },
    [fullscreen, glideTo, panelOpen, panelPx, size.h, size.w],
  );

  // size of the board, and the first view: the drawing in the middle
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || size.w === 0) return;
    framed.current = true;
    fit();
  }, [size.w, fit]);

  // wheel: Ctrl/⌘ (also a trackpad pinch) zooms at the cursor, a plain wheel pans. Needs a non-passive listener.
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(viewAnimation.current);
      const v = viewRef.current;
      if (event.ctrlKey || event.metaKey) {
        const rect = node.getBoundingClientRect();
        zoomTo(v.zoom * Math.exp(-event.deltaY * 0.01), [event.clientX - rect.left, event.clientY - rect.top]);
      } else {
        setView({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY });
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [setView, zoomTo]);

  // ---- editing actions ---------------------------------------------------------------------------------------------------

  const deleteSelected = useCallback(() => {
    if (readOnly || selectedRef.current.length === 0) return;
    const before = elementsRef.current;
    setElements(before.filter((e) => !selectedRef.current.includes(e.id)));
    commit(before);
    setSelected([]);
  }, [commit, readOnly, setElements, setSelected]);

  const duplicateSelected = useCallback(() => {
    if (readOnly || selectedRef.current.length === 0) return;
    const before = elementsRef.current;
    const copies = cloneElements(before.filter((e) => selectedRef.current.includes(e.id)), 20, 20);
    setElements([...before, ...copies]);
    commit(before);
    setSelected(copies.map((c) => c.id));
  }, [commit, readOnly, setElements, setSelected]);

  /** Applies a style change to the selected elements, and remembers it for the next ones. */
  const changeStyle = useCallback(
    (patch: Partial<Style>) => {
      setStyle((current) => ({ ...current, ...patch }));
      if (readOnly || selectedRef.current.length === 0) return;
      const before = elementsRef.current;
      setElements(before.map((e) => (selectedRef.current.includes(e.id) ? { ...e, ...patch, version: e.version + 1 } : e)));
      commit(before);
    },
    [commit, readOnly, setElements],
  );

  const commitText = useCallback(() => {
    const edit = editingRef.current;
    if (!edit) return;
    setEditing(null);
    const before = elementsRef.current;
    const text = edit.value.replace(/\s+$/, "");
    if (edit.box) {
      setElements(before.map((e) => (e.id === edit.id && isBoxElement(e) && (e.label ?? "") !== text.trim() ? { ...e, label: text.trim() || undefined, version: e.version + 1 } : e)));
      commit(before);
      return;
    }
    if (!text.trim()) {
      if (edit.existing) {
        setElements(before.filter((e) => e.id !== edit.id));
        commit(before);
        setSelected([]);
      }
      return;
    }
    if (edit.existing) {
      setElements(before.map((e) => (e.id === edit.id && e.type === "text" && e.text !== text ? { ...e, text, version: e.version + 1 } : e)));
    } else {
      const el: TextElement = { id: edit.id, type: "text", x: edit.x, y: edit.y, text, fontSize: edit.fontSize, strokeColor: edit.color, backgroundColor: "transparent", strokeWidth: 2, version: 1 };
      setElements([...before, el]);
      setTool("select");
      setSelected([el.id]);
    }
    commit(before);
  }, [commit, setEditing, setElements, setSelected, setTool]);

  /** Folds or unfolds one branch of a mindmap on the board. */
  const toggleMindmapNode = useCallback(
    (elementId: string, nodeId: string) => {
      const before = elementsRef.current;
      setElements(
        before.map((e) =>
          e.id === elementId && e.type === "mindmap"
            ? { ...e, collapsed: e.collapsed.includes(nodeId) ? e.collapsed.filter((id) => id !== nodeId) : [...e.collapsed, nodeId], version: e.version + 1 }
            : e,
        ),
      );
      commit(before);
    },
    [commit, setElements],
  );

  /** Sends a mindmap node's question to the AI, like a double tap on the materials page: opens the AI tab of the panel. */
  const askNode = useCallback(
    (elementId: string, nodeId: string) => {
      const mindmap = elementsRef.current.find((e): e is MindmapElement => e.id === elementId && e.type === "mindmap");
      const node = mindmap?.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setNodeDetail(null);
      setPanelOpen(true);
      askCounter.current += 1;
      setAskRequest({ id: askCounter.current, text: node.text || defaultNodePrompt(node.label) });
    },
    [],
  );

  /** Puts a mindmap in the middle of what the teacher is looking at, scaled to fit; it fans out with the same animation as on the materials page. */
  const addMindmap = useCallback(
    (payload: MindmapPayload) => {
      if (readOnly) return;
      const base: MindmapElement = {
        ...DEFAULT_STYLE,
        id: newId(),
        type: "mindmap",
        x: 0,
        y: 0,
        version: 1,
        title: payload.title,
        nodes: payload.nodes.map((n) => ({ id: n.id, parent_id: n.parent_id, label: n.label, ...(n.text ? { text: n.text } : {}) })),
        collapsed: [],
        scale: 1,
      };
      const box = boundsOf(base);
      const v = viewRef.current;
      const freeWidth = size.w - (panelOpen ? panelPx + 16 : 0); // the panel covers the right edge
      const scale = Math.max(0.15, Math.min(1, ((freeWidth / v.zoom) * 0.85) / Math.max(box.w, 1), ((size.h / v.zoom) * 0.8) / Math.max(box.h, 1)));
      const centreX = (freeWidth / 2 - v.x) / v.zoom;
      const centreY = (size.h / 2 - v.y) / v.zoom;
      const el: MindmapElement = { ...base, scale, x: centreX - (box.w * scale) / 2, y: centreY - (box.h * scale) / 2 };
      const before = elementsRef.current;
      setElements([...before, el]);
      commit(before);
      setTool("select");
      setSelected([el.id]);
    },
    [commit, panelOpen, panelPx, readOnly, setElements, setSelected, setTool, size.h, size.w],
  );

  /** A flowchart (made of ordinary shapes, grouped) scaled to fit and put in the middle of the free area. */
  const addFlow = useCallback(
    (elements: BoardElement[]) => {
      if (readOnly || elements.length === 0) return;
      const from = boundsOfAll(elements);
      if (!from) return;
      const v = viewRef.current;
      // a diagram gets its animation panel beside it, so it is sized to the room left of that panel
      const freeWidth = size.w - (panelOpen ? panelPx + 16 : 0) - (elements.some((e) => e.diagram) ? DOCK_W + 24 : 0);
      const scale = Math.min(1.25, ((freeWidth / v.zoom) * 0.9) / Math.max(from.w, 1), (((size.h - 96) / v.zoom) * 0.9) / Math.max(from.h, 1));
      const w = from.w * scale;
      const h = from.h * scale;
      const groupId = newId();
      const diagramId = newId(); // the same visual put on the board twice is two diagrams, each played on its own
      const placed = transformElements(elements, from, { x: (freeWidth / 2 - v.x) / v.zoom - w / 2, y: ((size.h + 48) / 2 - v.y) / v.zoom - h / 2, w, h }).map(
        (e): BoardElement => ({ ...e, id: newId(), groupId, ...(e.diagram ? { diagram: { ...e.diagram, id: diagramId } } : {}) }),
      );
      const before = elementsRef.current;
      setElements([...before, ...placed]);
      commit(before);
      setTool("select");
      setSelected(placed.map((e) => e.id));
    },
    [commit, panelOpen, panelPx, readOnly, setElements, setSelected, setTool, size.h, size.w],
  );

  // ---- quizzes -----------------------------------------------------------------------------------------------------------

  /** A quiz just opened, to put on the board as a card (a new `id` each time). */
  const [addQuizRequest, setAddQuizRequest] = useState<{ id: number; card: Pick<QuizElement, "type" | "quizId" | "sessionId" | "title" | "kind" | "questionCount"> } | null>(null);
  /** The quiz card whose results the teacher is looking at. */
  const [resultsQuiz, setResultsQuiz] = useState<string | null>(null);
  const [openingQuiz, setOpeningQuiz] = useState(false);

  /** Teacher: opens a test of the material as a quiz for the class and puts its card on the board. */
  const addQuiz = useCallback(
    async (test: AssessmentPayload, messageId: string | null) => {
      if (openingQuiz) return;
      setOpeningQuiz(true);
      const result = await createQuizAction(sessionId, {
        title: test.title,
        kind: test.kind,
        questions: test.questions.map((q) => ({ question: q.question, options: q.options, answer: q.answer, explanation: q.explanation, source: q.source })),
        source_chat_id: material?.id ?? null,
        source_message_id: messageId,
      });
      setOpeningQuiz(false);
      if (!result.ok) return void toast.error(result.message);
      const quiz = result.data.quiz;
      setAddQuizRequest((current) => ({
        id: (current?.id ?? 0) + 1,
        card: { type: "quiz", quizId: quiz.id, sessionId, title: quiz.title, kind: quiz.kind, questionCount: quiz.question_count },
      }));
      toast.success("Kuis dibuka. Siswa bisa scan QR atau klik kartunya untuk mulai.");
    },
    [material?.id, openingQuiz, sessionId, toast],
  );

  /** The teacher closed a quiz: its cards say so, for everyone on the board. */
  const markQuizClosed = useCallback(
    (quizId: string) => {
      const before = elementsRef.current;
      setElements(before.map((e) => (e.type === "quiz" && e.quizId === quizId && !e.closed ? { ...e, closed: true, version: e.version + 1 } : e)));
    },
    [setElements],
  );

  // a quiz closed anywhere (the control tab, another device) is marked on its cards; the teacher's board passes it on
  const liveChannel = live?.channel ?? null;
  useEffect(() => {
    if (!liveChannel || student) return;
    return liveChannel.subscribe((event) => {
      if (event.type === "quiz" && event.change === "closed") markQuizClosed(event.quizId);
    });
  }, [liveChannel, markQuizClosed, student]);

  /** A quiz the teacher opened, as a card in the middle of the free part of the board, selected so it can be moved. */
  const handledQuiz = useRef(0);
  useEffect(() => {
    if (!addQuizRequest || addQuizRequest.id === handledQuiz.current || readOnly) return;
    handledQuiz.current = addQuizRequest.id;
    const v = viewRef.current;
    const freeWidth = size.w - (panelOpen ? panelPx + 16 : 0);
    const scale = Math.min(1.4, Math.max(0.5, ((size.h - 120) * 0.8) / v.zoom / QUIZ_CARD.h));
    const w = QUIZ_CARD.w * scale;
    const h = QUIZ_CARD.h * scale;
    const card: QuizElement = {
      ...DEFAULT_STYLE,
      ...addQuizRequest.card,
      id: newId(),
      x: (freeWidth / 2 - v.x) / v.zoom - w / 2,
      y: ((size.h + 48) / 2 - v.y) / v.zoom - h / 2,
      width: w,
      height: h,
      version: 1,
    };
    const before = elementsRef.current;
    setElements([...before, card]);
    commit(before);
    setTool("select");
    setSelected([card.id]);
  }, [addQuizRequest, commit, panelOpen, panelPx, readOnly, setElements, setSelected, setTool, size.h, size.w]);

  /** An answer of the AI as a note card (a box with headings, steps and large text), placed like any other grouped drawing. */
  const addNote = useCallback((raw: string) => addFlow(noteElements(raw)), [addFlow]);

  // ---- copy, paste, group ------------------------------------------------------------------------------------------------

  const selectedCopy = useCallback(() => elementsRef.current.filter((e) => selectedRef.current.includes(e.id)), []);

  /** Copies the selection to the board's own clipboard and, when the browser allows, the system one. */
  const copySelected = useCallback(() => {
    const chosen = selectedCopy();
    if (chosen.length === 0) return;
    clipboardRef.current = chosen;
    pasteCount.current = 0;
    void navigator.clipboard?.writeText(serializeElements(chosen)).catch(() => {});
  }, [selectedCopy]);

  /** Adds copies of `source`: in the middle of `at` when given, else a little off the original so they do not hide it. */
  const pasteElements = useCallback(
    (source: BoardElement[], at?: Point) => {
      if (readOnly || source.length === 0) return;
      const box = boundsOfAll(source);
      let dx: number;
      let dy: number;
      if (at && box) {
        dx = at[0] - (box.x + box.w / 2);
        dy = at[1] - (box.y + box.h / 2);
      } else {
        pasteCount.current += 1;
        dx = dy = 20 * pasteCount.current;
      }
      const copies = cloneElements(source, dx, dy);
      const before = elementsRef.current;
      setElements([...before, ...copies]);
      commit(before);
      setTool("select");
      setSelected(copies.map((c) => c.id));
    },
    [commit, readOnly, setElements, setSelected, setTool],
  );

  const cutSelected = useCallback(() => {
    copySelected();
    deleteSelected();
  }, [copySelected, deleteSelected]);

  /** The "Tempel" menu item: what is on the system clipboard (board elements, or plain text as a note), else the board's own copy. */
  const pasteFromMenu = useCallback(
    async (at: Point) => {
      let plain = "";
      try {
        plain = await navigator.clipboard.readText();
      } catch {
        // no permission: fall back to the board's own copy
      }
      const parsed = parseClipboard(plain);
      if (parsed) pasteElements(parsed, at);
      else if (plain.trim()) addNote(plain);
      else pasteElements(clipboardRef.current, at);
    },
    [addNote, pasteElements],
  );

  const groupSelected = useCallback(() => {
    const ids = selectedRef.current;
    if (readOnly || ids.length < 2) return;
    const groupId = newId();
    const before = elementsRef.current;
    setElements(before.map((e) => (ids.includes(e.id) ? { ...e, groupId, version: e.version + 1 } : e)));
    commit(before);
  }, [commit, readOnly, setElements]);

  const ungroupSelected = useCallback(() => {
    const ids = selectedRef.current;
    const before = elementsRef.current;
    if (readOnly || !before.some((e) => ids.includes(e.id) && e.groupId)) return;
    setElements(
      before.map((e) => {
        if (!ids.includes(e.id) || !e.groupId) return e;
        const next = { ...e, version: e.version + 1 };
        delete next.groupId;
        return next;
      }),
    );
    commit(before);
  }, [commit, readOnly, setElements]);

  const selectAll = useCallback(() => {
    if (readOnly) return;
    setTool("select");
    setSelected(elementsRef.current.map((e) => e.id));
  }, [readOnly, setSelected, setTool]);

  /** Opens the text box in the middle of a shape (double click). */
  const startLabelEdit = (box: BoxElement) => {
    const b = boundsOf(box);
    setSelected([box.id]);
    setEditing({ id: box.id, x: 0, y: 0, fontSize: labelFontOf(box), color: box.strokeColor, value: box.label ?? "", existing: true, box: { cx: b.x + b.w / 2, cy: b.y + b.h / 2, maxW: labelWidthOf(box) } });
  };

  // ---- pointer ----------------------------------------------------------------------------------------------------------

  const eraseAt = (p: Point) => {
    const tol = 6 / viewRef.current.zoom;
    const keep = elementsRef.current.filter((e) => !hitElement(e, p, tol));
    if (keep.length !== elementsRef.current.length) setElements(keep);
  };

  const topElementAt = (p: Point): BoardElement | undefined => {
    const tol = 6 / viewRef.current.zoom;
    for (let i = elementsRef.current.length - 1; i >= 0; i--) if (hitElement(elementsRef.current[i], p, tol)) return elementsRef.current[i];
    return undefined;
  };

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    cancelAnimationFrame(viewAnimation.current);
    if (editingRef.current) commitText();
    setNodeDetail(null);
    const foldTarget = (event.target as Element).closest?.("[data-mm-toggle]")?.getAttribute("data-mm-toggle");
    if (foldTarget && !readOnly && event.button === 0 && toolRef.current === "select") {
      const [elementId, nodeId] = foldTarget.split("|");
      toggleMindmapNode(elementId, nodeId);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    const nodeRef = (event.target as Element).closest?.("[data-mm-node]")?.getAttribute("data-mm-node");
    clickNode.current = nodeRef && event.button === 0 && !spaceDown.current && (readOnly || toolRef.current === "select") ? { ref: nodeRef, x: event.clientX, y: event.clientY } : null;
    // a click (no drag) on a part of a diagram the AI drew opens its explanation, on pointer up
    const partHit = !nodeRef && event.button === 0 && !spaceDown.current && (readOnly || toolRef.current === "select") ? topElementAt(toScene(event.clientX, event.clientY)) : undefined;
    clickPart.current = partHit?.diagram ? { id: partHit.id, target: partHit.diagram.id, x: event.clientX, y: event.clientY } : null;
    const quizHit = (onOpenQuiz || !student) && !nodeRef && event.button === 0 && !spaceDown.current && (readOnly || toolRef.current === "select" || toolRef.current === "hand") ? (partHit ?? topElementAt(toScene(event.clientX, event.clientY))) : undefined;
    clickQuiz.current = quizHit?.type === "quiz" ? { id: quizHit.id, x: event.clientX, y: event.clientY } : null;
    setPartDetail(null);

    if (pointers.current.size === 2) {
      // a second finger: abandon what the first one started and pinch instead
      const g = gesture.current;
      if (g && "before" in g) setElements(g.before);
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", distance: Math.hypot(a[0] - b[0], a[1] - b[1]), origin: viewRef.current, centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      return;
    }

    const activeTool = toolRef.current;
    // dragging a mindmap card pans the board; a plain click on it still opens its details
    if (event.button === 1 || spaceDown.current || activeTool === "hand" || readOnly || clickNode.current) {
      gesture.current = { kind: "pan", startX: event.clientX, startY: event.clientY, origin: viewRef.current };
      setPanning(true);
      return;
    }
    if (event.button !== 0) return;

    const p = toScene(event.clientX, event.clientY);
    const before = elementsRef.current;
    const handle = (event.target as SVGElement).dataset?.handle as Handle | undefined;

    if (activeTool === "select") {
      const chosen = selectedRef.current.map((id) => before.find((e) => e.id === id)).filter((e): e is BoardElement => Boolean(e));
      const box = boundsOfAll(chosen);
      if (handle && box) {
        gesture.current = { kind: "resize", handle, from: box, originals: chosen, before };
        return;
      }
      const hit = topElementAt(p);
      if (hit) {
        const members = withGroupMembers([hit.id], before); // a group is picked as a whole
        let ids = selectedRef.current;
        if (event.shiftKey) {
          const wasIn = members.every((id) => ids.includes(id));
          ids = wasIn ? ids.filter((id) => !members.includes(id)) : [...new Set([...ids, ...members])];
          setSelected(ids);
          if (wasIn) return;
        } else if (!ids.includes(hit.id)) {
          ids = members;
          setSelected(ids);
        }
        gesture.current = { kind: "move", from: p, originals: before.filter((e) => ids.includes(e.id)), before };
        return;
      }
      const keep = event.shiftKey ? selectedRef.current : [];
      setSelected(keep);
      gesture.current = { kind: "marquee", from: p, keep };
      return;
    }

    if (activeTool === "text") {
      const hit = topElementAt(p);
      const existing = hit?.type === "text" ? hit : undefined;
      setSelected([]);
      setEditing(
        existing
          ? { id: existing.id, x: existing.x, y: existing.y, fontSize: existing.fontSize, color: existing.strokeColor, value: existing.text, existing: true }
          : { id: newId(), x: p[0], y: p[1], fontSize: DEFAULT_FONT_SIZE, color: style.strokeColor, value: "", existing: false },
      );
      event.preventDefault(); // keep the focus for the text box that is about to open
      return;
    }

    if (activeTool === "eraser") {
      gesture.current = { kind: "erase", before };
      eraseAt(p);
      return;
    }

    const id = newId();
    const base = { id, x: p[0], y: p[1], version: 1, ...style };
    if (activeTool === "freedraw") {
      setElements([...before, { ...base, type: "freedraw", points: [[0, 0]] }]);
      gesture.current = { kind: "draw", id, from: p, before };
    } else if (activeTool === "line" || activeTool === "arrow") {
      setElements([...before, { ...base, type: activeTool, points: [[0, 0], [0, 0]] }]);
      gesture.current = { kind: "create", id, from: p, before, tool: activeTool };
    } else if (activeTool === "rectangle" || activeTool === "ellipse" || activeTool === "diamond") {
      setElements([...before, { ...base, type: activeTool, width: 0, height: 0 }]);
      gesture.current = { kind: "create", id, from: p, before, tool: activeTool };
    }
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (live && event.pointerType !== "touch") sync.moveCursor(toScene(event.clientX, event.clientY));
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    const g = gesture.current;
    if (!g) return;

    if (g.kind === "pan") {
      setView({ ...g.origin, x: g.origin.x + event.clientX - g.startX, y: g.origin.y + event.clientY - g.startY });
      return;
    }
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const centre: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const rect = svgRef.current?.getBoundingClientRect();
      const zoom = clampZoom(g.origin.zoom * (distance / (g.distance || 1)));
      const ax = g.centre[0] - (rect?.left ?? 0);
      const ay = g.centre[1] - (rect?.top ?? 0);
      setView({
        zoom,
        x: ax - ((ax - g.origin.x) / g.origin.zoom) * zoom + (centre[0] - g.centre[0]),
        y: ay - ((ay - g.origin.y) / g.origin.zoom) * zoom + (centre[1] - g.centre[1]),
      });
      return;
    }

    const p = toScene(event.clientX, event.clientY);
    const map = (id: string, change: (e: BoardElement) => BoardElement) => setElements(elementsRef.current.map((e) => (e.id === id ? change(e) : e)));

    switch (g.kind) {
      case "create": {
        let dx = p[0] - g.from[0];
        let dy = p[1] - g.from[1];
        if (event.shiftKey) {
          if (g.tool === "line" || g.tool === "arrow") {
            const step = Math.PI / 12; // 15°
            const angle = Math.round(Math.atan2(dy, dx) / step) * step;
            const length = Math.hypot(dx, dy);
            dx = length * Math.cos(angle);
            dy = length * Math.sin(angle);
          } else {
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            dx = Math.sign(dx || 1) * side;
            dy = Math.sign(dy || 1) * side;
          }
        }
        map(g.id, (e) => {
          const version = e.version + 1;
          if (e.type === "line" || e.type === "arrow") return { ...e, points: [[0, 0], [dx, dy]], version };
          if (e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond") return { ...e, width: dx, height: dy, version };
          return e;
        });
        break;
      }
      case "draw": {
        map(g.id, (e) => {
          if (e.type !== "freedraw") return e;
          const last = e.points[e.points.length - 1];
          const next: Point = [p[0] - e.x, p[1] - e.y];
          if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 1.5 / viewRef.current.zoom) return e;
          return { ...e, points: [...e.points, next], version: e.version + 1 };
        });
        break;
      }
      case "move": {
        const moved = new Map(g.originals.map((e) => [e.id, moveElement(e, p[0] - g.from[0], p[1] - g.from[1])]));
        setElements(g.before.map((e) => moved.get(e.id) ?? e));
        break;
      }
      case "resize": {
        let left = g.from.x;
        let top = g.from.y;
        let right = g.from.x + g.from.w;
        let bottom = g.from.y + g.from.h;
        if (g.handle.includes("w")) left = p[0];
        if (g.handle.includes("e")) right = p[0];
        if (g.handle.includes("n")) top = p[1];
        if (g.handle.includes("s")) bottom = p[1];
        const resized = new Map(transformElements(g.originals, g.from, { x: left, y: top, w: right - left, h: bottom - top }).map((e) => [e.id, e]));
        setElements(g.before.map((e) => resized.get(e.id) ?? e));
        break;
      }
      case "marquee": {
        const box: Bounds = { x: Math.min(g.from[0], p[0]), y: Math.min(g.from[1], p[1]), w: Math.abs(p[0] - g.from[0]), h: Math.abs(p[1] - g.from[1]) };
        setMarquee(box);
        const inside = withGroupMembers(
          elementsRef.current.filter((e) => overlaps(box, boundsOf(e))).map((e) => e.id),
          elementsRef.current,
        );
        setSelected([...new Set([...g.keep, ...inside])]);
        break;
      }
      case "erase":
        eraseAt(p);
        break;
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    setPanning(false);
    setMarquee(null);

    // a click (no drag) on a mindmap node opens its details
    const click = clickNode.current;
    clickNode.current = null;
    if (click && (g.kind === "move" || g.kind === "pan") && Math.hypot(event.clientX - click.x, event.clientY - click.y) < 4) {
      const [elementId, nodeId] = click.ref.split("|");
      const last = lastNodeClick.current;
      if (last && last.ref === click.ref && event.timeStamp - last.at < 400 && fullscreen && !readOnly) {
        // a double click asks the AI about the node, as on the materials page
        lastNodeClick.current = null;
        askNode(elementId, nodeId);
      } else {
        lastNodeClick.current = { ref: click.ref, at: event.timeStamp };
        setNodeDetail({ elementId, nodeId });
      }
    }

    const quizClick = clickQuiz.current;
    clickQuiz.current = null;
    if (quizClick && (g.kind === "move" || g.kind === "pan") && Math.hypot(event.clientX - quizClick.x, event.clientY - quizClick.y) < 4) {
      const card = elementsRef.current.find((e): e is QuizElement => e.id === quizClick.id && e.type === "quiz");
      if (card) {
        if (student) onOpenQuiz?.(card);
        else setResultsQuiz(card.quizId);
      }
    }
    const part = clickPart.current;
    clickPart.current = null;
    if (part && (g.kind === "move" || g.kind === "pan") && Math.hypot(event.clientX - part.x, event.clientY - part.y) < 4) {
      const info = diagramPartInfo(elementsRef.current, part.target, part.id);
      if (info) setPartDetail({ target: part.target, element: info.element });
    }

    if (g.kind === "create") {
      const el = elementsRef.current.find((e) => e.id === g.id);
      let tooSmall = !el;
      if (el?.type === "line" || el?.type === "arrow") tooSmall = Math.hypot(el.points[1][0], el.points[1][1]) < 3;
      else if (el && (el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond")) tooSmall = Math.abs(el.width) < 3 && Math.abs(el.height) < 3;
      if (tooSmall) {
        setElements(g.before);
        return;
      }
      commit(g.before);
      setTool("select");
      setSelected([g.id]);
    } else if (g.kind === "draw" || g.kind === "move" || g.kind === "resize" || g.kind === "erase") {
      commit(g.before);
    }
  }

  // ---- keyboard ---------------------------------------------------------------------------------------------------------

  useEffect(() => {
    const visible = () => containerRef.current !== null && containerRef.current.offsetParent !== null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!visible() || isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        spaceDown.current = true;
        event.preventDefault();
        return;
      }
      if (mod && key === "z") {
        event.preventDefault();
        if (!readOnly) (event.shiftKey ? redo : undo)();
      } else if (mod && key === "y") {
        event.preventDefault();
        if (!readOnly) redo();
      } else if (mod && key === "a") {
        event.preventDefault();
        selectAll();
      } else if (mod && key === "g") {
        event.preventDefault(); // also the browser's "find next"
        (event.shiftKey ? ungroupSelected : groupSelected)();
      } else if (mod && key === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (mod && key === "0") {
        event.preventDefault();
        zoomTo(1);
      } else if (!mod && (key === "delete" || key === "backspace")) {
        event.preventDefault();
        deleteSelected();
      } else if (!mod && key === "escape") {
        setSelected([]);
        setNodeDetail(null);
        setPlayback(null);
        setPartDetail(null);
        if (toolRef.current !== "select" && !readOnly) setTool("select");
      } else if (!mod && (key === "+" || key === "=")) {
        zoomTo(viewRef.current.zoom * 1.2);
      } else if (!mod && key === "-") {
        zoomTo(viewRef.current.zoom / 1.2);
      } else if (event.shiftKey && event.code === "Digit1") {
        fit();
      } else if (!mod && key.startsWith("arrow") && selectedRef.current.length > 0 && !readOnly) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        const before = elementsRef.current;
        setElements(before.map((e) => (selectedRef.current.includes(e.id) ? moveElement(e, dx, dy) : e)));
        commit(before);
      } else if (!mod && !readOnly && TOOL_KEYS[key]) {
        setTool(TOOL_KEYS[key]);
      } else if (!mod && readOnly && key === "h") {
        setTool("hand");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [commit, deleteSelected, duplicateSelected, fit, groupSelected, readOnly, redo, selectAll, setElements, setSelected, setTool, undo, ungroupSelected, zoomTo]);

  // Ctrl/⌘ + C, X and V go through the browser's clipboard events: no permission prompt, and they work across tabs
  useEffect(() => {
    if (readOnly) return;
    const visible = () => containerRef.current !== null && containerRef.current.offsetParent !== null;
    const onCopy = (event: ClipboardEvent) => {
      if (!visible() || isTyping(event.target) || selectedRef.current.length === 0) return;
      event.preventDefault();
      const chosen = selectedCopy();
      clipboardRef.current = chosen;
      pasteCount.current = 0;
      event.clipboardData?.setData("text/plain", serializeElements(chosen));
      if (event.type === "cut") deleteSelected();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!visible() || isTyping(event.target)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const parsed = parseClipboard(text);
      if (!parsed && !text.trim() && clipboardRef.current.length === 0) return;
      event.preventDefault();
      if (parsed) pasteElements(parsed);
      else if (text.trim()) addNote(text);
      else pasteElements(clipboardRef.current);
    };
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("paste", onPaste);
    };
  }, [addNote, deleteSelected, pasteElements, readOnly, selectedCopy]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isTyping(event.target)) {
        setFullscreen(false);
        setPanelOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // ---- autosave ---------------------------------------------------------------------------------------------------------

  const flush = useCallback(async () => {
    if (inFlight.current || !pending.current) return;
    const change = pending.current;
    pending.current = null;
    inFlight.current = true;
    setSaveState("saving");
    const result = await saveBoardAction(sessionId, {
      elements: change.elements as unknown as Record<string, unknown>[],
      appState: { viewBackgroundColor: BACKGROUND },
    });
    inFlight.current = false;
    if (result.ok) {
      failures.current = 0;
      lastSaved.current = change.signature;
      if (pending.current) void flushRef.current(); // drawn more while saving: save that too
      else setSaveState("saved");
      return;
    }
    failures.current += 1;
    if (!pending.current) pending.current = change; // keep the unsaved drawing so the retry sends it
    setSaveState("error");
    if (failures.current === 1) toast.error(result.message);
    if (failures.current < 5) timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY_MS * 2 ** failures.current);
  }, [sessionId, toast]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (!saves) return;
    const signature = signatureOf(elements);
    if (signature === lastSaved.current && !pending.current) return; // a pan or a selection does not change the drawing
    pending.current = { elements, signature };
    setSaveState((current) => (current === "saving" ? current : "dirty"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
  }, [elements, saves]);

  // leaving the page (or the tab being hidden) should not lose the last strokes
  useEffect(() => {
    if (!saves) return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && pending.current) void flushRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void flushRef.current();
    };
  }, [saves]);

  // ---- render -----------------------------------------------------------------------------------------------------------

  const selectedElements = elements.filter((e) => selected.includes(e.id));
  const selectionBox = boundsOfAll(selectedElements);
  const handleSize = HANDLE_PX / view.zoom;
  const pad = 4 / view.zoom;
  const showStylePanel = !readOnly && (selected.length > 0 || !["select", "hand", "eraser", "text"].includes(tool));
  const panelStyle: Style = selectedElements[0]
    ? { strokeColor: selectedElements[0].strokeColor, backgroundColor: selectedElements[0].backgroundColor, strokeWidth: selectedElements[0].strokeWidth }
    : style;
  // a click on a diagram the AI drew offers its playback; once playing it stays until closed, whatever is selected
  const livePlayback = playback && elements.some((e) => e.diagram?.id === playback.target) ? playback : null; // its diagram may have been deleted
  const livePart = partDetail && elements.some((e) => e.id === partDetail.element) ? partDetail : null;
  const playTarget = livePlayback?.target ?? (readOnly ? null : diagramOfSelection(selectedElements)) ?? livePart?.target ?? null;
  // only a diagram with code (a flow's pseudocode, a simulation's program) is played; a timeline or comparison just shows
  const playLines = playTarget ? diagramPseudocode(elements, playTarget) : [];
  const playSteps = playTarget && playLines.length > 0 ? diagramSteps(elements, playTarget) : [];
  usePlaybackClock(livePlayback, playSteps, setPlayback);
  const showDiagramPanel = Boolean(playTarget) && playSteps.length > 0;
  const partElement = livePart ? elements.find((e) => e.id === livePart.element) : undefined;
  const partInfo = livePart ? diagramPartInfo(elements, livePart.target, livePart.element, livePart.target === playTarget ? playSteps : undefined) : null;
  const partLines = livePart ? (livePart.target === playTarget ? playLines : diagramPseudocode(elements, livePart.target)) : [];
  const hoverElement = hoverNode && playTarget ? elements.find((e) => e.diagram?.id === playTarget && e.diagram.node === hoverNode && !e.diagram.deco) : undefined;
  const materialRight = fullscreen && panelOpen && !readOnly ? panelPx + 16 : 0;
  // the panel sticks to the right of the diagram (left when there is no room), so the pseudocode reads beside the flow
  // and moves with it; the diagram gets a frame that the panel continues. Without room on either side it docks in a corner.
  const dock = (() => {
    if (!showDiagramPanel || !playTarget) return null;
    const box = boundsOfAll(elements.filter((e) => e.diagram?.id === playTarget));
    if (!box) return null;
    const left = view.x + (box.x - FRAME_PAD) * view.zoom;
    const right = view.x + (box.x + box.w + FRAME_PAD) * view.zoom;
    const top = view.y + (box.y - FRAME_PAD) * view.zoom;
    const side = right + DOCK_W <= size.w - materialRight - 8 ? "right" : left - DOCK_W >= 8 ? "left" : null;
    if (!side) return null;
    const height = Math.max((box.h + FRAME_PAD * 2) * view.zoom, DOCK_MIN_H);
    // the panel stays on screen even when the top of the diagram is scrolled away
    const panelTop = Math.max(64, top);
    const panelHeight = Math.max(260, Math.min(height - (panelTop - top), size.h - panelTop - 12));
    return {
      side,
      x: side === "right" ? right - 1 : left - DOCK_W + 1,
      top: panelTop,
      height: panelHeight,
      frame: { x: box.x - FRAME_PAD, y: box.y - FRAME_PAD, w: box.w + FRAME_PAD * 2, h: height / view.zoom },
    } as const;
  })();
  const changePlayback = (next: Playback | null) => {
    if (next?.playing && !livePlayback?.playing) {
      setSelected([]); // a clean board while the class watches
      setPartDetail(null);
      if (next.step <= 0) focusDiagram(next.target); // starting from the top: the diagram large enough to read
    }
    setPlayback(next);
  };
  const cursor = panning ? "grabbing" : tool === "hand" || readOnly ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";

  return (
    <section
      aria-label="Papan tulis kelas"
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-surface"
          : "flex h-[calc(100dvh-15rem)] min-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-surface"
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <p role="status" className={`text-caption ${saveState === "error" ? "font-semibold text-danger" : "text-muted"}`}>
          {readOnlyProp
            ? "Hanya lihat (sesi sudah berakhir). Geser dan perbesar tetap bisa."
            : student
              ? readOnly
                ? "Guru sedang mengunci papan. Anda tetap bisa melihat, menggeser, dan memperbesar."
                : "Papan bersama: gambar Anda langsung terlihat oleh guru."
              : SAVE_LABEL[saveState]}
        </p>
        <div className="flex items-center gap-2">
          {live && (
            <span
              className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-caption font-semibold ${sync.online ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
              title={sync.online ? "Terhubung langsung dengan kelas" : "Koneksi terputus, perubahan dikirim lagi saat tersambung"}
            >
              {sync.online ? <Radio size={14} strokeWidth={2} aria-hidden="true" /> : <WifiOff size={14} strokeWidth={2} aria-hidden="true" />}
              {sync.online ? "Live" : "Menyambung…"}
              {sync.cursors.length > 0 && <span className="font-normal">· {sync.cursors.length} lain</span>}
            </span>
          )}
          {live && !student && !readOnlyProp && (
            <button
              type="button"
              onClick={() => void sync.setStudentsDraw(!sync.drawAllowed).then((ok) => !ok && toast.error("Gagal mengubah izin menggambar. Coba lagi."))}
              aria-pressed={sync.drawAllowed}
              title={sync.drawAllowed ? "Siswa bisa menggambar di papan. Klik untuk mengunci." : "Hanya Anda yang bisa menggambar. Klik agar siswa bisa ikut menggambar."}
              className={`inline-flex min-h-9 select-none items-center gap-1.5 rounded-md px-3 text-caption font-semibold transition-colors ${
                sync.drawAllowed ? "border border-border text-ink hover:bg-bg" : "bg-warning/15 text-warning"
              }`}
            >
              {sync.drawAllowed ? <PencilLine size={16} strokeWidth={1.75} aria-hidden="true" /> : <Lock size={16} strokeWidth={1.75} aria-hidden="true" />}
              {sync.drawAllowed ? "Siswa boleh menggambar" : "Papan dikunci"}
            </button>
          )}
          {fullscreen && !readOnly && !student && (
            <button
              type="button"
              onClick={() => setPanelOpen((value) => !value)}
              aria-pressed={panelOpen}
              className={`inline-flex min-h-9 select-none items-center gap-1.5 rounded-md px-3 text-caption font-semibold transition-colors ${
                panelOpen ? "bg-primary text-white" : "border border-border text-ink hover:bg-bg"
              }`}
            >
              <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
              Materi
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setFullscreen((value) => !value);
              setPanelOpen(false);
            }}
            aria-pressed={fullscreen}
            className="inline-flex min-h-9 select-none items-center gap-1.5 rounded-md px-3 text-caption font-semibold text-ink transition-colors hover:bg-bg"
          >
            {fullscreen ? <Minimize2 size={16} strokeWidth={1.75} aria-hidden="true" /> : <Maximize2 size={16} strokeWidth={1.75} aria-hidden="true" />}
            {fullscreen ? "Keluar layar penuh" : "Layar penuh"}
            {fullscreen && <kbd className="rounded border border-border bg-bg px-1 text-[10px] font-semibold text-muted">Esc</kbd>}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden" style={{ backgroundColor: BACKGROUND }}>
        <svg
          ref={svgRef}
          role="application"
          aria-label="Kanvas papan tulis"
          className="absolute inset-0 size-full touch-none select-none"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => live && sync.moveCursor(null)}
          onDoubleClick={(event) => {
            if (readOnly || toolRef.current !== "select") return;
            const p = toScene(event.clientX, event.clientY);
            const hit = topElementAt(p);
            if (hit?.type === "text") {
              setEditing({ id: hit.id, x: hit.x, y: hit.y, fontSize: hit.fontSize, color: hit.strokeColor, value: hit.text, existing: true });
            } else if (hit && isBoxElement(hit)) {
              startLabelEdit(hit);
            } else if (!hit) {
              // an empty, unfilled shape is only hit on its outline; its inside counts for a double click
              const inside = [...elementsRef.current].reverse().find((e): e is BoxElement => isBoxElement(e) && overlaps({ x: p[0], y: p[1], w: 0, h: 0 }, boundsOf(e)));
              if (inside) startLabelEdit(inside);
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            const rect = containerRef.current?.getBoundingClientRect();
            if (readOnly || !rect) return;
            const p = toScene(event.clientX, event.clientY);
            const hit = topElementAt(p);
            if (toolRef.current !== "select") setTool("select");
            if (!hit) setSelected([]);
            else if (!selectedRef.current.includes(hit.id)) setSelected(withGroupMembers([hit.id], elementsRef.current));
            setNodeDetail(null);
            setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, scene: p });
          }}
        >
          <defs>
            <pattern id={gridId} width={28 * view.zoom} height={28 * view.zoom} x={view.x} y={view.y} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} fill="#d1d5db" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${gridId})`} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {dock && (
              <path
                d={framePath(dock.frame, 14 / view.zoom, dock.side)}
                fill="#ffffff"
                stroke="#e5e7eb"
                strokeWidth={1 / view.zoom}
                pointerEvents="none"
                style={{ filter: "drop-shadow(0 6px 18px rgb(15 23 42 / 0.10))" }}
              />
            )}
            {elements.map((el) =>
              el.id !== editing?.id ? <ElementView key={el.id} el={el} /> : editing.box && isBoxElement(el) ? <ElementView key={el.id} el={{ ...el, label: undefined }} /> : null,
            )}

            {livePlayback && livePlayback.step >= 0 && playSteps.length > 0 && <DiagramPlayback elements={elements} target={livePlayback.target} steps={playSteps} step={livePlayback.step} />}
            {partElement && !livePlayback?.playing && <FocusRing el={partElement} />}
            {hoverElement && <FocusRing el={hoverElement} dashed />}

            {selectionBox && !readOnly && !livePlayback?.playing && (
              <g>
                <rect
                  x={selectionBox.x - pad}
                  y={selectionBox.y - pad}
                  width={selectionBox.w + pad * 2}
                  height={selectionBox.h + pad * 2}
                  fill="none"
                  stroke="#6d28d9"
                  strokeWidth={1.5 / view.zoom}
                  strokeDasharray={`${6 / view.zoom} ${4 / view.zoom}`}
                  pointerEvents="none"
                />
                {HANDLES.map((h) => (
                  <rect
                    key={h.id}
                    data-handle={h.id}
                    x={selectionBox.x - pad + (selectionBox.w + pad * 2) * h.fx - handleSize / 2}
                    y={selectionBox.y - pad + (selectionBox.h + pad * 2) * h.fy - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    rx={2 / view.zoom}
                    fill="#ffffff"
                    stroke="#6d28d9"
                    strokeWidth={1.5 / view.zoom}
                    style={{ cursor: h.cursor }}
                  />
                ))}
              </g>
            )}

            {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(109,40,217,0.08)" stroke="#6d28d9" strokeWidth={1 / view.zoom} pointerEvents="none" />}
          </g>
        </svg>

        {editing && (
          <textarea
            aria-label="Teks di papan tulis"
            autoFocus
            value={editing.value}
            rows={Math.max(1, (editing.box ? wrapToWidth(editing.value || " ", editing.fontSize, editing.box.maxW) : editing.value.split("\n")).length)}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey || (editing.box && !event.shiftKey)))) {
                event.preventDefault();
                commitText();
              }
              event.stopPropagation();
            }}
            placeholder="Ketik…"
            className="absolute m-0 resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 outline-none ring-1 ring-primary/50"
            style={{
              ...(editing.box
                ? {
                    left: view.x + (editing.box.cx - editing.box.maxW / 2) * view.zoom,
                    top: view.y + (editing.box.cy - (Math.max(1, wrapToWidth(editing.value || " ", editing.fontSize, editing.box.maxW).length) * lineHeightOf(editing.fontSize)) / 2) * view.zoom,
                    width: `${editing.box.maxW * view.zoom}px`,
                    textAlign: "center" as const,
                    whiteSpace: "pre-wrap" as const,
                  }
                : {
                    left: view.x + editing.x * view.zoom,
                    top: view.y + editing.y * view.zoom,
                    width: `${Math.max(measureText(editing.value || "Ketik…", editing.fontSize).w * view.zoom + 24, 80)}px`,
                  }),
              fontSize: editing.fontSize * view.zoom,
              lineHeight: `${lineHeightOf(editing.fontSize) * view.zoom}px`,
              fontFamily: FONT_FAMILY,
              color: editing.color,
            }}
          />
        )}

        {!readOnly && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3" style={fullscreen && panelOpen ? { paddingRight: panelPx + 24 } : undefined}>
            <div className="pointer-events-auto max-w-full">
              <ToolBar tool={tool} onTool={setTool} />
            </div>
          </div>
        )}

        {showStylePanel &&
          (() => {
            const onlyMindmaps = selectedElements.length > 0 && selectedElements.every((e) => e.type === "mindmap");
            const panel = (
              <StylePanel showColors={!onlyMindmaps} style={panelStyle} onStyle={changeStyle} hasSelection={selected.length > 0} onDelete={deleteSelected} onDuplicate={duplicateSelected} />
            );
            if (!onlyMindmaps || !selectionBox) return <div className="absolute left-3 top-20">{panel}</div>;
            // a compact pill right above the mindmap; below it when there is no room under the toolbar
            const above = view.y + (selectionBox.y - pad) * view.zoom - 12;
            const left = view.x + (selectionBox.x + selectionBox.w / 2) * view.zoom;
            const top = above < 72 ? view.y + (selectionBox.y + selectionBox.h + pad) * view.zoom + 12 : above;
            return (
              <div className="absolute z-10" style={{ left, top, transform: above < 72 ? "translateX(-50%)" : "translate(-50%, -100%)" }}>
                {panel}
              </div>
            );
          })()}

        {showDiagramPanel && playTarget && (
          <div
            className={
              dock
                ? "absolute z-10 flex flex-col"
                : "pointer-events-none absolute bottom-3 top-[72px] z-10 flex w-[min(22rem,calc(100%-24px))] flex-col justify-end"
            }
            style={dock ? { left: dock.x, top: dock.top, width: DOCK_W, height: dock.height } : { right: 12 + materialRight }}
          >
            <div className={dock ? "flex h-full min-h-0 flex-col" : "pointer-events-auto flex min-h-0 flex-col"}>
              <DiagramPanel
                attached={dock?.side ?? null}
                title={diagramTitle(elements, playTarget)}
                target={playTarget}
                steps={playSteps}
                lines={playLines}
                playback={livePlayback}
                marked={livePart?.target === playTarget ? (partInfo?.node ?? null) : null}
                onChange={changePlayback}
                onHoverNode={setHoverNode}
                onFocus={() => focusDiagram(playTarget)}
                onClose={() => {
                  setPlayback(null);
                  setPartDetail(null);
                  setHoverNode(null);
                  setSelected([]);
                }}
              />
            </div>
          </div>
        )}

        {livePart && partInfo && partElement && (
          <DiagramPartPopup
            info={partInfo}
            element={partElement}
            lines={partLines}
            view={view}
            area={size}
            reserveRight={dock ? (dock.side === "right" ? size.w - dock.x : materialRight) : materialRight + (showDiagramPanel ? 376 : 0)}
            onGo={(element) => setPartDetail({ target: livePart.target, element })}
            onPlayFrom={partLines.length === 0 ? undefined : (step) => {
              setPartDetail(null);
              setSelected([]);
              focusDiagram(livePart.target);
              setPlayback({ target: livePart.target, step, playing: true, speed: livePlayback?.speed });
            }}
            onClose={() => setPartDetail(null)}
          />
        )}

        {nodeDetail &&
          (() => {
            const mindmap = elements.find((e): e is MindmapElement => e.id === nodeDetail.elementId && e.type === "mindmap");
            return mindmap ? (
              <NodePopup
                element={mindmap}
                nodeId={nodeDetail.nodeId}
                view={view}
                area={size}
                readOnly={readOnly}
                onToggle={toggleMindmapNode}
                onAsk={fullscreen && !readOnly && !student ? askNode : undefined}
                onClose={() => setNodeDetail(null)}
              />
            ) : null;
          })()}

        {contextMenu && !readOnly && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            area={size}
            onClose={() => setContextMenu(null)}
            items={
              [
                { label: "Salin", shortcut: "Ctrl+C", disabled: selected.length === 0, onSelect: copySelected },
                { label: "Potong", shortcut: "Ctrl+X", disabled: selected.length === 0, onSelect: cutSelected },
                { label: "Tempel", shortcut: "Ctrl+V", onSelect: () => void pasteFromMenu(contextMenu.scene) },
                { label: "Gandakan", shortcut: "Ctrl+D", disabled: selected.length === 0, separator: true, onSelect: duplicateSelected },
                { label: "Kelompokkan", shortcut: "Ctrl+G", disabled: selected.length < 2, onSelect: groupSelected },
                { label: "Pisahkan kelompok", shortcut: "Ctrl+Shift+G", disabled: !selectedElements.some((e) => e.groupId), onSelect: ungroupSelected },
                { label: "Pilih semua", shortcut: "Ctrl+A", disabled: elements.length === 0, separator: true, onSelect: selectAll },
                { label: "Hapus", shortcut: "Del", disabled: selected.length === 0, danger: true, onSelect: deleteSelected },
              ] satisfies MenuItem[]
            }
          />
        )}

        {fullscreen && panelOpen && !readOnly && !student && <MaterialPanel material={material} width={panelPx} maxWidth={panelMax} onResize={setPanelWidth} askRequest={askRequest} onAskSent={() => setAskRequest(null)} onAddMindmap={addMindmap} onAddNote={addNote} onAddFlow={addFlow} onAddQuiz={sessionId && !readOnly ? addQuiz : undefined} addingQuiz={openingQuiz} onClose={() => setPanelOpen(false)} />}

        {resultsQuiz && !student && (
          <QuizResultsPanel sessionId={sessionId} quizId={resultsQuiz} channel={live?.channel ?? null} onClosedQuiz={markQuizClosed} onClose={() => setResultsQuiz(null)} />
        )}

        {elements.length === 0 && !editing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6" style={fullscreen && panelOpen && !readOnly ? { paddingRight: panelPx + 24 } : undefined}>
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint text-primary">
                <PencilLine size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p className="text-h3 font-semibold text-ink">{readOnly ? "Papan tulis kosong" : "Papan masih kosong"}</p>
              {!readOnly && (
                <>
                  <p className="text-small text-muted">Pilih alat di atas, lalu seret di kanvas.</p>
                  <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-caption text-muted">
                    <li><kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-semibold text-ink">Spasi</kbd> + seret untuk geser</li>
                    <li><kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-semibold text-ink">Ctrl</kbd> + scroll untuk zoom</li>
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        {live && <LiveCursors cursors={sync.cursors} view={view} />}

        <div className="absolute bottom-3 left-3">
          <ViewBar
            zoom={view.zoom}
            canUndo={!readOnly && history.undo > 0}
            canRedo={!readOnly && history.redo > 0}
            onUndo={undo}
            onRedo={redo}
            onZoomIn={() => zoomTo(view.zoom * 1.2)}
            onZoomOut={() => zoomTo(view.zoom / 1.2)}
            onResetZoom={() => zoomTo(1)}
            onFit={fit}
          />
        </div>
      </div>
    </section>
  );
}
