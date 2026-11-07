import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { PeriodChip } from "@/components/dashboard/period-chip";

export function PageHeader({
  title,
  description,
  badge,
  action,
}: {
  title: string;
  description?: string;
  badge?: string;
  action?: ReactNode;
}) {
  const isGreeting = title.toLowerCase().startsWith("halo");

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {badge && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-2.5 py-0.5 text-caption font-semibold text-primary">
              <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
              {badge}
            </span>
          )}
          {isGreeting && !badge && (
            <span className="inline-flex size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" aria-hidden="true" />
          )}
          <h1 className="truncate font-heading text-h1 font-bold tracking-tight text-ink">{title}</h1>
        </div>
        {description && <p className="mt-1 text-small text-muted">{description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {action !== undefined ? action : <PeriodChip />}
      </div>
    </div>
  );
}

export function Panel({
  title,
  children,
  className = "",
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section aria-label={title} className={`overflow-hidden rounded-xl border border-border/80 bg-surface shadow-xs ${className}`}>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4 sm:px-6">
        <h2 className="font-heading text-h3 font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}
