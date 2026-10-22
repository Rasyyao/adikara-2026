"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudentSession } from "@/lib/dummy/student";
import { Cell, EmptyRow, nextSort, PlainHeader, Primary, SortHeader, TableToolbar, type SortState } from "./table-parts";

const CHIPS = {
  PRESENT: { label: "Hadir", Icon: CheckCircle2, tone: "text-success" },
  LATE: { label: "Terlambat", Icon: Clock, tone: "text-warning" },
  ABSENT: { label: "Tidak hadir", Icon: XCircle, tone: "text-danger" },
} as const;

type Sort = "subject" | "status";
const ORDER = ["PRESENT", "LATE", "ABSENT"];

export function StudentSessionsTable({ title, rows }: { title: string; rows: StudentSession[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState<SortState<Sort> | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter(
      (row) => (status === "ALL" || row.status === status) && (!needle || row.subject.toLowerCase().includes(needle) || row.teacher.toLowerCase().includes(needle)),
    );
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.key === "subject" ? a.subject.localeCompare(b.subject, "id") * factor : (ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) * factor,
    );
  }, [rows, query, status, sort]);

  return (
    <section aria-label={title} className="overflow-hidden rounded-lg bg-surface">
      <TableToolbar
        title={title}
        query={query}
        onQuery={setQuery}
        placeholder="Cari pelajaran atau guru…"
        filterLabel="Status kehadiran"
        options={[{ value: "ALL", label: "Semua status" }, ...ORDER.map((key) => ({ value: key, label: CHIPS[key as keyof typeof CHIPS].label }))]}
        filter={status}
        onFilter={setStatus}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-bg">
              <SortHeader label="Pelajaran" sortKey="subject" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Waktu</PlainHeader>
              <SortHeader label="Kehadiran" sortKey="status" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={3} query={query} />
            ) : (
              visible.map((row) => {
                const { label, Icon, tone } = CHIPS[row.status];
                return (
                  <tr key={row.id} className="border-t border-border transition-colors duration-150 ease-out hover:bg-bg">
                    <Cell>
                      <Primary title={row.subject} subtitle={row.teacher} />
                    </Cell>
                    <Cell className="whitespace-nowrap text-muted">{row.date}</Cell>
                    <Cell>
                      <span className={`inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-small font-semibold ${tone}`}>
                        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                        {label}
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
