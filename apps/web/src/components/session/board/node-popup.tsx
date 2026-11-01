"use client";

import { ChevronsDownUp, ChevronsUpDown, Network, Sparkles, X } from "lucide-react";
import { mindmapLayoutOf } from "./geometry";
import type { MindmapElement, View } from "./types";

const POPUP_W = 288;

/** Details of one mindmap concept, opened by a click on its node: where it sits in the map, its sub-concepts, fold or unfold. */
export function NodePopup({
  element,
  nodeId,
  view,
  area,
  readOnly,
  onToggle,
  onAsk,
  onClose,
}: {
  element: MindmapElement;
  nodeId: string;
  view: View;
  /** Size of the board in pixels, to keep the popup inside it. */
  area: { w: number; h: number };
  readOnly: boolean;
  onToggle: (elementId: string, nodeId: string) => void;
  /** Sends this concept to the AI chat; absent when the board has no AI panel (read only, or not fullscreen). */
  onAsk?: (elementId: string, nodeId: string) => void;
  onClose: () => void;
}) {
  const node = mindmapLayoutOf(element).byId.get(nodeId);
  const data = element.nodes.find((n) => n.id === nodeId);
  if (!node || !data) return null;

  const path: string[] = [];
  for (let current = data, guard = 0; current && guard < 50; guard++) {
    path.unshift(current.label);
    current = element.nodes.find((n) => n.id === current.parent_id) as typeof data;
  }
  const children = element.nodes.filter((n) => n.parent_id === nodeId);
  const folded = element.collapsed.includes(nodeId);

  // below the node, or above it when the bottom of the board is too close
  const nodeLeft = view.x + (element.x + node.x * element.scale) * view.zoom;
  const nodeTop = view.y + (element.y + node.y * element.scale) * view.zoom;
  const nodeBottom = nodeTop + node.height * element.scale * view.zoom;
  const left = Math.min(Math.max(12, nodeLeft), Math.max(12, area.w - POPUP_W - 12));
  const below = nodeBottom + 10;
  const placeAbove = below + 220 > area.h && nodeTop > 240;
  const style = placeAbove ? { left, bottom: area.h - nodeTop + 10 } : { left, top: Math.max(12, below) };

  return (
    <div role="dialog" aria-label={`Detail konsep ${data.label}`} className="absolute z-20 flex max-h-[60%] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-overlay)]" style={{ ...style, width: POPUP_W }}>
      <header className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-muted">
            <Network size={14} strokeWidth={1.75} aria-hidden="true" />
            {node.depth === 0 ? "Topik utama" : `Subtopik tingkat ${node.depth}`}
          </p>
          <h3 className="mt-0.5 break-words text-body font-semibold text-ink">{data.label}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup detail" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink">
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3 text-small">
        {path.length > 1 && (
          <p className="text-caption text-muted">
            <span className="font-semibold">Jalur: </span>
            {path.join(" › ")}
          </p>
        )}
        {children.length > 0 ? (
          <div>
            <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-muted">Sub-konsep ({children.length})</p>
            <ul className="flex flex-col gap-1">
              {children.map((child) => (
                <li key={child.id} className="rounded-md bg-bg px-2.5 py-1.5 text-ink">
                  {child.label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted">Konsep ini tidak punya sub-konsep.</p>
        )}
        {onAsk && (
          <button
            type="button"
            onClick={() => onAsk(element.id, nodeId)}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-caption font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" />
            Tanya AI tentang konsep ini
          </button>
        )}
        {children.length > 0 && !readOnly && (
          <button
            type="button"
            onClick={() => onToggle(element.id, nodeId)}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-caption font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
          >
            {folded ? <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden="true" /> : <ChevronsDownUp size={14} strokeWidth={1.75} aria-hidden="true" />}
            {folded ? "Buka cabang" : "Lipat cabang"}
          </button>
        )}
      </div>
    </div>
  );
}
