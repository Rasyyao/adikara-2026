import type { ClassSummary } from "@/lib/dummy/teacher";

export function ClassList({ rows }: { rows: ClassSummary[] }) {
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id} className="border-b border-border px-4 py-4 last:border-b-0 sm:px-6">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-body font-semibold text-ink">{row.name}</p>
            <p className="text-small font-semibold text-ink">{row.attendanceRate}%</p>
          </div>
          <p className="text-small text-muted">
            {row.subject} · {row.students} siswa
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-sm bg-primary-tint" aria-hidden="true">
            <div className="h-full bg-primary" style={{ width: `${row.attendanceRate}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
