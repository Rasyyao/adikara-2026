"use client";

import { BookOpen, Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { saveBoardAction } from "@/app/actions/sessions";
import { useToast } from "@/components/ui/toast";
import type { BoardScene } from "@/lib/api/types";
import type { MindmapPayload } from "../materials/mindmap-layout";
import { ElementView } from "./board/element-view";
import { MaterialPanel, PANEL_PX, type BoardMaterialInfo } from "./board/material-panel";
import {
  boundsOf,
  boundsOfAll,
  hitElement,
  lineHeightOf,
  measureText,
  moveElement,
  newId,
  overlaps,
  sanitizeElements,
  transformElements,
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
  type Bounds,
  type MindmapElement,
  type Point,
  type Style,
  type TextElement,
  type Tool,
  type View,
} from "./board/types";

const SAVE_DELAY_MS = 1500;
const HISTORY_LIMIT = 100;
const HANDLE_PX = 10;
const BACKGROUND = "#ffffff";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "Papan kosong. Pilih alat di atas, lalu mulai menggambar.",
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
}

const signatureOf = (elements: BoardElement[]) => elements.map((e) => `${e.id}:${e.version}`).join(",");

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * The class whiteboard: our own canvas editor, modelled on Excalidraw. Shapes, arrows, pen, text and eraser; select, move,
 * resize, duplicate and delete; pan and zoom; undo and redo; autosave a moment after every change.
 * `readOnly` shows the saved drawing (pan and zoom still work) without letting anyone change it.
 */
export function SessionWhiteboard({
  sessionId,
  initial,
  readOnly = false,
  material = null,
}: {
  sessionId: string;
  initial: BoardScene | null;
  readOnly?: boolean;
  /** The material assigned to the session; its panel opens in full screen. */
  material?: BoardMaterialInfo | null;
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
  const [tool, setToolState] = useState<Tool>(readOnly ? "hand" : "select");
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
    const copies = before.filter((e) => selectedRef.current.includes(e.id)).map((e) => ({ ...moveElement(e, 20, 20), id: newId(), version: 1 }));
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
        nodes: payload.nodes.map((n) => ({ id: n.id, parent_id: n.parent_id, label: n.label })),
        collapsed: [],
        scale: 1,
      };
      const box = boundsOf(base);
      const v = viewRef.current;
      const freeWidth = size.w - (panelOpen ? PANEL_PX + 16 : 0); // the panel covers the right edge
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
    [commit, panelOpen, readOnly, setElements, setSelected, setTool, size.h, size.w],
  );

  /** An answer of the AI as a text note in the middle of the free area; the lines are wrapped so a long answer stays readable. */
  const addNote = useCallback(
    (raw: string) => {
      if (readOnly) return;
      const lines = raw
        .split("\n")
        .flatMap((paragraph) => {
          const wrapped: string[] = [];
          let line = "";
          for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (line && (line + " " + word).length > 46) {
              wrapped.push(line);
              line = word;
            } else {
              line = line ? `${line} ${word}` : word;
            }
          }
          wrapped.push(line);
          return wrapped;
        })
        .slice(0, 40);
      const text = lines.join("\n").trim();
      if (!text) return;
      const fontSize = 20;
      const box = measureText(text, fontSize);
      const v = viewRef.current;
      const freeWidth = size.w - (panelOpen ? PANEL_PX + 16 : 0);
      const el: TextElement = {
        id: newId(),
        type: "text",
        x: (freeWidth / 2 - v.x) / v.zoom - box.w / 2,
        y: (size.h / 2 - v.y) / v.zoom - box.h / 2,
        text,
        fontSize,
        ...DEFAULT_STYLE,
        version: 1,
      };
      const before = elementsRef.current;
      setElements([...before, el]);
      commit(before);
      setTool("select");
      setSelected([el.id]);
    },
    [commit, panelOpen, readOnly, setElements, setSelected, setTool, size.h, size.w],
  );

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
    if (editingRef.current) commitText();
    const foldTarget = (event.target as Element).closest?.("[data-mm-toggle]")?.getAttribute("data-mm-toggle");
    if (foldTarget && !readOnly && event.button === 0 && toolRef.current === "select") {
      const [elementId, nodeId] = foldTarget.split("|");
      toggleMindmapNode(elementId, nodeId);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, [event.clientX, event.clientY]);

    if (pointers.current.size === 2) {
      // a second finger: abandon what the first one started and pinch instead
      const g = gesture.current;
      if (g && "before" in g) setElements(g.before);
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", distance: Math.hypot(a[0] - b[0], a[1] - b[1]), origin: viewRef.current, centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      return;
    }

    const activeTool = toolRef.current;
    if (event.button === 1 || spaceDown.current || activeTool === "hand" || readOnly) {
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
        let ids = selectedRef.current;
        if (event.shiftKey) {
          ids = ids.includes(hit.id) ? ids.filter((id) => id !== hit.id) : [...ids, hit.id];
          setSelected(ids);
          if (!ids.includes(hit.id)) return;
        } else if (!ids.includes(hit.id)) {
          ids = [hit.id];
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
        const inside = elementsRef.current.filter((e) => overlaps(box, boundsOf(e))).map((e) => e.id);
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
        if (!readOnly) {
          setTool("select");
          setSelected(elementsRef.current.map((e) => e.id));
        }
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
  }, [commit, deleteSelected, duplicateSelected, fit, readOnly, redo, setElements, setSelected, setTool, undo, zoomTo]);

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
    if (readOnly) return;
    const signature = signatureOf(elements);
    if (signature === lastSaved.current && !pending.current) return; // a pan or a selection does not change the drawing
    pending.current = { elements, signature };
    setSaveState((current) => (current === "saving" ? current : "dirty"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
  }, [elements, readOnly]);

  // leaving the page (or the tab being hidden) should not lose the last strokes
  useEffect(() => {
    if (readOnly) return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && pending.current) void flushRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void flushRef.current();
    };
  }, [readOnly]);

  // ---- render -----------------------------------------------------------------------------------------------------------

  const selectedElements = elements.filter((e) => selected.includes(e.id));
  const selectionBox = boundsOfAll(selectedElements);
  const handleSize = HANDLE_PX / view.zoom;
  const pad = 4 / view.zoom;
  const showStylePanel = !readOnly && (selected.length > 0 || !["select", "hand", "eraser", "text"].includes(tool));
  const panelStyle: Style = selectedElements[0]
    ? { strokeColor: selectedElements[0].strokeColor, backgroundColor: selectedElements[0].backgroundColor, strokeWidth: selectedElements[0].strokeWidth }
    : style;
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
          {readOnly ? "Hanya lihat (sesi sudah berakhir). Geser dan perbesar tetap bisa." : SAVE_LABEL[saveState]}
        </p>
        <div className="flex items-center gap-2">
          {fullscreen && !readOnly && (
            <button
              type="button"
              onClick={() => setPanelOpen((value) => !value)}
              aria-pressed={panelOpen}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-caption font-semibold transition-colors ${
                panelOpen ? "bg-primary text-white" : "text-ink hover:bg-bg"
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
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-caption font-semibold text-ink transition-colors hover:bg-bg"
          >
            {fullscreen ? <Minimize2 size={16} strokeWidth={1.75} aria-hidden="true" /> : <Maximize2 size={16} strokeWidth={1.75} aria-hidden="true" />}
            {fullscreen ? "Keluar layar penuh (Esc)" : "Layar penuh"}
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
          onDoubleClick={(event) => {
            if (readOnly || toolRef.current !== "select") return;
            const hit = topElementAt(toScene(event.clientX, event.clientY));
            if (hit?.type === "text") {
              setEditing({ id: hit.id, x: hit.x, y: hit.y, fontSize: hit.fontSize, color: hit.strokeColor, value: hit.text, existing: true });
            }
          }}
        >
          <defs>
            <pattern id={gridId} width={28 * view.zoom} height={28 * view.zoom} x={view.x} y={view.y} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} fill="#d1d5db" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${gridId})`} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {elements.map((el) => (el.id === editing?.id ? null : <ElementView key={el.id} el={el} />))}

            {selectionBox && !readOnly && (
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
            rows={Math.max(1, editing.value.split("\n").length)}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
                event.preventDefault();
                commitText();
              }
              event.stopPropagation();
            }}
            placeholder="Ketik…"
            className="absolute m-0 resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 outline-none ring-1 ring-primary/50"
            style={{
              left: view.x + editing.x * view.zoom,
              top: view.y + editing.y * view.zoom,
              fontSize: editing.fontSize * view.zoom,
              lineHeight: `${lineHeightOf(editing.fontSize) * view.zoom}px`,
              fontFamily: FONT_FAMILY,
              color: editing.color,
              width: `${Math.max(measureText(editing.value || "Ketik…", editing.fontSize).w * view.zoom + 24, 80)}px`,
            }}
          />
        )}

        {!readOnly && (
          <div className={`pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3 ${fullscreen && panelOpen ? "pr-[25.5rem]" : ""}`}>
            <div className="pointer-events-auto max-w-full">
              <ToolBar tool={tool} onTool={setTool} />
            </div>
          </div>
        )}

        {showStylePanel && (
          <div className="absolute left-3 top-20">
            <StylePanel showColors={!selectedElements.every((e) => e.type === "mindmap") || selectedElements.length === 0} style={panelStyle} onStyle={changeStyle} hasSelection={selected.length > 0} onDelete={deleteSelected} onDuplicate={duplicateSelected} />
          </div>
        )}

        {fullscreen && panelOpen && !readOnly && <MaterialPanel material={material} onAddMindmap={addMindmap} onAddNote={addNote} onClose={() => setPanelOpen(false)} />}

        {elements.length === 0 && !editing && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-body text-muted">
            {readOnly ? "Papan tulis kosong." : "Pilih alat di atas lalu seret di kanvas. Geser: spasi + seret atau scroll. Zoom: Ctrl + scroll."}
          </p>
        )}

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
