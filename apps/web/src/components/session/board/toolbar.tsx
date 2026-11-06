"use client";

import { ArrowUpRight, Circle, Copy, Diamond, Eraser, Hand, Minus, MousePointer2, Pencil, Redo2, Square, Trash2, Type, Undo2 } from "lucide-react";
import { Fragment, type ReactNode } from "react";
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

/** Tool ids where a divider is drawn before the tool, so the row reads as groups. */
const GROUP_START = new Set<Tool>(["rectangle", "arrow", "text"]);

const PANEL = "rounded-xl border border-border bg-surface/95 backdrop-blur-sm shadow-[var(--shadow-overlay)]";

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
      className={`relative flex size-8 shrink-0 select-none items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:size-10 ${
        active ? "bg-primary text-white shadow-sm" : "text-ink hover:bg-bg"
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
        <Fragment key={id}>
          {GROUP_START.has(id) && <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-border sm:mx-1" />}
          <IconButton label={`${TOOL_LABELS[id]} (${key})`} active={tool === id} onClick={() => onTool(id)}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span aria-hidden="true" className={`pointer-events-none absolute bottom-0.5 right-1 text-[9px] font-semibold leading-none ${tool === id ? "text-white/70" : "text-muted/70"}`}>
              {key}
            </span>
          </IconButton>
        </Fragment>
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
  if (!showColors) {
    return (
      <div className={`${PANEL} flex gap-0.5 p-1`}>
        <IconButton label="Hapus (Delete)" onClick={onDelete}>
          <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <IconButton label="Gandakan (Ctrl+D)" onClick={onDuplicate}>
          <Copy size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>
    );
  }
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
    <div className={`${PANEL} flex select-none items-center p-1`}>
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
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
      <IconButton label="Urungkan (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
        <Undo2 size={18} strokeWidth={1.75} aria-hidden="true" />
      </IconButton>
      <IconButton label="Ulangi (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo}>
        <Redo2 size={18} strokeWidth={1.75} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
