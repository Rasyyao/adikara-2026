"use client";

import { CheckCircle2, Clock, Search, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudentSession } from "@/lib/dummy/student";
import { Cell, EmptyRow, PlainHeader, Primary, SortHeader, nextSort, type SortState } from "./table-parts";

const CHIPS = {
  PRESENT: {
    label: "Hadir",
    Icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    iconTone: "text-emerald-600",
  },
  LATE: {
    label: "Terlambat",
    Icon: Clock,
    className: "bg-amber-50 text-amber-800 border-amber-200/80",
    iconTone: "text-amber-600",
  },
  ABSENT: {
    label: "Tidak hadir",
    Icon: XCircle,
    className: "bg-rose-50 text-rose-800 border-rose-200/80",
    iconTone: "text-rose-600",
  },
} as const;

type Sort = "subject" | "status";
const ORDER = ["PRESENT", "LATE", "ABSENT"] as const;

export function StudentSessionsTable({ title, rows }: { title: string; rows: StudentSession[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [sort, setSort] = useState<SortState<Sort> | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter(
      (row) =>
        (status === "ALL" || row.status === status) &&
        (!needle || row.subject.toLowerCase().includes(needle) || row.teacher.toLowerCase().includes(needle)),
    );
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.key === "subject"
        ? a.subject.localeCompare(b.subject, "id") * factor
        : (ORDER.indexOf(a.status as (typeof ORDER)[number]) - ORDER.indexOf(b.status as (typeof ORDER)[number])) *
          factor,
    );
  }, [rows, query, status, sort]);

  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-border/80 bg-surface shadow-xs">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-3.5 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-heading text-h3 font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-caption text-muted">Daftar kehadiran sesi pembelajaran terakhir Anda.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search
              size={15}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Cari mapel atau guru..."
              className="h-9 w-48 rounded-lg border border-border/80 bg-bg pl-8 pr-7 text-caption text-ink outline-none transition-colors focus:border-primary focus:bg-surface sm:w-56"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Hapus pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center rounded-lg border border-border/70 bg-bg/80 p-0.5">
            <button
              type="button"
              onClick={() => setStatus("ALL")}
              className={`rounded-md px-2.5 py-1 text-caption font-semibold transition-all ${
                status === "ALL" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              Semua
            </button>
            {ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={`rounded-md px-2.5 py-1 text-caption font-semibold transition-all ${
                  status === key ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                {CHIPS[key].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-bg/50">
              <SortHeader label="Pelajaran & Guru" sortKey="subject" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Waktu Sesi</PlainHeader>
              <SortHeader label="Status Kehadiran" sortKey="status" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visible.length === 0 ? (
              <EmptyRow colSpan={3} query={query} />
            ) : (
              visible.map((row) => {
                const chip = CHIPS[row.status];
                const Icon = chip.Icon;

                return (
                  <tr key={row.id} className="transition-colors duration-150 hover:bg-bg/50">
                    <Cell>
                      <Primary title={row.subject} subtitle={row.teacher} />
                    </Cell>
                    <Cell className="whitespace-nowrap font-medium text-muted">{row.date}</Cell>
                    <Cell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-semibold ${chip.className}`}
                      >
                        <Icon size={14} strokeWidth={2.2} className={chip.iconTone} aria-hidden="true" />
                        {chip.label}
                      </span>
                    </Cell>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
