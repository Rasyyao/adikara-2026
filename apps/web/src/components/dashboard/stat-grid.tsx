import { ArrowDownRight, ArrowUpRight, CalendarCheck, Clock, GraduationCap, Presentation, UserCheck, UserMinus, UserX, Users, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  classes: GraduationCap,
  students: Users,
  sessions: Presentation,
  attendance: UserCheck,
  late: Clock,
  absent: UserX,
  kicked: UserMinus,
  calendar: CalendarCheck,
};

interface Stat {
  label: string;
  value: string;
  /** Percentage change against the previous period. 0 shows no badge. */
  delta?: number;
  hint: string;
  icon: string;
}

/** Up is green and down is red, but the arrow and sign carry the meaning too. */
function Delta({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-caption font-semibold ${up ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
      <Arrow size={14} strokeWidth={2} aria-hidden="true" />
      {up ? "+" : "−"}
      {Math.abs(value)}%
    </span>
  );
}

export function StatGrid({ stats }: { stats: readonly Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = ICONS[stat.icon] ?? CalendarCheck;
        return (
          <div key={stat.label} className="rounded-lg bg-surface p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary" aria-hidden="true">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <dt className="text-body font-medium text-muted">{stat.label}</dt>
            </div>
            <dd className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-heading text-display font-semibold text-ink">{stat.value}</span>
              <Delta value={stat.delta ?? 0} />
            </dd>
            <p className="mt-2 text-caption text-muted">{stat.hint}</p>
          </div>
        );
      })}
    </dl>
  );
}
