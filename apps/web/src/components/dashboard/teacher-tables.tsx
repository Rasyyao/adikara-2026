"use client";

import { Eye, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusChip } from "@/components/session/status-chip";
import type { ClassSummary, SessionRow } from "@/lib/dummy/teacher";
import { Cell, EmptyRow, Primary, nextSort, PlainHeader, ProgressCell, SortHeader, TableToolbar, type SortState } from "./table-parts";

const CARD = "overflow-hidden rounded-lg bg-surface";
const HEAD_ROW = "bg-bg";
// Rows are divided by the same hairline the cards use, and light up on hover.
const BODY_ROW = "border-t border-border transition-colors duration-150 ease-out hover:bg-bg";

function matches(query: string, ...fields: string[]) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.some((field) => field.toLowerCase().includes(needle));
}

/** View and edit buttons for a class row. They do nothing yet; the pages and handlers come later. */
function ClassActions({ name }: { name: string }) {
  const base = "flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-primary-tint hover:text-primary";
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" title="Lihat detail" aria-label={`Lihat detail ${name}`} className={base}>
        <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button type="button" title="Ubah" aria-label={`Ubah ${name}`} className={base}>
        <Pencil size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

type SessionSort = "className" | "attendance";

export function SessionsTable({ title, rows }: { title: string; rows: SessionRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState<SortState<SessionSort> | null>(null);

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => (status === "ALL" || row.status === status) && matches(query, row.className, row.topic));
    if (!sort) return filtered;
    const value = (row: SessionRow) => (sort.key === "className" ? row.className : row.present / row.total);
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      return (typeof x === "string" ? x.localeCompare(y as string, "id", { numeric: true }) : (x as number) - (y as number)) * factor;
    });
  }, [rows, query, status, sort]);

  return (
    <section aria-label={title} className={CARD}>
      <TableToolbar
        title={title}
        query={query}
        onQuery={setQuery}
        placeholder="Cari kelas atau materi…"
        filterLabel="Status sesi"
        options={[
          { value: "ALL", label: "Semua status" },
          { value: "ACTIVE", label: "Sedang berlangsung" },
          { value: "ENDED", label: "Selesai" },
        ]}
        filter={status}
        onFilter={setStatus}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className={HEAD_ROW}>
              <SortHeader label="Kelas" sortKey="className" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Waktu</PlainHeader>
              <SortHeader label="Kehadiran" sortKey="attendance" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Status</PlainHeader>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={4} query={query} />
            ) : (
              visible.map((row) => (
                <tr key={row.id} className={BODY_ROW}>
                  <Cell>
                    <Primary title={row.className} subtitle={row.topic} />
                  </Cell>
                  <Cell className="whitespace-nowrap text-muted">{row.date}</Cell>
                  <Cell>
                    <ProgressCell percent={Math.round((row.present / row.total) * 100)} detail={`${row.present}/${row.total}`} />
                  </Cell>
                  <Cell>
                    <StatusChip status={row.status} />
                  </Cell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ClassSort = "name" | "students" | "attendance";

export function ClassesTable({ title, rows }: { title: string; rows: ClassSummary[] }) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("ALL");
  const [sort, setSort] = useState<SortState<ClassSort> | null>(null);

  const subjects = useMemo(() => [...new Set(rows.map((row) => row.subject))], [rows]);
  const visible = useMemo(() => {
    const filtered = rows.filter((row) => (subject === "ALL" || row.subject === subject) && matches(query, row.name, row.subject));
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name, "id", { numeric: true }) * factor;
      const key = sort.key === "students" ? "students" : "attendanceRate";
      return (a[key] - b[key]) * factor;
    });
  }, [rows, query, subject, sort]);

  return (
    <section aria-label={title} className={CARD}>
      <TableToolbar
        title={title}
        query={query}
        onQuery={setQuery}
        placeholder="Cari kelas atau mata pelajaran…"
        filterLabel="Mata pelajaran"
        options={[{ value: "ALL", label: "Semua mata pelajaran" }, ...subjects.map((value) => ({ value, label: value }))]}
        filter={subject}
        onFilter={setSubject}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className={HEAD_ROW}>
              <SortHeader label="Kelas" sortKey="name" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <SortHeader label="Siswa" sortKey="students" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <SortHeader label="Kehadiran" sortKey="attendance" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              <PlainHeader>Sesi terakhir</PlainHeader>
              <PlainHeader>
                <span className="block text-right">Aksi</span>
              </PlainHeader>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <EmptyRow colSpan={5} query={query} />
            ) : (
              visible.map((row) => (
                <tr key={row.id} className={BODY_ROW}>
                  <Cell>
                    <Primary title={row.name} subtitle={row.subject} />
                  </Cell>
                  <Cell>{row.students} siswa</Cell>
                  <Cell>
                    <ProgressCell percent={row.attendanceRate} />
                  </Cell>
                  <Cell className="whitespace-nowrap text-muted">{row.lastSession}</Cell>
                  <Cell>
                    <ClassActions name={row.name} />
                  </Cell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
