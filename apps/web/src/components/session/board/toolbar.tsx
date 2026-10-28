"use client";

import { ArrowUpRight, Circle, Copy, Diamond, Eraser, Hand, Minus, MousePointer2, Pencil, Redo2, Square, Trash2, Type, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { FILL_COLORS, STROKE_COLORS, STROKE_WIDTHS, TOOL_LABELS, type Style, type Tool } from "./types";

const TOOLS: { tool: Tool; key: string; Icon: typeof Square }[] = [
  { tool: "select", key: "V", Icon: MousePointer2 },
  { tool: "hand", key: "H", Icon: Hand },
  { tool: "rectangle", key: "R", Icon: Square },
  { tool: "ellipse", key: "O", Icon: Circle },
  { tool: "diamond", key: "D", Icon: Diamond },
  { tool: "arrow", key: "A", Icon: ArrowUpRight },
  { tool: "line", key: "L", Icon: Minus },
  { tool: "freedraw", key: "P", Icon: Pencil },
  { tool: "text", key: "T", Icon: Type },
  { tool: "eraser", key: "E", Icon: Eraser },
];

const PANEL = "rounded-lg border border-border bg-surface shadow-[var(--shadow-overlay)]";

export function IconButton({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-10 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-primary text-white" : "text-ink hover:bg-bg"
      }`}
    >
      {children}
    </button>
  );
}

/** The row of drawing tools, top centre of the board. */
export function ToolBar({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  return (
    <div role="toolbar" aria-label="Alat papan tulis" className={`${PANEL} flex max-w-full items-center gap-0.5 overflow-x-auto p-1`}>
      {TOOLS.map(({ tool: id, key, Icon }) => (
        <IconButton key={id} label={`${TOOL_LABELS[id]} (${key})`} active={tool === id} onClick={() => onTool(id)}>
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      ))}
    </div>
  );
}

function Swatch({ color, selected, label, onClick }: { color: string; selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`size-7 rounded-md border transition-shadow ${selected ? "ring-2 ring-primary ring-offset-1" : "hover:ring-1 hover:ring-border"} ${
        color === "transparent" ? "border-border bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] bg-[length:10px_10px]" : "border-black/10"
      }`}
      style={color === "transparent" ? undefined : { backgroundColor: color }}
    />
  );
}

/** Colours and line width for the next shape, or for the selected ones. */
export function StylePanel({
  showColors = true,
  style,
  onStyle,
  hasSelection,
  onDelete,
  onDuplicate,
}: {
  /** False when only mindmaps are selected: they have their own colours. */
  showColors?: boolean;
  style: Style;
  onStyle: (patch: Partial<Style>) => void;
  hasSelection: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className={`${PANEL} flex w-44 flex-col gap-3 p-3`}>
      {hasSelection && (
        <div className={`flex gap-1.5 ${showColors ? "border-b border-border pb-3" : ""}`}>
          <IconButton label="Hapus (Delete)" onClick={onDelete}>
            <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <IconButton label="Gandakan (Ctrl+D)" onClick={onDuplicate}>
            <Copy size={18} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>
      )}
      {showColors && (
        <>
      <div>
        <p className="mb-1.5 text-caption font-semibold text-muted">Warna garis</p>
        <div className="flex flex-wrap gap-1.5">
          {STROKE_COLORS.map((c) => (
            <Swatch key={c} color={c} label={`Warna garis ${c}`} selected={style.strokeColor === c} onClick={() => onStyle({ strokeColor: c })} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-caption font-semibold text-muted">Isi</p>
        <div className="flex flex-wrap gap-1.5">
          {FILL_COLORS.map((c) => (
            <Swatch key={c} color={c} label={c === "transparent" ? "Tanpa isi" : `Isi ${c}`} selected={style.backgroundColor === c} onClick={() => onStyle({ backgroundColor: c })} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-caption font-semibold text-muted">Tebal garis</p>
        <div className="flex gap-1.5">
          {STROKE_WIDTHS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={style.strokeWidth === value}
              onClick={() => onStyle({ strokeWidth: value })}
              className={`flex h-8 flex-1 items-center justify-center rounded-md border ${style.strokeWidth === value ? "border-primary bg-primary-tint" : "border-border hover:bg-bg"}`}
            >
              <span className="w-5 rounded-full bg-ink" style={{ height: value }} />
            </button>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

/** Undo, redo and zoom, bottom left. */
export function ViewBar({
  zoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFit,
}: {
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={`${PANEL} flex items-center p-1`}>
        <button type="button" aria-label="Perkecil (-)" title="Perkecil (-)" onClick={onZoomOut} className="flex size-10 items-center justify-center rounded-md text-lg font-semibold hover:bg-bg">
          −
        </button>
        <button type="button" title="Kembali ke 100%" onClick={onResetZoom} className="min-w-14 rounded-md px-1 text-caption font-semibold tabular-nums hover:bg-bg">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label="Perbesar (+)" title="Perbesar (+)" onClick={onZoomIn} className="flex size-10 items-center justify-center rounded-md text-lg font-semibold hover:bg-bg">
          +
        </button>
        <button type="button" title="Tampilkan semua gambar (Shift+1)" onClick={onFit} className="h-10 rounded-md px-2 text-caption font-semibold hover:bg-bg">
          Pas layar
        </button>
      </div>
      <div className={`${PANEL} flex items-center p-1`}>
        <IconButton label="Urungkan (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <IconButton label="Ulangi (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
