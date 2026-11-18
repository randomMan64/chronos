"use client";

import * as React from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  RotateCcw,
  Home,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  const [copied, setCopied] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  React.useEffect(() => {
    // Log the error to console or error tracking telemetry
    console.error("[CHRONOS_APPLICATION_ERROR]", error);
  }, [error]);

  const copyDiagnosticInfo = () => {
    const diagnosticPayload = {
      message: error?.message || "Unknown error",
      digest: error?.digest || "N/A",
      stack: error?.stack || "N/A",
      timestamp: new Date().toISOString(),
      url: typeof window !== "undefined" ? window.location.href : "N/A",
    };

    navigator.clipboard.writeText(JSON.stringify(diagnosticPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg space-y-5 text-center">
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-1">
          <BrandLogo
            width={74}
            height={74}
            className="size-20 drop-shadow-xs"
            priority
          />
        </div>

        {/* 500 Main Card */}
        <div className="p-6 bg-panel border border-border rounded-2xl shadow-xl space-y-4 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shadow-xs">
              <AlertTriangle className="h-7 w-7 text-destructive animate-pulse" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-destructive/10 text-destructive border border-destructive/30">
              HTTP 500 • APPLICATION ERROR
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Something Went Wrong
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
              An unexpected application exception occurred while processing this request. The system state has been preserved.
            </p>
          </div>

          {/* Diagnostic Context Box */}
          <div className="p-3 rounded-lg border border-border bg-elevated/40 text-xs text-muted-foreground font-mono text-left space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-foreground font-medium">Status:</span>
              <span className="text-destructive font-semibold">
                500_INTERNAL_SERVER_ERROR
              </span>
            </div>
            {error?.digest && (
              <div className="flex justify-between items-center">
                <span className="text-foreground font-medium">Error Digest:</span>
                <span
                  className="text-muted-foreground font-mono truncate max-w-50"
                  title={error.digest}
                >
                  {error.digest}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-foreground font-medium">System:</span>
              <span>CHRONOS Control Plane</span>
            </div>
            {error?.message && (
              <div className="pt-1 border-t border-border/50 text-[11px] text-foreground/80 wrap-break-word font-mono line-clamp-2">
                {error.message}
              </div>
            )}
          </div>

          {/* Collapsible Technical Details */}
          {error?.stack && (
            <div className="text-left">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground font-mono transition-colors cursor-pointer"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    <span>Hide Stack Trace</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    <span>View Stack Trace</span>
                  </>
                )}
              </button>
              {showDetails && (
                <div className="mt-2 p-3 rounded-lg bg-black/60 border border-border text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-40 leading-relaxed whitespace-pre select-text">
                  {error.stack}
                </div>
              )}
            </div>
          )}

          {/* Navigation & Recovery Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => reset()}
              className="w-full sm:w-auto text-xs h-9 px-4 gap-1.5 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Try Again</span>
            </Button>

            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full sm:w-auto text-xs h-9 px-4 gap-1.5 cursor-pointer"
              )}
            >
              <Home className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Link>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={copyDiagnosticInfo}
              className="w-full sm:w-auto text-xs h-9 px-3 gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Copy diagnostic information"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Logs</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-[11px] text-muted-foreground font-mono">
          CHRONOS • Temporal Database Control Plane
        </p>
      </div>
    </div>
  );
}
