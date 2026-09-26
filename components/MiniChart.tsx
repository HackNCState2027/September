"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartData } from "@/lib/types";

export default function MiniChart({ chart }: { chart: ChartData }) {
  const data = chart.points.map((p) => ({
    day: new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }),
    value: p.value,
  }));
  const summary = data.map((d) => `${d.day} ${d.value ?? "no data"}`).join(", ");
  return (
    <figure className="mt-3 rounded-card border border-line bg-surface px-3 pt-2 pb-1">
      <figcaption className="tempo-eyebrow !text-[9px]">
        {chart.metric} ({chart.unit})
      </figcaption>
      <p className="sr-only">
        {chart.metric} by day: {summary}
      </p>
      <div className="h-24" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -28 }}>
            <defs>
              <linearGradient id="tempo-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--tempo-sage)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--tempo-sage)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--tempo-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--tempo-muted)" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(v) => [`${v} ${chart.unit}`, chart.metric]}
              contentStyle={{ fontSize: 12, borderRadius: 5, border: "1px solid var(--tempo-line)", background: "var(--tempo-surface-strong)" }}
            />
            <Area type="monotone" dataKey="value" stroke="var(--tempo-sage)" strokeWidth={1.8} fill="url(#tempo-fill)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
