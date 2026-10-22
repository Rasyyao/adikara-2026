import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { StudentSession } from "@/lib/dummy/student";

const CHIPS = {
  PRESENT: { label: "Hadir", Icon: CheckCircle2, tone: "text-success" },
  LATE: { label: "Terlambat", Icon: Clock, tone: "text-warning" },
  ABSENT: { label: "Tidak hadir", Icon: XCircle, tone: "text-danger" },
} as const;

export function StudentSessionList({ rows }: { rows: StudentSession[] }) {
  return (
    <ul>
      {rows.map((row) => {
        const { label, Icon, tone } = CHIPS[row.status];
        return (
          <li key={row.id} className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 last:border-b-0 sm:px-6">
            <div className="min-w-0">
              <p className="text-body font-semibold text-ink">{row.subject}</p>
              <p className="text-small text-muted">
                {row.teacher} · {row.date}
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-2 py-1 text-small font-semibold ${tone}`}>
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
