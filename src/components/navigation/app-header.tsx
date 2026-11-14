"use client";

import { BrandLogo } from "@/components/shared/brand-logo";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Database, Menu, Shield } from "lucide-react";
import { usePathname } from "next/navigation";

interface AppHeaderProps {
  currentDatabaseName?: string;
  role?: string;
  onOpenQuickQuery?: () => void;
  onToggleMobileMenu?: () => void;
}

export function AppHeader({
  currentDatabaseName = "production-pg",
  role = "DBA",
  onOpenQuickQuery,
  onToggleMobileMenu,
}: AppHeaderProps) {
  const pathname = usePathname();

  // Convert pathname into breadcrumb
  const segments = pathname.split("/").filter(Boolean);
  const title = segments[0] ? segments[0].replace("-", " ") : "Overview";

  return (
    <header className="h-12 border-b border-border bg-sidebar/80 backdrop-blur px-3 sm:px-4 flex items-center justify-between shrink-0 select-none z-20">
      {/* Mobile Menu & Breadcrumb path */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
        {/* Mobile Hamburger Drawer Trigger */}
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-1.5 -ml-1 rounded text-muted-foreground hover:text-foreground hover:bg-panel cursor-pointer shrink-0 transition-colors"
          aria-label="Toggle navigation drawer"
          title="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <BrandLogo
          width={22}
          height={22}
          className="h-5 w-5 mr-0.5 shrink-0"
          priority
        />
        <span className="font-mono text-muted-foreground/80 font-medium hidden sm:inline">
          chronos
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/60 hidden sm:inline" />
        <span className="font-medium text-foreground capitalize truncate text-xs sm:text-xs">
          {title}
        </span>
        {segments.length > 1 && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <span className="font-mono text-primary truncate max-w-[120px]">
              {segments[1]}
            </span>
          </>
        )}
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Database indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded border border-border bg-panel text-xs max-w-[140px] sm:max-w-[200px]">
          <Database className="h-3 w-3 text-primary shrink-0" />
          <span className="font-mono text-[10px] sm:text-[11px] text-foreground truncate">
            {currentDatabaseName}
          </span>
          <StatusIndicator status="active" />
        </div>

        {/* Role badge */}
        <Badge
          variant="outline"
          className="text-[9px] sm:text-[10px] font-mono capitalize hidden xs:inline-flex px-1.5"
        >
          <Shield className="h-2.5 w-2.5 mr-1 text-primary hidden sm:inline" />
          {role}
        </Badge>
      </div>
    </header>
  );
}
