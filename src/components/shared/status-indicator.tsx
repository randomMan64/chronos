import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusType = "active" | "connected" | "degraded" | "unreachable" | "pending" | "failed" | "success" | "warning";

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  className?: string;
  pulse?: boolean;
}

export function StatusIndicator({ status, label, className, pulse = false }: StatusIndicatorProps) {
  const getStatusColor = () => {
    switch (status) {
      case "active":
      case "connected":
      case "success":
        return "bg-emerald-500 dark:bg-[#34D399]";
      case "warning":
      case "pending":
      case "degraded":
        return "bg-amber-500 dark:bg-[#FBBF24]";
      case "unreachable":
      case "failed":
        return "bg-rose-500 dark:bg-[#F87171]";
      default:
        return "bg-slate-400 dark:bg-[#6F7781]";
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              getStatusColor()
            )}
          />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", getStatusColor())} />
      </span>
      {label && <span className="text-[11px] font-mono capitalize text-muted-foreground">{label}</span>}
    </div>
  );
}
