"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Check, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** Clicking a new column sorts it ascending; clicking the same column again flips it. */
export function nextSort<K extends string>(current: SortState<K> | null, key: K): SortState<K> {
  return current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
}

export function SortHeader<K extends string>({ label, sortKey, sort, onSort }: { label: string; sortKey: K; sort: SortState<K> | null; onSort: (key: K) => void }) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="px-4 py-3 text-left text-small font-semibold text-ink first:pl-6 last:pr-6">
      <button type="button" onClick={() => onSort(sortKey)} className="-mx-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 transition-colors duration-150 ease-out hover:bg-surface">
        {label}
        <Icon size={16} strokeWidth={1.75} className={active ? "text-primary" : "text-muted"} aria-hidden="true" />
      </button>
    </th>
  );
}

export function PlainHeader({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 text-left text-small font-semibold text-ink first:pl-6 last:pr-6">
      {children}
    </th>
  );
}

export function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-4 text-small text-ink first:pl-6 last:pr-6 ${className}`}>{children}</td>;
}

export function ProgressCell({ percent, detail }: { percent: number; detail?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-primary-tint" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <span className="font-semibold">{percent}%</span>
      {detail && <span className="text-muted">{detail}</span>}
    </div>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

/** Title on the left; search and filter on the right. The filter is one single-choice group. */
export function TableToolbar({
  title,
  query,
  onQuery,
  filterLabel,
  options,
  filter,
  onFilter,
  placeholder,
}: {
  title: string;
  query: string;
  onQuery: (value: string) => void;
  filterLabel: string;
  options: FilterOption[];
  filter: string;
  onFilter: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = filter !== options[0].value;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !wrapper.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <h2 className="text-h3 font-semibold">{title}</h2>
      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 text-muted focus-within:border-primary sm:w-64 sm:flex-none">
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Cari</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-small text-ink focus-bare outline-none placeholder:text-muted"
          />
        </label>

        <div ref={wrapper} className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={menuId}
            className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-small font-semibold transition-colors duration-150 ease-out hover:bg-bg ${
              active ? "border-primary bg-primary-tint text-primary" : "border-border bg-surface text-ink"
            }`}
          >
            <SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
            Filter
            {active && <span className="size-2 rounded-full bg-primary" aria-label="Filter aktif" />}
          </button>
          {open && (
            <div id={menuId} role="group" aria-label={filterLabel} className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-border bg-surface p-2 shadow-[var(--shadow-overlay)]">
              <p className="px-3 py-2 text-caption font-medium uppercase tracking-wide text-muted">{filterLabel}</p>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => {
                    onFilter(option.value);
                    setOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-small text-ink transition-colors duration-150 ease-out hover:bg-bg"
                >
                  {option.label}
                  {filter === option.value && <Check size={20} strokeWidth={1.75} className="text-primary" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, query }: { colSpan: number; query: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center text-body text-muted">
        {query ? `Tidak ada hasil untuk “${query}”.` : "Tidak ada data untuk filter ini."}
      </td>
    </tr>
  );
}

/** Initial circle with a name and a muted line under it, the first cell of most rows. */
export function Primary({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint font-heading text-small font-semibold text-primary">
        {title.charAt(0)}
      </span>
      <div className="min-w-0">
        <p className="text-body font-semibold text-ink">{title}</p>
        <p className="truncate text-small text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
