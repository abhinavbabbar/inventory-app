"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { colorAt } from "@/lib/chart-colors";

type Slice = { name: string; value: number };

const aedFmt = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 0,
});

export function ShareDonut({ data }: { data: Slice[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colorAt(i)} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) =>
            typeof value === "number" ? aedFmt.format(value) : String(value)
          }
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
