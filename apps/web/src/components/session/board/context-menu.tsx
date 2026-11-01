"use client";

import { useEffect } from "react";

export interface MenuItem {
  label: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Draws a divider above the item. */
  separator?: boolean;
}

const MENU_W = 232;
const ITEM_H = 36;

/** The right-click menu of the board. A full-board backdrop closes it on any outside click. */
export function ContextMenu({ x, y, area, items, onClose }: { x: number; y: number; area: { w: number; h: number }; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const height = items.length * ITEM_H + 12;
  const left = Math.max(8, Math.min(x, area.w - MENU_W - 8));
  const top = Math.max(8, Math.min(y, area.h - height - 8));

  return (
    <>
      <div
        className="absolute inset-0 z-30"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <ul role="menu" aria-label="Menu papan tulis" className="absolute z-40 select-none rounded-lg border border-border bg-surface p-1.5 shadow-[var(--shadow-overlay)]" style={{ left, top, width: MENU_W }}>
        {items.map((item) => (
          <li key={item.label} role="none" className={item.separator ? "mt-1 border-t border-border pt-1" : undefined}>
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={`flex h-8 w-full items-center justify-between gap-3 rounded-md px-2.5 text-small transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-bg"
              }`}
            >
              <span>{item.label}</span>
              {item.shortcut && <kbd className="text-caption font-semibold text-muted">{item.shortcut}</kbd>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
