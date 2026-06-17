"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Point = { label: string; cumulative: number };

const aedFmt = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 0,
});

export function ContributionChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <defs>
          <linearGradient id="investFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
        <YAxis
          stroke="#9ca3af"
          fontSize={11}
          width={80}
          tickFormatter={(v: number) => aedFmt.format(v)}
        />
        <Tooltip
          formatter={(value) =>
            typeof value === "number" ? aedFmt.format(value) : String(value)
          }
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Area
          type="stepAfter"
          dataKey="cumulative"
          stroke="#059669"
          strokeWidth={2}
          fill="url(#investFill)"
          name="Cumulative investment"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
