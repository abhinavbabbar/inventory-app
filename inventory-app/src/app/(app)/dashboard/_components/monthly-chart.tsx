"use client";

import {
  ResponsiveContainer,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Line,
  ComposedChart,
} from "recharts";

type Point = {
  monthKey: string;
  label: string;
  revenue: number;
  cogs: number;
  opex: number;
  netProfit: number;
};

const aedFmt = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 0,
});

const COLORS = {
  revenue: "#16a34a",
  cogs: "#f59e0b",
  opex: "#ef4444",
  netProfit: "#2563eb",
};

export function MonthlyChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
        <YAxis
          stroke="#9ca3af"
          fontSize={11}
          tickFormatter={(v: number) => aedFmt.format(v)}
          width={80}
        />
        <Tooltip
          formatter={(value) =>
            typeof value === "number" ? aedFmt.format(value) : String(value)
          }
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" fill={COLORS.revenue} name="Revenue" radius={[2, 2, 0, 0]} />
        <Bar dataKey="cogs" fill={COLORS.cogs} name="COGS" radius={[2, 2, 0, 0]} />
        <Bar dataKey="opex" fill={COLORS.opex} name="Opex" radius={[2, 2, 0, 0]} />
        <Line
          type="monotone"
          dataKey="netProfit"
          stroke={COLORS.netProfit}
          strokeWidth={2}
          dot={{ r: 3 }}
          name="Net profit"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
