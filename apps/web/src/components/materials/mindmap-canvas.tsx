"use client";

import {
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Network,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Rect, Shape, Stage, Text } from "react-konva";
import type Konva from "konva";

export interface MindmapNodeItem {
  id: string;
  parent_id: string | null;
  label: string;
  text: string;
  source?: string | null;
}

export interface MindmapPayload {
  title: string;
  nodes: MindmapNodeItem[];
}

interface LayoutNode extends MindmapNodeItem {
  depth: number;
  branchIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  childCount: number;
  isCollapsed: boolean;
}

interface AnimatedNodeState {
  x: number;
  y: number;
  opacity: number;
  scale: number;
}

const ROOT_PALETTE = {
  bg: "#1F1B2E",
  selectedBg: "#3B0764",
  text: "#FFFFFF",
  badgeBg: "#6D28D9",
  line: "#6D28D9",
};

const BRANCH_PALETTES = [
  // Royal Violet (--primary #6d28d9)
  { l1: "#6D28D9", l2: "#7C3AED", selected: "#5B21B6", badge: "#4C1D95", line: "#7C3AED" },
  // Deep Indigo
  { l1: "#4338CA", l2: "#4F46E5", selected: "#3730A3", badge: "#312E81", line: "#4F46E5" },
  // Orchid Amethyst
  { l1: "#9333EA", l2: "#A855F7", selected: "#7E22CE", badge: "#581C87", line: "#9333EA" },
  // Teal Emerald (--success harmony)
  { l1: "#0F766E", l2: "#0D9488", selected: "#115E59", badge: "#134E4A", line: "#0D9488" },
  // Berry Plum
  { l1: "#A21CAF", l2: "#C026D3", selected: "#86198F", badge: "#701A75", line: "#C026D3" },
  // Warm Amber (--warning #b45309)
  { l1: "#B45309", l2: "#D97706", selected: "#92400E", badge: "#78350F", line: "#D97706" },
];

function getNodePalette(depth: number, branchIndex: number) {
  if (depth === 0) return ROOT_PALETTE;
  const branch = BRANCH_PALETTES[Math.abs(branchIndex) % BRANCH_PALETTES.length];
  return {
    bg: depth === 1 ? branch.l1 : branch.l2,
    selectedBg: branch.selected,
    text: "#FFFFFF",
    badgeBg: branch.badge,
    line: branch.line,
  };
}

const HORIZONTAL_GAP = 104;
const VERTICAL_GAP = 22;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 12;

function measureNodeBox(label: string, depth: number): { width: number; height: number } {
  const maxWidth = depth === 0 ? 235 : depth === 1 ? 215 : 225;
  const minWidth = depth === 0 ? 175 : 148;
  const charWidth = depth === 0 ? 8.2 : 7.4;
  const estimatedSingleLine = Math.ceil(label.length * charWidth) + NODE_PADDING_X * 2 + 24;
  const width = Math.max(minWidth, Math.min(maxWidth, estimatedSingleLine));
  const innerTextWidth = width - NODE_PADDING_X * 2 - 18;
  const lines = Math.max(1, Math.ceil((label.length * charWidth) / Math.max(80, innerTextWidth)));
  const lineHeight = depth === 0 ? 20 : 18;
  const height = Math.max(46, lines * lineHeight + NODE_PADDING_Y * 2);
  return { width, height };
}

function cubicBezierPoint(
  t: number,
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
): { x: number; y: number } {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0x + 3 * uu * t * p1x + 3 * u * tt * p2x + ttt * p3x,
    y: uuu * p0y + 3 * uu * t * p1y + 3 * u * tt * p2y + ttt * p3y,
  };
}

/**
 * Parses either a JSON mindmap payload (`{ title, nodes }`) OR an ASCII/markdown tree
 * into a normalized `MindmapPayload`. Returns `null` if the content is not a mindmap.
 */
export function extractMindmapFromContent(content: string): {
  mindmap: MindmapPayload;
  introText: string;
  outroText: string;
} | null {
  const codeBlockRegex = /```(?:mindmap|json)\s*([\s\S]*?)```/i;
  const match = codeBlockRegex.exec(content);
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        const before = content.slice(0, match.index).trim();
        const after = content.slice(match.index + match[0].length).trim();
        return {
          mindmap: normalizeMindmapObject(parsed),
          introText: before,
          outroText: after,
        };
      }
    } catch {
      // fall through
    }
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        return {
          mindmap: normalizeMindmapObject(parsed),
          introText: "",
          outroText: "",
        };
      }
    } catch {
      // fall through
    }
  }

  if (/[├└]──/.test(content)) {
    const parsedAscii = parseAsciiTreeMindmap(content);
    if (parsedAscii) return parsedAscii;
  }

  return null;
}

function normalizeMindmapObject(raw: Record<string, unknown>): MindmapPayload {
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Mindmap Materi";
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes: MindmapNodeItem[] = [];

  rawNodes.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const obj = item as Record<string, unknown>;
    const dataObj = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {};
    const id = String(obj.id ?? `n${idx + 1}`).trim();
    const rawParent = obj.parent_id ?? obj.parentId ?? null;
    const parent_id = rawParent ? String(rawParent).trim() : null;
    const label = String(obj.label ?? dataObj.label ?? `Konsep ${idx + 1}`).trim();
    const text = String(
      obj.text ??
        obj.prompt ??
        dataObj.text ??
        dataObj.prompt ??
        `Tolong jelaskan secara mendalam mengenai "${label}" berdasarkan materi ini.`,
    ).trim();
    const source = obj.source || dataObj.source ? String(obj.source ?? dataObj.source).trim() : null;
    nodes.push({ id, parent_id, label, text, source });
  });

  return { title, nodes };
}

function parseAsciiTreeMindmap(content: string): {
  mindmap: MindmapPayload;
  introText: string;
  outroText: string;
} | null {
  const titleMatch = /^#{1,4}\s*(?:🧠\s*)?(.+)$/m.exec(content);
  const title = titleMatch
    ? titleMatch[1].replace(/\*\*+/g, "").replace(/^MINDMAP MATERI:\s*/i, "").trim()
    : "Mindmap Materi";

  const lines = content.split("\n");
  const treeLines = lines.filter((line) => /[├└]──/.test(line));
  if (treeLines.length < 2) return null;

  const nodes: MindmapNodeItem[] = [
    {
      id: "root",
      parent_id: null,
      label: title,
      text: `Tolong jelaskan gambaran umum secara menyeluruh mengenai ${title}.`,
      source: "Materi utama",
    },
  ];

  const parentStack: Array<{ indent: number; id: string; label: string }> = [{ indent: -1, id: "root", label: title }];

  treeLines.forEach((line, idx) => {
    const branchMatch = /^([\s│]*)[├└]──\s*(.+)$/.exec(line);
    if (!branchMatch) return;
    const indent = branchMatch[1].length;
    const cleanLabel = branchMatch[2].replace(/\*\*+/g, "").trim();
    if (!cleanLabel) return;

    while (parentStack.length > 1 && parentStack[parentStack.length - 1].indent >= indent) {
      parentStack.pop();
    }

    const parent = parentStack[parentStack.length - 1];
    const id = `ascii-${idx + 1}`;
    nodes.push({
      id,
      parent_id: parent.id,
      label: cleanLabel,
      text: `Tolong jelaskan lebih detail mengenai "${cleanLabel}" pada bagian "${parent.label}" beserta contohnya.`,
      source: null,
    });
    parentStack.push({ indent, id, label: cleanLabel });
  });

  if (nodes.length <= 1) return null;

  return {
    mindmap: { title, nodes },
    introText: "",
    outroText: "",
  };
}

export function MindmapBoard({
  mindmap,
  onAskNodePrompt,
  fillHeight = false,
}: {
  mindmap: MindmapPayload;
  onAskNodePrompt?: (promptText: string) => void;
  fillHeight?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  const [mounted, setMounted] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 520 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(mindmap.nodes[0]?.id ?? null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Target & animated stage camera state
  const [stageView, setStageView] = useState({ x: 36, y: 36, scale: 0.88 });
  const stageTargetRef = useRef<{ x: number; y: number; scale: number } | null>(null);

  // Animated node positions & pulse phase for smooth 60fps transitions
  const animatedMapRef = useRef<Record<string, AnimatedNodeState>>({});
  const [, setAnimTick] = useState(0);
  const pulsePhaseRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset selection when a new mindmap is loaded
  useEffect(() => {
    setSelectedNodeId(mindmap.nodes[0]?.id ?? null);
    setCollapsedIds(new Set());
    setManualPositions({});
    animatedMapRef.current = {};
  }, [mindmap]);

  // Measure container size responsively
  useEffect(() => {
    if (!mounted) return;
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted, isFullscreen, fillHeight]);

  // Build parent -> children map
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, MindmapNodeItem[]>();
    const validIds = new Set(mindmap.nodes.map((n) => n.id));
    for (const node of mindmap.nodes) {
      const pid = node.parent_id && validIds.has(node.parent_id) ? node.parent_id : null;
      const list = map.get(pid) ?? [];
      list.push(node);
      map.set(pid, list);
    }
    return map;
  }, [mindmap.nodes]);

  // Compute hierarchical tree layout (NotebookLM horizontal left-to-right tree)
  const { layoutNodes, layoutNodeById, activeIds, bounds } = useMemo(() => {
    const roots = childrenMap.get(null) ?? (mindmap.nodes[0] ? [mindmap.nodes[0]] : []);
    const computedNodes: LayoutNode[] = [];
    const nodeById = new Map<string, LayoutNode>();

    const colWidths = new Map<number, number>();
    const visitMeasure = (node: MindmapNodeItem, depth: number) => {
      const box = measureNodeBox(node.label, depth);
      colWidths.set(depth, Math.max(colWidths.get(depth) ?? 0, box.width));
      if (collapsedIds.has(node.id)) return;
      const kids = childrenMap.get(node.id) ?? [];
      for (const kid of kids) visitMeasure(kid, depth + 1);
    };
    for (const r of roots) visitMeasure(r, 0);

    const colX = new Map<number, number>();
    let runningX = 0;
    for (let d = 0; d <= 10; d++) {
      colX.set(d, runningX);
      runningX += (colWidths.get(d) ?? 200) + HORIZONTAL_GAP;
    }

    let leafCursorY = 0;

    const placeSubtree = (node: MindmapNodeItem, depth: number, branchIndex: number): LayoutNode => {
      const box = measureNodeBox(node.label, depth);
      const kids = childrenMap.get(node.id) ?? [];
      const isCollapsed = collapsedIds.has(node.id);
      const x = colX.get(depth) ?? depth * (210 + HORIZONTAL_GAP);

      let y = 0;
      if (kids.length === 0 || isCollapsed) {
        y = leafCursorY;
        leafCursorY += box.height + VERTICAL_GAP;
      } else {
        const placedKids = kids.map((k, idx) =>
          placeSubtree(k, depth + 1, depth === 0 ? idx : branchIndex),
        );
        const firstKid = placedKids[0];
        const lastKid = placedKids[placedKids.length - 1];
        const subtreeCenter = (firstKid.y + lastKid.y + lastKid.height) / 2;
        y = subtreeCenter - box.height / 2;
      }

      const manual = manualPositions[node.id];
      const layoutNode: LayoutNode = {
        ...node,
        depth,
        branchIndex,
        x: manual ? manual.x : x,
        y: manual ? manual.y : y,
        width: box.width,
        height: box.height,
        childCount: kids.length,
        isCollapsed,
      };
      computedNodes.push(layoutNode);
      nodeById.set(node.id, layoutNode);
      return layoutNode;
    };

    roots.forEach((r, idx) => {
      placeSubtree(r, 0, idx);
    });

    const activeSet = new Set<string>();
    let cursor = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
    while (cursor) {
      activeSet.add(cursor.id);
      cursor = cursor.parent_id ? nodeById.get(cursor.parent_id) : undefined;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of computedNodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width + 32);
      maxY = Math.max(maxY, n.y + n.height);
    }

    return {
      layoutNodes: computedNodes,
      layoutNodeById: nodeById,
      activeIds: activeSet,
      bounds: {
        minX: Number.isFinite(minX) ? minX : 0,
        minY: Number.isFinite(minY) ? minY : 0,
        width: Number.isFinite(maxX - minX) ? Math.max(200, maxX - minX) : 600,
        height: Number.isFinite(maxY - minY) ? Math.max(160, maxY - minY) : 400,
      },
    };
  }, [childrenMap, collapsedIds, manualPositions, mindmap.nodes, selectedNodeId]);

  // 60fps animation loop: interpolates node positions (expand/collapse/layout) + camera pan/zoom + flowing edge particles
  useEffect(() => {
    if (!mounted) return;
    let rafId = 0;

    const step = () => {
      pulsePhaseRef.current = (pulsePhaseRef.current + 0.012) % 1;
      const map = animatedMapRef.current;

      for (const node of layoutNodes) {
        const current = map[node.id];
        if (!current) {
          // Spawn new/expanded node at its parent's current coordinates so it fans out smoothly!
          const parentState =
            (node.parent_id && map[node.parent_id]) ||
            (node.parent_id && layoutNodeById.get(node.parent_id)) ||
            null;
          map[node.id] = {
            x: parentState ? parentState.x + 40 : node.x - 24,
            y: parentState ? parentState.y : node.y,
            opacity: 0.15,
            scale: 0.86,
          };
        } else if (draggingNodeId === node.id) {
          current.x = node.x;
          current.y = node.y;
          current.opacity = 1;
          current.scale = 1.03;
        } else {
          const targetScale = hoveredNodeId === node.id ? 1.03 : selectedNodeId === node.id ? 1.015 : 1;
          current.x += (node.x - current.x) * 0.22;
          current.y += (node.y - current.y) * 0.22;
          current.opacity += (1 - current.opacity) * 0.2;
          current.scale += (targetScale - current.scale) * 0.24;
        }
      }

      // Smoothly animate stage camera if a target camera view is active
      const camTarget = stageTargetRef.current;
      if (camTarget) {
        setStageView((prev) => {
          const dx = camTarget.x - prev.x;
          const dy = camTarget.y - prev.y;
          const ds = camTarget.scale - prev.scale;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(ds) < 0.003) {
            stageTargetRef.current = null;
            return camTarget;
          }
          return {
            x: prev.x + dx * 0.22,
            y: prev.y + dy * 0.22,
            scale: prev.scale + ds * 0.22,
          };
        });
      }

      setAnimTick((t) => (t + 1) % 1000000);
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [mounted, layoutNodes, layoutNodeById, draggingNodeId, hoveredNodeId, selectedNodeId]);

  const animateCameraTo = useCallback((next: { x: number; y: number; scale: number }) => {
    stageTargetRef.current = next;
  }, []);

  const fitToScreen = useCallback(() => {
    setManualPositions({});
    const pad = 48;
    const availW = Math.max(260, canvasSize.width - pad * 2);
    const availH = Math.max(220, canvasSize.height - pad * 2);
    const scaleX = availW / bounds.width;
    const scaleY = availH / bounds.height;
    const nextScale = Math.max(0.42, Math.min(1.02, Math.min(scaleX, scaleY)));
    const offsetX = Math.round((canvasSize.width - bounds.width * nextScale) / 2 - bounds.minX * nextScale);
    const offsetY = Math.round((canvasSize.height - bounds.height * nextScale) / 2 - bounds.minY * nextScale);
    animateCameraTo({ x: offsetX, y: offsetY, scale: nextScale });
  }, [animateCameraTo, bounds.height, bounds.minX, bounds.minY, bounds.width, canvasSize.height, canvasSize.width]);

  // Center tree on initial mount or container resize
  useEffect(() => {
    if (!mounted) return;
    fitToScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, canvasSize.width, isFullscreen, mindmap]);

  function toggleCollapse(nodeId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        // Delete cached child positions so newly expanded children fan out from the parent!
        const kids = childrenMap.get(nodeId) ?? [];
        for (const kid of kids) {
          delete animatedMapRef.current[kid.id];
        }
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  function expandAll() {
    setCollapsedIds(new Set());
  }

  function collapseBranches() {
    const next = new Set<string>();
    for (const node of mindmap.nodes) {
      if (node.parent_id !== null && (childrenMap.get(node.id)?.length ?? 0) > 0) {
        next.add(node.id);
      }
    }
    setCollapsedIds(next);
  }

  function adjustZoom(delta: number) {
    const base = stageTargetRef.current ?? stageView;
    const nextScale = Math.max(0.35, Math.min(2.2, Number((base.scale + delta).toFixed(2))));
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const pointX = (centerX - base.x) / base.scale;
    const pointY = (centerY - base.y) / base.scale;
    animateCameraTo({
      scale: nextScale,
      x: centerX - pointX * nextScale,
      y: centerY - pointY * nextScale,
    });
  }

  function focusOnNode(node: LayoutNode) {
    setSelectedNodeId(node.id);
    const anim = animatedMapRef.current[node.id] ?? { x: node.x, y: node.y };
    const nextScale = Math.max(stageView.scale, 0.85);
    const targetX = Math.round(canvasSize.width / 2 - (anim.x + node.width / 2) * nextScale);
    const targetY = Math.round(canvasSize.height / 2 - (anim.y + node.height / 2) * nextScale);
    animateCameraTo({ x: targetX, y: targetY, scale: nextScale });
  }

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    stageTargetRef.current = null;
    const scaleBy = 1.08;
    const oldScale = stageView.scale;
    const newScale =
      event.evt.deltaY < 0
        ? Math.min(2.2, oldScale * scaleBy)
        : Math.max(0.35, oldScale / scaleBy);

    const mousePointTo = {
      x: (pointer.x - stageView.x) / oldScale,
      y: (pointer.y - stageView.y) / oldScale,
    };

    setStageView({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-surface p-4 sm:p-6"
          : fillHeight
            ? "flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface"
            : "flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface"
      }
    >
      {/* Top interactive board toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-bg px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-white">
            <Network size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-small font-semibold text-ink">{mindmap.title}</p>
            <p className="text-caption text-muted">
              Geser kanvas · Scroll zoom · Ketuk 2x node untuk jelaskan topik
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={expandAll}
            className="inline-flex h-8 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-caption font-semibold text-ink transition-colors hover:bg-primary-tint hover:text-primary"
          >
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Buka Semua</span>
          </button>
          <button
            type="button"
            onClick={collapseBranches}
            className="inline-flex h-8 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-caption font-semibold text-ink transition-colors hover:bg-primary-tint hover:text-primary"
          >
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Ringkas</span>
          </button>
          <button
            type="button"
            onClick={() => adjustZoom(-0.15)}
            aria-label="Perkecil mindmap"
            className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-ink transition-colors hover:bg-primary-tint hover:text-primary"
          >
            <ZoomOut size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span className="min-w-11 text-center font-mono text-caption font-semibold text-muted">
            {Math.round(stageView.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => adjustZoom(0.15)}
            aria-label="Perbesar mindmap"
            className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-ink transition-colors hover:bg-primary-tint hover:text-primary"
          >
            <ZoomIn size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={fitToScreen}
            title="Reset tampilan ke tengah"
            aria-label="Reset tampilan ke tengah"
            className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-ink transition-colors hover:bg-primary-tint hover:text-primary"
          >
            <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? "Keluar layar penuh" : "Buka layar penuh"}
            aria-label={isFullscreen ? "Keluar layar penuh" : "Buka layar penuh"}
            className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-ink transition-colors hover:bg-primary-tint hover:text-primary"
          >
            {isFullscreen ? (
              <Minimize2 size={15} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Maximize2 size={15} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Interactive Konva Board Area */}
      <div
        ref={containerRef}
        className={`relative w-full cursor-grab active:cursor-grabbing ${
          isFullscreen || fillHeight ? "min-h-0 flex-1" : "h-[460px] sm:h-[520px]"
        }`}
        style={{
          backgroundImage: "radial-gradient(#CBD5E1 1.2px, transparent 1.2px)",
          backgroundSize: "20px 20px",
          backgroundColor: "#F8FAFC",
        }}
      >
        {mounted && (
          <Stage
            ref={stageRef}
            width={canvasSize.width}
            height={canvasSize.height}
            draggable
            x={stageView.x}
            y={stageView.y}
            scaleX={stageView.scale}
            scaleY={stageView.scale}
            onWheel={handleWheel}
            onDragStart={(e) => {
              if (e.target === e.target.getStage()) {
                stageTargetRef.current = null;
              }
            }}
            onDragMove={(e) => {
              if (e.target === e.target.getStage()) {
                setStageView((prev) => ({
                  ...prev,
                  x: e.target.x(),
                  y: e.target.y(),
                }));
              }
            }}
          >
            <Layer>
              {/* Smooth NotebookLM-style cubic Bézier connectors + animated flowing pulse */}
              {layoutNodes.map((toNode, edgeIdx) => {
                if (!toNode.parent_id || !layoutNodeById.has(toNode.parent_id)) return null;
                const fromNode = layoutNodeById.get(toNode.parent_id)!;
                const fromAnim = animatedMapRef.current[fromNode.id] ?? {
                  x: fromNode.x,
                  y: fromNode.y,
                  opacity: 1,
                };
                const toAnim = animatedMapRef.current[toNode.id] ?? {
                  x: toNode.x,
                  y: toNode.y,
                  opacity: 1,
                };

                const startX = fromAnim.x + fromNode.width + 14;
                const startY = fromAnim.y + fromNode.height / 2;
                const endX = toAnim.x;
                const endY = toAnim.y + toNode.height / 2;
                const ctrlOffset = Math.max(40, Math.abs(endX - startX) * 0.5);

                const p1x = startX + ctrlOffset;
                const p1y = startY;
                const p2x = endX - ctrlOffset;
                const p2y = endY;

                const isActive = activeIds.has(fromNode.id) && activeIds.has(toNode.id);
                const toPalette = getNodePalette(toNode.depth, toNode.branchIndex);
                const t = (pulsePhaseRef.current + edgeIdx * 0.17) % 1;
                const pulsePt = cubicBezierPoint(t, startX, startY, p1x, p1y, p2x, p2y, endX, endY);

                return (
                  <Group key={`edge-${fromNode.id}-${toNode.id}`} opacity={Math.min(fromAnim.opacity, toAnim.opacity)}>
                    <Shape
                      sceneFunc={(ctx, shape) => {
                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.bezierCurveTo(p1x, p1y, p2x, p2y, endX, endY);
                        ctx.fillStrokeShape(shape);
                      }}
                      stroke={toPalette.line}
                      strokeWidth={isActive ? 2.8 : 2}
                      opacity={isActive ? 1 : 0.65}
                      lineCap="round"
                    />
                    {/* Animated flowing particle along the connector curve */}
                    <Circle
                      x={pulsePt.x}
                      y={pulsePt.y}
                      radius={isActive ? 4.2 : 3}
                      fill={toPalette.line}
                      opacity={isActive ? 1 : 0.75}
                    />
                  </Group>
                );
              })}

              {/* Interactive Draggable & Animated Mindmap Nodes */}
              {layoutNodes.map((node) => {
                const palette = getNodePalette(node.depth, node.branchIndex);
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const anim = animatedMapRef.current[node.id] ?? {
                  x: node.x,
                  y: node.y,
                  opacity: 1,
                  scale: 1,
                };

                return (
                  <Group
                    key={node.id}
                    x={anim.x}
                    y={anim.y}
                    opacity={anim.opacity}
                    scaleX={anim.scale}
                    scaleY={anim.scale}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true;
                      setDraggingNodeId(node.id);
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true;
                      const pos = e.target.position();
                      animatedMapRef.current[node.id] = {
                        x: pos.x,
                        y: pos.y,
                        opacity: 1,
                        scale: 1.03,
                      };
                      setManualPositions((prev) => ({
                        ...prev,
                        [node.id]: { x: pos.x, y: pos.y },
                      }));
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true;
                      setDraggingNodeId(null);
                    }}
                    onMouseEnter={(e) => {
                      setHoveredNodeId(node.id);
                      const container = e.target.getStage()?.container();
                      if (container) container.style.cursor = "pointer";
                    }}
                    onMouseLeave={(e) => {
                      setHoveredNodeId((prev) => (prev === node.id ? null : prev));
                      const container = e.target.getStage()?.container();
                      if (container) container.style.cursor = "grab";
                    }}
                  >
                    {/* Main Solid Node Card (Single click focuses, Double click/tap sends prompt to AI) */}
                    <Group
                      onClick={(e) => {
                        e.cancelBubble = true;
                        focusOnNode(node);
                      }}
                      onTap={(e) => {
                        e.cancelBubble = true;
                        focusOnNode(node);
                      }}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        if (isFullscreen) setIsFullscreen(false);
                        onAskNodePrompt?.(node.text);
                      }}
                      onDblTap={(e) => {
                        e.cancelBubble = true;
                        if (isFullscreen) setIsFullscreen(false);
                        onAskNodePrompt?.(node.text);
                      }}
                    >
                      <Rect
                        width={node.width}
                        height={node.height}
                        cornerRadius={10}
                        fill={isSelected ? palette.selectedBg : palette.bg}
                        shadowColor="#0F172A"
                        shadowBlur={isSelected || isHovered ? 14 : 6}
                        shadowOpacity={isSelected || isHovered ? 0.18 : 0.08}
                        shadowOffsetY={3}
                      />
                      <Text
                        x={NODE_PADDING_X}
                        y={NODE_PADDING_Y}
                        width={node.width - NODE_PADDING_X * 2}
                        height={node.height - NODE_PADDING_Y * 2}
                        text={node.label}
                        fontSize={node.depth === 0 ? 14 : 13}
                        fontStyle={node.depth <= 1 ? "bold" : "normal"}
                        fontFamily="Plus Jakarta Sans, Inter, system-ui, sans-serif"
                        fill={palette.text}
                        verticalAlign="middle"
                        lineHeight={1.28}
                        wrap="word"
                      />
                    </Group>

                    {/* Solid Expand / Collapse Child Branch Button */}
                    {node.childCount > 0 && (
                      <Group
                        x={node.width + 14}
                        y={node.height / 2}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          toggleCollapse(node.id);
                        }}
                        onTap={(e) => {
                          e.cancelBubble = true;
                          toggleCollapse(node.id);
                        }}
                      >
                        <Circle
                          radius={12}
                          fill={node.isCollapsed ? palette.badgeBg : "#1F1B2E"}
                        />
                        <Text
                          x={-12}
                          y={-6}
                          width={24}
                          height={14}
                          align="center"
                          text={node.isCollapsed ? `+${node.childCount}` : "−"}
                          fontSize={11}
                          fontStyle="bold"
                          fontFamily="Inter, system-ui, sans-serif"
                          fill="#FFFFFF"
                        />
                      </Group>
                    )}
                  </Group>
                );
              })}
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
}
