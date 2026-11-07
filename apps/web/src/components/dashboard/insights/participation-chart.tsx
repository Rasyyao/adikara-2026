"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users } from "lucide-react";

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

const PRIMARY = "var(--primary)";
const PRIMARY_TINT = "var(--primary-tint)";
const BORDER = "var(--border)";
const MUTED = "var(--muted)";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ParticipationPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  return (
    <div className="max-w-64 rounded-xl border border-border bg-surface p-3 shadow-lg">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
        <span className="font-heading text-caption font-bold text-ink">{p.className}</span>
        <span className="text-caption text-muted">{p.label}</span>
      </div>

      {p.material && (
        <p className="mt-1.5 truncate text-caption font-medium text-muted" title={p.material}>
          {p.material}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-caption text-muted">Kehadiran:</span>
        <span className="font-heading text-small font-bold text-primary">
          {p.joined}/{p.classSize} ({p.value}%)
        </span>
      </div>

      {p.correct !== null && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-caption text-muted">Akurasi Kuis:</span>
          <span className="font-heading text-small font-bold text-emerald-600">
            {p.correct}%
          </span>
        </div>
      )}
    </div>
  );
}

/** How much of the class joined each session, oldest to newest: one bar per session. */
export function ParticipationChart({ points }: { points: ParticipationPoint[] }) {
  const summary = points.map((p) => `${p.className} ${p.label} ${p.value}%`).join(", ");
  const last = points.length - 1;

  // Calculate average attendance across rendered sessions
  const avg = points.length > 0 ? Math.round(points.reduce((acc, p) => acc + p.value, 0) / points.length) : 0;

  return (
    <figure className="flex flex-col p-4 sm:p-6">
      {/* Chart Top Metrics Summary */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2 text-caption">
          <span className="inline-flex size-2 rounded-full bg-primary" aria-hidden="true" />
          <span className="font-medium text-ink">Sesi Terakhir:</span>
          <span className="font-bold text-primary">{points[last]?.value ?? 0}%</span>
        </div>

        <div className="flex items-center gap-3 text-caption text-muted">
          <span>
            Rata-rata kehadiran: <strong className="font-semibold text-ink">{avg}%</strong>
          </span>
          <span>·</span>
          <span>Target minimum: 80%</span>
        </div>
      </div>

      {/* SVG Recharts Bar Chart */}
      <div role="img" aria-label={`Partisipasi ${points.length} sesi terakhir: ${summary}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="id"
              tickFormatter={(id: string) => points.find((p) => p.id === id)?.label ?? ""}
              tickLine={false}
              axisLine={false}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickMargin={8}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: MUTED, fontSize: 12 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: PRIMARY_TINT, opacity: 0.4 }} />
            {/* Target 80% attendance benchmark */}
            <ReferenceLine y={80} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={42}>
              {points.map((p, i) => (
                <Cell
                  key={p.id}
                  fill={i === last ? PRIMARY : PRIMARY}
                  fillOpacity={i === last ? 1 : 0.45}
                  className="transition-all duration-200 hover:fill-opacity-90"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center justify-between text-caption text-muted">
        <span>* Garis hijau putus-putus menunjukkan standar minimum kehadiran (80%).</span>
        <span>{points.length} sesi ditampilkan</span>
      </div>
    </figure>
  );
}
