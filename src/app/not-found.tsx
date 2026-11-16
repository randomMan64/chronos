import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Compass, Home, Terminal, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="relative min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center p-4 select-none">
      {/* Top right theme toggle adhering to the active theme */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-5 text-center">
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-1">
          <BrandLogo
            width={74}
            height={74}
            className="size-20 drop-shadow-xs"
            priority
          />
        </div>

        {/* 404 Main Card */}
        <div className="p-6 bg-panel border border-border rounded-2xl shadow-xl space-y-4 text-center">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Compass className="h-7 w-7 text-primary animate-pulse" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/30">
              HTTP 404
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Page Not Found
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
              The requested path does not exist, has been relocated, or is
              temporarily unavailable.
            </p>
          </div>

          {/* Diagnostic Context Box */}
          <div className="p-3 rounded-lg border border-border bg-elevated/40 text-xs text-muted-foreground font-mono text-left space-y-1">
            <div className="flex justify-between">
              <span className="text-foreground font-medium">Status:</span>
              <span className="text-destructive font-semibold">
                404_NOT_FOUND
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground font-medium">System:</span>
              <span>CHRONOS Control Plane</span>
            </div>
          </div>

          {/* Navigation Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: "sm" }),
                "w-full sm:w-auto text-xs h-9 px-4 gap-1.5 cursor-pointer",
              )}
            >
              <Home className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Link>

            <Link
              href="/sql-editor"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full sm:w-auto text-xs h-9 px-4 gap-1.5 cursor-pointer",
              )}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>SQL Gateway</span>
            </Link>
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
