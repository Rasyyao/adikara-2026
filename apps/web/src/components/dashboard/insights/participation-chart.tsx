"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ParticipationPoint {
  id: string;
  label: string;
  className: string;
  material: string | null;
  joined: number;
  classSize: number;
  /** 0-100 */
  value: number;
  /** 0-100, null without a graded quiz. */
  correct: number | null;
}

// Recharts draws SVG attributes, which cannot read Tailwind classes, so it takes the CSS variables directly.
const PRIMARY = "var(--primary)";
const PRIMARY_TINT = "var(--primary-tint)";
const BORDER = "var(--border)";
const MUTED = "var(--muted)";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ParticipationPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-60 rounded-md border border-border bg-surface px-3 py-2 shadow-[var(--shadow-overlay)]">
      <p className="text-caption text-muted">
        {p.className} · {p.label}
      </p>
      {p.material && <p className="truncate text-caption text-muted">{p.material}</p>}
      <p className="text-small font-semibold text-ink">
        {p.joined}/{p.classSize} siswa hadir ({p.value}%)
      </p>
      {p.correct !== null && <p className="text-caption text-ink">Kuis: rata-rata {p.correct}% benar</p>}
    </div>
  );
}

/** How much of the class joined each session, oldest to newest: one bar per session. */
export function ParticipationChart({ points }: { points: ParticipationPoint[] }) {
  const summary = points.map((p) => `${p.className} ${p.label} ${p.value}%`).join(", ");
  const last = points.length - 1;
  return (
    <figure className="px-2 pb-4 pt-2 sm:px-4">
      <div role="img" aria-label={`Partisipasi ${points.length} sesi terakhir: ${summary}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
            <CartesianGrid stroke={BORDER} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="id" tickFormatter={(id: string) => points.find((p) => p.id === id)?.label ?? ""} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} tickMargin={8} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={44} tick={{ fill: MUTED, fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: PRIMARY_TINT, opacity: 0.6 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {points.map((p, i) => (
                // the newest session in full colour, the rest a step lighter, so "now" stands out against the trend
                <Cell key={p.id} fill={PRIMARY} fillOpacity={i === last ? 1 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
