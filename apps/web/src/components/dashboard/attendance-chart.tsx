"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  date: string;
  className: string;
  value: number;
}

// Recharts draws SVG attributes, which cannot read Tailwind classes, so it takes the CSS variables directly.
const PRIMARY = "var(--primary)";
const BORDER = "var(--border)";
const MUTED = "var(--muted)";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 shadow-[var(--shadow-overlay)]">
      <p className="text-caption text-muted">
        {point.className} · {point.date}
      </p>
      <p className="text-small font-semibold text-ink">{point.value}% hadir</p>
    </div>
  );
}

export function AttendanceChart({ points }: { points: TrendPoint[] }) {
  const data = points.map((point, index) => ({ ...point, key: index }));
  const summary = points.map((p) => `${p.className} ${p.date} ${p.value}%`).join(", ");

  return (
    <figure className="px-2 pb-4 pt-2 sm:px-4">
      <div role="img" aria-label={`Grafik kehadiran ${points.length} sesi terakhir: ${summary}`} className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={BORDER} strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="key"
              tickFormatter={(key: number) => points[key]?.date ?? ""}
              tickLine={false}
              axisLine={false}
              tick={{ fill: MUTED, fontSize: 13 }}
              tickMargin={8}
            />
            <YAxis
              domain={[70, 100]}
              ticks={[70, 80, 90, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: MUTED, fontSize: 13 }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: BORDER }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={PRIMARY}
              strokeWidth={2.5}
              fill={PRIMARY}
              fillOpacity={0.08}
              dot={{ r: 4, fill: "#fff", stroke: PRIMARY, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: PRIMARY, stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
