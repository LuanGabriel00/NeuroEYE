"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrackingPoint } from "@/lib/types";

export default function TrackingChart({ series }: { series: TrackingPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
          <XAxis
            dataKey="timeSeconds"
            tickFormatter={(t) => `${t}s`}
            tick={{ fontSize: 12, fill: "#71717a" }}
            axisLine={{ stroke: "#e4e4e7" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}°`}
            tick={{ fontSize: 12, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => `${value}°`}
            labelFormatter={(label) => `${label}s`}
            contentStyle={{ borderRadius: 8, borderColor: "#e4e4e7", fontSize: 12 }}
          />
          <Legend
            iconType="plainline"
            formatter={(value) => (value === "objectPosition" ? "Objeto" : "Olhar")}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="objectPosition"
            name="objectPosition"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="eyePosition"
            name="eyePosition"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
