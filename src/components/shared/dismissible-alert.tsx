"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertType = "success" | "error" | "warning" | "info";

export interface AlertMessage {
  type: AlertType;
  text: string;
}

interface DismissibleAlertProps {
  message: AlertMessage | null;
  onDismiss: () => void;
  autoDismissMs?: number;
  className?: string;
}

export function DismissibleAlert({
  message,
  onDismiss,
  autoDismissMs = 5000,
  className,
}: DismissibleAlertProps) {
  const [isExiting, setIsExiting] = React.useState(false);

  React.useEffect(() => {
    if (!message) {
      setIsExiting(false);
      return;
    }

    setIsExiting(false);

    // Auto dismiss after autoDismissMs
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        onDismiss();
        setIsExiting(false);
      }, 300);
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [message, onDismiss, autoDismissMs]);

  if (!message) return null;

  const handleManualDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
      setIsExiting(false);
    }, 300);
  };

  const getStyle = () => {
    switch (message.type) {
      case "success":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-[#34D399]/30 dark:bg-[#34D399]/10 dark:text-[#34D399]";
      case "error":
        return "border-destructive/30 bg-destructive/10 text-destructive";
      case "warning":
        return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400";
      case "info":
      default:
        return "border-primary/30 bg-primary/10 text-primary";
    }
  };

  const getIcon = () => {
    switch (message.type) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 shrink-0" />;
      case "error":
      case "warning":
        return <AlertTriangle className="h-4 w-4 shrink-0" />;
      case "info":
      default:
        return <Info className="h-4 w-4 shrink-0" />;
    }
  };

  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border p-2.5 text-xs flex items-center justify-between gap-2 shadow-xs transition-all duration-300",
        getStyle(),
        isExiting
          ? "opacity-0 -translate-y-1 scale-98 pointer-events-none"
          : "opacity-100 translate-y-0 scale-100 animate-in fade-in-0 slide-in-from-top-1.5 duration-300",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {getIcon()}
        <span className="font-medium truncate">{message.text}</span>
      </div>

      <button
        type="button"
        onClick={handleManualDismiss}
        className="ml-auto p-1 rounded-sm opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        title="Dismiss"
        aria-label="Dismiss message"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

