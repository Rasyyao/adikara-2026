import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-h1 font-semibold">{title}</h1>
        {description && <p className="mt-1 text-body text-muted">{description}</p>}
      </div>
      {action ?? <PeriodChip />}
    </div>
  );
}

/** Static period label for now; becomes a real range picker when reports need one. */
function PeriodChip() {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-3 text-small font-medium text-ink">
      <CalendarDays size={20} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
      1 – 21 Okt 2026
    </span>
  );
}

export function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`overflow-hidden rounded-lg bg-surface ${className}`}>
      <h2 className="px-4 pt-4 text-h3 font-semibold sm:px-6">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
