"use client";

import * as React from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Terminal,
  Clock,
  Activity,
  ShieldCheck,
  Archive,
  Settings,
  Layers,
  Server,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  X,
  Building2,
  User,
  Shield,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AppSidebarProps {
  currentOrg?: { id: string; name: string; role?: string };
  currentWorkspace?: { id: string; name: string; environment?: string };
  currentDatabase?: { id: string; name: string; status?: string };
  user?: { email: string; fullName: string };
  permissions?: string[];
  onLogout?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  isMobile?: boolean;
}

export function AppSidebar({
  currentOrg = { id: "default", name: "Acme Corp", role: "owner" },
  currentWorkspace = { id: "ws-primary", name: "Primary", environment: "development" },
  currentDatabase = { id: "db-main", name: "production-pg", status: "active" },
  user = { email: "admin@chronos.internal", fullName: "Admin User" },
  onLogout,
  isCollapsed = false,
  onToggleCollapse,
  onClose,
  isMobile = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  const navigationItems = [
    {
      title: "Overview",
      href: "/dashboard",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      title: "Database Explorer",
      href: "/explorer",
      icon: Database,
      badge: null,
    },
    {
      title: "SQL Gateway",
      href: "/sql-editor",
      icon: Terminal,
      badge: null,
    },
    {
      title: "Time Travel",
      href: "/temporal",
      icon: Clock,
      badge: "Core",
    },
    {
      title: "Transaction Inspector",
      href: "/transactions",
      icon: Activity,
      badge: null,
    },
    {
      title: "Query Analyzer",
      href: "/analyzer",
      icon: Layers,
      badge: null,
    },
    {
      title: "Audit Center",
      href: "/audit",
      icon: ShieldCheck,
      badge: null,
    },
    {
      title: "Backup & Recovery",
      href: "/backups",
      icon: Archive,
      badge: null,
    },
    {
      title: "Settings & IAM",
      href: "/settings",
      icon: Settings,
      badge: null,
    },
  ];

  const handleLinkClick = () => {
    if (isMobile && onClose) {
      onClose();
    }
  };

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-border bg-sidebar flex flex-col justify-between h-screen select-none transition-all duration-200 z-30",
        isMobile
          ? "w-[280px] max-w-[85vw]"
          : cn("hidden md:flex", isCollapsed ? "w-16" : "w-[240px]")
      )}
    >
      {/* Top Organization & Brand section */}
      <div className="overflow-y-auto overflow-x-hidden flex-1">
        {/* Brand header */}
        <div
          className={cn(
            "h-12 border-b border-border flex items-center justify-between shrink-0",
            isCollapsed && !isMobile ? "px-2 justify-center" : "px-3.5"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo
              width={28}
              height={28}
              className="h-7 w-7 drop-shadow-xs shrink-0"
              priority
            />
            {(!isCollapsed || isMobile) && (
              <span className="font-mono text-xs font-bold tracking-wider text-foreground truncate">
                CHRONOS
              </span>
            )}
          </div>
          {(!isCollapsed || isMobile) && (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                v1.0
              </Badge>
              {isMobile && (
                <button
                  onClick={onClose}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-panel cursor-pointer"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Organization / Workspace Context selector */}
        {(!isCollapsed || isMobile) ? (
          <div className="p-2 border-b border-border space-y-1">
            {/* Org Selector */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-panel cursor-pointer transition-colors text-xs">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">
                  Organization
                </span>
                <span className="font-medium text-foreground truncate text-[11px]">
                  {currentOrg.name}
                </span>
              </div>
              <Badge variant="secondary" className="text-[9px] capitalize shrink-0 ml-1">
                {currentOrg.role || "Member"}
              </Badge>
            </div>

            {/* Workspace & Environment */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-panel cursor-pointer transition-colors text-xs">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">
                  Workspace
                </span>
                <span className="font-medium text-foreground truncate text-[11px]">
                  {currentWorkspace.name}
                </span>
              </div>
              <Badge
                variant={
                  currentWorkspace.environment === "production"
                    ? "destructive"
                    : currentWorkspace.environment === "staging"
                    ? "warning"
                    : "info"
                }
                className="text-[9px] shrink-0 ml-1"
              >
                {currentWorkspace.environment || "dev"}
              </Badge>
            </div>

            {/* Connected Database */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-panel/60 border border-border/60 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <Server className="h-3 w-3 text-primary shrink-0" />
                <span className="font-mono text-[11px] text-foreground truncate">
                  {currentDatabase.name}
                </span>
              </div>
              <StatusIndicator status="active" />
            </div>
          </div>
        ) : (
          <div className="p-2 border-b border-border flex flex-col items-center gap-2">
            <div
              className="h-8 w-8 rounded-md bg-panel flex items-center justify-center text-primary"
              title={`Connected: ${currentDatabase.name}`}
            >
              <Server className="h-4 w-4" />
            </div>
          </div>
        )}

        {/* Nav Links */}
        <nav className="p-2 space-y-0.5">
          {(!isCollapsed || isMobile) && (
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Modules
            </div>
          )}
          {navigationItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleLinkClick}
                title={isCollapsed && !isMobile ? item.title : undefined}
                className={cn(
                  "flex items-center rounded text-xs transition-colors cursor-pointer",
                  isCollapsed && !isMobile
                    ? "h-9 w-full justify-center"
                    : "justify-between px-2.5 py-2 min-h-[38px]",
                  isActive
                    ? "bg-elevated text-foreground font-medium border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-panel hover:text-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-2.5 truncate",
                    isCollapsed && !isMobile && "justify-center"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  {(!isCollapsed || isMobile) && <span className="truncate">{item.title}</span>}
                </div>
                {(!isCollapsed || isMobile) && item.badge && (
                  <Badge variant="info" className="text-[9px] px-1 py-0 font-mono">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User profile and account popup */}
      <div className="p-2 border-t border-border bg-sidebar/50 shrink-0">
        <Popover open={userMenuOpen} onOpenChange={setUserMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "w-full flex items-center rounded-lg transition-colors text-left group cursor-pointer hover:bg-panel",
                isCollapsed && !isMobile ? "justify-center p-1.5" : "justify-between px-2 py-1.5"
              )}
              title={user.fullName}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-7 w-7 rounded-full bg-elevated border border-border flex items-center justify-center text-[11px] font-mono text-foreground shrink-0 font-semibold group-hover:border-foreground/30 transition-colors"
                >
                  {user.fullName ? user.fullName[0].toUpperCase() : "U"}
                </div>
                {(!isCollapsed || isMobile) && (
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-medium text-foreground truncate leading-tight">
                      {user.fullName}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate font-mono">
                      {user.email}
                    </span>
                  </div>
                )}
              </div>
              {(!isCollapsed || isMobile) && (
                <ChevronUp
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                    userMenuOpen ? "transform rotate-180" : ""
                  )}
                />
              )}
            </button>
          </PopoverTrigger>

          <PopoverContent
            side={isCollapsed && !isMobile ? "right" : "top"}
            align={isCollapsed && !isMobile ? "end" : "start"}
            sideOffset={8}
            className="w-64 p-1.5 bg-popover/95 backdrop-blur-sm border border-border rounded-xl shadow-2xl text-xs"
          >
            {/* Header info */}
            <div className="flex items-center px-2.5 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-full bg-elevated border border-border flex items-center justify-center text-xs font-mono text-foreground shrink-0 font-semibold">
                  {user.fullName ? user.fullName[0].toUpperCase() : "U"}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {user.fullName}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate font-mono">
                    {user.email}
                  </span>
                </div>
              </div>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Menu options */}
            <div className="space-y-0.5">
              <Link
                href="/account/profile"
                onClick={() => {
                  setUserMenuOpen(false);
                  if (isMobile && onClose) onClose();
                }}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-panel transition-colors text-foreground group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <User className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-xs font-medium text-foreground">My Profile</span>
                    <span className="text-[10px] text-muted-foreground">Personal information</span>
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground shrink-0" />
              </Link>

              <Link
                href="/account/settings"
                onClick={() => {
                  setUserMenuOpen(false);
                  if (isMobile && onClose) onClose();
                }}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-panel transition-colors text-foreground group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Settings className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-xs font-medium text-foreground">Account Settings</span>
                    <span className="text-[10px] text-muted-foreground">Preferences and security</span>
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground shrink-0" />
              </Link>

              <Link
                href="/account/security"
                onClick={() => {
                  setUserMenuOpen(false);
                  if (isMobile && onClose) onClose();
                }}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-panel transition-colors text-foreground group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Shield className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-xs font-medium text-foreground">Security</span>
                    <span className="text-[10px] text-muted-foreground">Password and active sessions</span>
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground shrink-0" />
              </Link>

              <Link
                href="/account/appearance"
                onClick={() => {
                  setUserMenuOpen(false);
                  if (isMobile && onClose) onClose();
                }}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-panel transition-colors text-foreground group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Monitor className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                  <div className="flex flex-col min-w-0 text-left">
                    <span className="text-xs font-medium text-foreground">Appearance</span>
                    <span className="text-[10px] text-muted-foreground">Theme and display</span>
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground shrink-0" />
              </Link>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Sign out */}
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                if (isMobile && onClose) onClose();
                onLogout?.();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-xs font-medium cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sign out</span>
            </button>
          </PopoverContent>
        </Popover>

        {/* Sidebar collapse/expand toggle on bottom side */}
        {!isMobile && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "w-full flex items-center rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-panel cursor-pointer group",
              isCollapsed
                ? "justify-center p-1.5 h-8 mt-1"
                : "justify-between px-2 py-1.5 h-8 mt-1"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
            ) : (
              <>
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  Collapse sidebar
                </span>
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:-translate-x-0.5" />
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
