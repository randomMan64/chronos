import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-md border border-dashed border-border bg-card/40 backdrop-blur-xs",
        className
      )}
    >
      {icon && (
        <div className="mb-3 rounded-full bg-elevated p-3 border border-border text-muted-foreground shadow-xs">
          {icon}
        </div>
      )}
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      <p className="mt-1 text-[11px] text-muted-foreground max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="mt-2 text-xs font-mono">{message}</span>
    </div>
  );
}
