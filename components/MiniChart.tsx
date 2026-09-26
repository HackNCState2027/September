"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartData } from "@/lib/types";

export default function MiniChart({ chart }: { chart: ChartData }) {
  const data = chart.points.map((p) => ({
    day: new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }),
    value: p.value,
  }));
  return (
    <div className="mt-3 rounded-xl border border-line bg-bg/60 px-3 pt-2 pb-1">
      <div className="text-[11px] font-medium text-muted">
        {chart.metric} ({chart.unit})
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -28 }}>
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--goal)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--goal)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(v) => [`${v} ${chart.unit}`, chart.metric]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--line)" }}
            />
            <Area type="monotone" dataKey="value" stroke="var(--goal)" strokeWidth={2} fill="url(#fill)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
