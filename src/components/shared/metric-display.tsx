import * as React from "react";
import { cn } from "@/lib/utils";

interface MetricDisplayProps {
  label: string;
  value: string | number;
  subValue?: string;
  change?: {
    value: string;
    trend: "up" | "down" | "neutral";
  };
  icon?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

export function MetricDisplay({
  label,
  value,
  subValue,
  change,
  icon,
  className,
  isLoading = false,
}: MetricDisplayProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-3.5 flex flex-col justify-between shadow-xs transition-colors",
        className
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
        {icon && <div className="text-muted-foreground/80">{icon}</div>}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        {isLoading ? (
          <div className="h-6 w-16 bg-muted animate-pulse rounded" />
        ) : (
          <span className="text-xl font-semibold font-mono tracking-tight text-foreground">{value}</span>
        )}
        {change && !isLoading && (
          <span
            className={cn(
              "text-[10px] font-mono",
              change.trend === "up" && "text-emerald-500 dark:text-[#34D399]",
              change.trend === "down" && "text-rose-500 dark:text-[#F87171]",
              change.trend === "neutral" && "text-muted-foreground"
            )}
          >
            {change.trend === "up" ? "+" : ""}
            {change.value}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-1 h-3 w-24 bg-muted animate-pulse rounded" />
      ) : subValue ? (
        <span className="mt-1 text-[10px] text-muted-foreground font-mono truncate">{subValue}</span>
      ) : null}
    </div>
  );
}
