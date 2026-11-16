import * as React from "react";
import { BrandLogo } from "@/components/shared/brand-logo";

/**
 * Neutral CHRONOS Loading Skeleton
 * Strictly neutral: Contains NO user names, emails, organization names,
 * workspace names, database names, or cached identity information.
 */
export function StudioLoadingSkeleton() {
  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden text-foreground antialiased select-none">
      {/* Sidebar Skeleton */}
      <aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col justify-between p-3 hidden md:flex">
        <div className="space-y-4">
          {/* Header Brand */}
          <div className="flex items-center gap-2 px-1 py-1">
            <BrandLogo width={24} height={24} className="h-6 w-6 opacity-60" priority />
            <div className="h-4 w-20 bg-muted/40 rounded animate-pulse" />
          </div>

          {/* Org & Workspace cards */}
          <div className="space-y-2 pt-2">
            <div className="h-10 bg-muted/20 border border-border/50 rounded p-2 flex items-center justify-between">
              <div className="h-3.5 w-24 bg-muted/40 rounded animate-pulse" />
              <div className="h-3 w-8 bg-muted/30 rounded animate-pulse" />
            </div>
            <div className="h-8 bg-muted/15 border border-border/40 rounded px-2 flex items-center justify-between">
              <div className="h-3 w-20 bg-muted/40 rounded animate-pulse" />
              <div className="h-2.5 w-6 bg-muted/30 rounded animate-pulse" />
            </div>
          </div>

          {/* Nav Items */}
          <div className="space-y-1.5 pt-3">
            <div className="h-2.5 w-12 bg-muted/30 rounded mb-2 animate-pulse" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-7 rounded bg-muted/15 flex items-center px-2 gap-2.5">
                <div className="h-3.5 w-3.5 bg-muted/30 rounded shrink-0 animate-pulse" />
                <div className="h-3 w-24 bg-muted/30 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* User profile skeleton at bottom */}
        <div className="pt-2 border-t border-border/60 flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-muted/40 shrink-0 animate-pulse" />
          <div className="space-y-1 min-w-0 flex-1">
            <div className="h-3 w-20 bg-muted/40 rounded animate-pulse" />
            <div className="h-2.5 w-28 bg-muted/25 rounded animate-pulse" />
          </div>
        </div>
      </aside>

      {/* Main Content Area Skeleton */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Header Bar */}
        <header className="h-12 border-b border-border bg-sidebar/50 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-muted/30 rounded animate-pulse" />
            <div className="h-3.5 w-24 bg-muted/40 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-6 w-28 bg-muted/25 rounded border border-border/40 animate-pulse" />
            <div className="h-6 w-14 bg-muted/25 rounded border border-border/40 animate-pulse" />
          </div>
        </header>

        {/* Page Content Skeleton */}
        <main className="flex-1 p-6 overflow-y-auto space-y-4">
          <div className="h-20 bg-panel/40 border border-border/60 rounded-lg p-4 flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-5 w-48 bg-muted/40 rounded animate-pulse" />
              <div className="h-3.5 w-72 bg-muted/25 rounded animate-pulse" />
            </div>
            <div className="h-8 w-24 bg-muted/30 rounded animate-pulse" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 bg-panel/30 border border-border/60 rounded-lg p-4 space-y-3">
                <div className="h-3 w-20 bg-muted/30 rounded animate-pulse" />
                <div className="h-6 w-16 bg-muted/40 rounded animate-pulse" />
                <div className="h-2.5 w-32 bg-muted/20 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
