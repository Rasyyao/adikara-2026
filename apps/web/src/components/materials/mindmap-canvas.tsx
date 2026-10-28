"use client";

import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Rect, Shape, Stage, Text } from "react-konva";
import type Konva from "konva";
import {
  buildChildrenMap,
  cubicBezierPoint,
  getNodePalette,
  layoutMindmap,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  type AnimatedNodeState,
  type LayoutNode,
  type MindmapNodeItem,
  type MindmapPayload,
} from "./mindmap-layout";
import { defaultNodePrompt, isGeneratedPrompt } from "./mindmap-parse";

export { extractMindmapFromContent, replaceMindmapInContent } from "./mindmap-parse";

export type { MindmapNodeItem, MindmapPayload } from "./mindmap-layout";

export function MindmapBoard({
  mindmap: propMindmap,
  onAskNodePrompt,
  onSave,
  fillHeight = false,
}: {
  mindmap: MindmapPayload;
  onAskNodePrompt?: (promptText: string) => void;
  /** Makes the board editable. Resolves true when the edited mindmap was stored. */
  onSave?: (mindmap: MindmapPayload) => Promise<boolean>;
  fillHeight?: boolean;
}) {
  const labelInputId = useId();
  const promptInputId = useId();
  const labelInputRef = useRef<HTMLInputElement>(null);
  // the teacher's unsaved edits; the board shows them instead of the mindmap it was given
  const [edited, setEdited] = useState<MindmapPayload | null>(null);
  const editedRef = useRef<MindmapPayload | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const propSig = useMemo(() => JSON.stringify(propMindmap), [propMindmap]);
  const mindmap = edited ?? propMindmap;
  const isDirty = edited !== null && JSON.stringify(edited) !== propSig;
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

  // A different mindmap was loaded: reset the view. When it is just what the teacher saved, keep the view as it is.
  useEffect(() => {
    const justSaved = editedRef.current !== null && JSON.stringify(editedRef.current) === propSig;
    editedRef.current = null;
    setEdited(null);
    if (justSaved) return;
    setSelectedNodeId(propMindmap.nodes[0]?.id ?? null);
    setCollapsedIds(new Set());
    setManualPositions({});
    animatedMapRef.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propSig]);

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
  const childrenMap = useMemo(() => buildChildrenMap(mindmap.nodes), [mindmap.nodes]);

  // Compute hierarchical tree layout (NotebookLM horizontal left-to-right tree)
  const { layoutNodes, layoutNodeById, activeIds, bounds } = useMemo(() => {
    const { layoutNodes: computedNodes, layoutNodeById: nodeById } = layoutMindmap(mindmap.nodes, collapsedIds, manualPositions);

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
  }, [collapsedIds, manualPositions, mindmap.nodes, selectedNodeId]);

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
  }, [mounted, canvasSize.width, isFullscreen, propSig]);

  const selectedNode = mindmap.nodes.find((n) => n.id === selectedNodeId) ?? null;

  function applyEdit(updater: (current: MindmapPayload) => MindmapPayload) {
    const next = updater(mindmap);
    editedRef.current = next;
    setEdited(next);
  }

  function updateNode(id: string, patch: Partial<Pick<MindmapNodeItem, "label" | "text">>) {
    applyEdit((current) => ({
      ...current,
      nodes: current.nodes.map((n) => {
        if (n.id !== id) return n;
        const next = { ...n, ...patch };
        if (patch.label !== undefined && patch.text === undefined && isGeneratedPrompt(n.text, n.label)) {
          next.text = defaultNodePrompt(patch.label.trim() || "konsep ini");
        }
        return next;
      }),
    }));
  }

  function addNode(parentId: string | null) {
    const id = `n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const label = "Konsep baru";
    applyEdit((current) => ({
      ...current,
      nodes: [...current.nodes, { id, parent_id: parentId, label, text: defaultNodePrompt(label), source: null }],
    }));
    if (parentId) {
      setCollapsedIds((prev) => {
        if (!prev.has(parentId)) return prev;
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }
    setSelectedNodeId(id);
    window.setTimeout(() => {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }, 0);
  }

  function removeNode(id: string) {
    const target = mindmap.nodes.find((n) => n.id === id);
    if (!target || target.parent_id === null) return; // the root stays
    const doomed = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of mindmap.nodes) {
        if (n.parent_id && doomed.has(n.parent_id) && !doomed.has(n.id)) {
          doomed.add(n.id);
          grew = true;
        }
      }
    }
    applyEdit((current) => ({ ...current, nodes: current.nodes.filter((n) => !doomed.has(n.id)) }));
    for (const gone of doomed) delete animatedMapRef.current[gone];
    setSelectedNodeId(target.parent_id);
  }

  function revertEdits() {
    editedRef.current = null;
    setEdited(null);
    setSelectedNodeId(propMindmap.nodes[0]?.id ?? null);
  }

  async function saveEdits() {
    if (!onSave || !edited || saving) return;
    setSaving(true);
    try {
      await onSave({ ...edited, nodes: edited.nodes.map((n) => ({ ...n, label: n.label.trim() || "Konsep", text: n.text.trim() || defaultNodePrompt(n.label.trim() || "konsep ini") })) });
    } finally {
      setSaving(false);
    }
  }

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
          ? "fixed inset-0 z-50 flex flex-col bg-surface"
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
              {editMode
                ? "Mode edit · Pilih node untuk mengubah teks, menambah, atau menghapus cabang"
                : "Geser kanvas · Scroll zoom · Ketuk 2x node untuk jelaskan topik"}
              {isDirty && <span className="ml-1.5 font-semibold text-warning">· Belum disimpan</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onSave && (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
              className={`inline-flex h-8 items-center gap-1 rounded-sm border px-2.5 text-caption font-semibold transition-colors ${
                editMode
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-ink hover:bg-primary-tint hover:text-primary"
              }`}
            >
              <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{editMode ? "Selesai" : "Edit"}</span>
            </button>
          )}
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
                        if (editMode) return; // while editing, a double tap must not send the node to the AI
                        if (isFullscreen) setIsFullscreen(false);
                        onAskNodePrompt?.(node.text);
                      }}
                      onDblTap={(e) => {
                        e.cancelBubble = true;
                        if (editMode) return;
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

      {/* Editor for the selected node */}
      {onSave && editMode && (
        <div className="flex max-h-[48%] shrink-0 flex-col gap-2.5 overflow-y-auto border-t border-border bg-surface p-3">
          {selectedNode ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted">Edit node</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => addNode(selectedNode.id)}
                    className="inline-flex h-8 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-caption font-semibold text-ink transition-colors hover:bg-primary-tint hover:text-primary"
                  >
                    <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                    Tambah cabang
                  </button>
                  <button
                    type="button"
                    onClick={() => addNode(selectedNode.parent_id)}
                    disabled={selectedNode.parent_id === null}
                    className="inline-flex h-8 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-caption font-semibold text-ink transition-colors hover:bg-primary-tint hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                    Tambah sejajar
                  </button>
                  <button
                    type="button"
                    onClick={() => removeNode(selectedNode.id)}
                    disabled={selectedNode.parent_id === null}
                    title={selectedNode.parent_id === null ? "Node utama tidak bisa dihapus" : "Hapus node beserta cabangnya"}
                    className="inline-flex h-8 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-caption font-semibold text-danger transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                    Hapus
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={labelInputId} className="text-caption font-semibold text-ink">
                  Judul node
                </label>
                <input
                  id={labelInputId}
                  ref={labelInputRef}
                  value={selectedNode.label}
                  maxLength={120}
                  onChange={(event) => updateNode(selectedNode.id, { label: event.target.value })}
                  className="min-h-9 rounded-md border border-border bg-bg px-3 text-small text-ink outline-none focus:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={promptInputId} className="text-caption font-semibold text-ink">
                  Perintah ke AI saat node diketuk 2x
                </label>
                <textarea
                  id={promptInputId}
                  value={selectedNode.text}
                  rows={2}
                  maxLength={500}
                  onChange={(event) => updateNode(selectedNode.id, { text: event.target.value })}
                  className="resize-none rounded-md border border-border bg-bg px-3 py-2 text-small text-ink outline-none focus:border-primary"
                />
              </div>
            </>
          ) : (
            <p className="text-small text-muted">Pilih sebuah node pada mindmap untuk mengeditnya.</p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-2.5">
            <button
              type="button"
              onClick={revertEdits}
              disabled={!isDirty || saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-caption font-semibold text-ink transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Undo2 size={14} strokeWidth={1.75} aria-hidden="true" />
              Urungkan
            </button>
            <button
              type="button"
              onClick={() => void saveEdits()}
              disabled={!isDirty || saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-caption font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
              ) : (
                <Save size={14} strokeWidth={1.75} aria-hidden="true" />
              )}
              {saving ? "Menyimpan…" : "Simpan perubahan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
