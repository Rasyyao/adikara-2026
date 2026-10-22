"use client";

import { CheckCircle2, Clock, UserMinus, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { StatGrid } from "@/components/dashboard/stat-grid";
import { Cell, EmptyRow, nextSort, PlainHeader, Primary, SortHeader, TableToolbar, type SortState } from "@/components/dashboard/table-parts";
import type { Attendance, AttendanceStatus } from "@/lib/api/types";

const STATUS: Record<AttendanceStatus, { label: string; Icon: typeof Clock; tone: string }> = {
  present: { label: "Hadir", Icon: CheckCircle2, tone: "text-success" },
  late: { label: "Terlambat", Icon: Clock, tone: "text-warning" },
  absent: { label: "Tidak hadir", Icon: UserX, tone: "text-danger" },
  kicked: { label: "Dikeluarkan", Icon: UserMinus, tone: "text-muted" },
};

const ORDER: AttendanceStatus[] = ["present", "late", "absent", "kicked"];

// Fixed zone so the server and the browser print the same time.
const TIME = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

type Sort = "name" | "status";

export function AttendanceReport({ attendance }: { attendance: Attendance }) {
  const { summary, students } = attendance;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState<SortState<Sort> | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = students.filter(
      (s) => (status === "ALL" || s.status === status) && (!needle || (s.name ?? "").toLowerCase().includes(needle) || (s.username ?? "").toLowerCase().includes(needle)),
    );
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.key === "name"
        ? (a.name ?? "").localeCompare(b.name ?? "", "id") * factor
        : (ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) * factor,
    );
  }, [students, query, status, sort]);

  const stats = ORDER.map((key) => ({
    label: STATUS[key].label,
    value: String(summary[key]),
    hint: `dari ${summary.total} siswa`,
    icon: key,
  }));

  return (
    <section aria-label="Laporan kehadiran" className="flex flex-col gap-6">
      <StatGrid stats={stats} />

      <div className="overflow-hidden rounded-lg bg-surface">
        <TableToolbar
          title={`Kehadiran ${summary.total} siswa`}
          query={query}
          onQuery={setQuery}
          placeholder="Cari nama atau nama pengguna…"
          filterLabel="Status kehadiran"
          options={[{ value: "ALL", label: "Semua status" }, ...ORDER.map((key) => ({ value: key, label: STATUS[key].label }))]}
          filter={status}
          onFilter={setStatus}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="bg-bg">
                <SortHeader label="Siswa" sortKey="name" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
                <PlainHeader>Jam masuk</PlainHeader>
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <EmptyRow colSpan={3} query={query} />
              ) : (
                visible.map((student) => {
                  const { label, Icon, tone } = STATUS[student.status];
                  return (
                    <tr key={student.student_id} className="border-t border-border transition-colors duration-150 ease-out hover:bg-bg">
                      <Cell>
                        <Primary title={student.name ?? "Tanpa nama"} subtitle={student.username ?? "—"} />
                      </Cell>
                      <Cell className="whitespace-nowrap text-muted">{student.joined_at ? TIME.format(new Date(student.joined_at)) : "—"}</Cell>
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
      </div>
    </section>
  );
}
