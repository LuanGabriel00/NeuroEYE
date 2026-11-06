import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";

type Trend = "up" | "down" | "neutral";

export default function StatCard({
  label,
  value,
  unit,
  trend = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  trend?: Trend;
  icon?: LucideIcon;
}) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{label}</p>
        {Icon && <Icon size={16} className="text-zinc-400" />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold ${hasValue ? "text-zinc-900" : "text-zinc-300"}`}>
          {hasValue ? value : "—"}
        </span>
        {hasValue && unit && <span className="text-sm text-zinc-500">{unit}</span>}
        {hasValue && trend !== "neutral" && (
          <span className={trend === "up" ? "text-green-600" : "text-red-500"}>
            {trend === "up" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </span>
        )}
      </div>
    </div>
  );
}
