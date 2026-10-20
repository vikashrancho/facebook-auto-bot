"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export interface PostsChartProps {
  data: { date: string; label: string; count: number }[];
}

export function PostsChart({ data }: PostsChartProps) {
  const hasData = data && data.length > 0;
  const maxCount = hasData ? Math.max(...data.map((d) => d.count), 1) : 1;

  if (!hasData) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl bg-surface-2/30 text-xs text-muted-foreground">
        No publishing data available for the last 14 days.
      </div>
    );
  }

  return (
    <div className="w-full h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="publishingGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
              <stop offset="60%" stopColor="#2563eb" stopOpacity={0.08} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            vertical={false}
            opacity={0.6}
          />

          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            dy={8}
          />

          <YAxis
            allowDecimals={false}
            domain={[0, Math.max(maxCount + 1, 4)]}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={34}
          />

          <Tooltip
            cursor={{ stroke: "#2563eb", strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={{
              backgroundColor: "rgba(24, 27, 32, 0.95)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: "8px 12px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
              color: "var(--color-foreground)",
              fontSize: 12,
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
            formatter={(value: any) => [`${value} post${value === 1 ? "" : "s"} published`, "Activity"]}
          />

          <Area
            type="monotone"
            dataKey="count"
            stroke="#2563eb"
            strokeWidth={2.5}
            fill="url(#publishingGlow)"
            activeDot={{ r: 6, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
