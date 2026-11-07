"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Presentation,
  UserCheck,
  UserMinus,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  classes: GraduationCap,
  students: Users,
  sessions: Presentation,
  attendance: UserCheck,
  late: Clock,
  absent: UserX,
  kicked: UserMinus,
  calendar: CalendarCheck,
  quiz: ClipboardCheck,
};

// Visual themes for stats to give each metric clear, distinct recognition
const THEMES: Record<string, { bg: string; text: string; bar: string }> = {
  classes: { bg: "bg-indigo-50", text: "text-indigo-600", bar: "bg-indigo-500" },
  students: { bg: "bg-indigo-50", text: "text-indigo-600", bar: "bg-indigo-500" },
  sessions: { bg: "bg-amber-50", text: "text-amber-600", bar: "bg-amber-500" },
  attendance: { bg: "bg-emerald-50", text: "text-emerald-600", bar: "bg-emerald-500" },
  quiz: { bg: "bg-primary-tint", text: "text-primary", bar: "bg-primary" },
  late: { bg: "bg-amber-50", text: "text-amber-600", bar: "bg-amber-500" },
  absent: { bg: "bg-rose-50", text: "text-rose-600", bar: "bg-rose-500" },
  calendar: { bg: "bg-primary-tint", text: "text-primary", bar: "bg-primary" },
};

export interface Stat {
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
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-caption font-semibold ${
        up ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}
    >
      <Arrow size={13} strokeWidth={2.2} aria-hidden="true" />
      {up ? "+" : "−"}
      {Math.abs(value)}%
    </span>
  );
}

export function StatGrid({ stats }: { stats: readonly Stat[] }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = ICONS[stat.icon] ?? CalendarCheck;
        const theme = THEMES[stat.icon] ?? { bg: "bg-primary-tint", text: "text-primary", bar: "bg-primary" };
        const isPercent = stat.value.includes("%");
        const numericVal = parseInt(stat.value.replace(/\D/g, ""), 10);

        return (
          <div
            key={stat.label}
            className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-surface p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
          >
            {/* Top row: Label & Icon */}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-small font-medium text-muted">{stat.label}</dt>
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${theme.bg} ${theme.text} transition-transform duration-200 group-hover:scale-105`}
                aria-hidden="true"
              >
                <Icon size={20} strokeWidth={1.85} />
              </span>
            </div>

            {/* Middle row: Big Value & Delta Pill */}
            <dd className="mt-3 flex items-baseline gap-2.5">
              <span className="font-heading text-display font-bold tracking-tight text-ink tabular-nums">
                {stat.value}
              </span>
              <Delta value={stat.delta ?? 0} />
            </dd>

            {/* Bottom row: Context Hint or Mini Progress Bar */}
            <div className="mt-3">
              {isPercent && !isNaN(numericVal) && (
                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-bg" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${theme.bar} transition-all duration-500`}
                    style={{ width: `${Math.min(100, Math.max(0, numericVal))}%` }}
                  />
                </div>
              )}
              <p className="truncate text-caption text-muted" title={stat.hint}>
                {stat.hint}
              </p>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
