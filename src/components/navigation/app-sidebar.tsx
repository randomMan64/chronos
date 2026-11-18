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
  ChevronsUpDown,
  Check,
  Loader2,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";

interface AppSidebarProps {
  currentOrg?: { id: string; name: string; role?: string };
  currentWorkspace?: { id: string; name: string; environment?: string };
  currentDatabase?: { id: string; name: string; status?: string };
  workspaces?: Array<{ id: string; name: string; slug?: string; environment: string; role?: string }>;
  user?: { email: string; fullName: string; avatarUrl?: string | null };
  permissions?: string[];
  onLogout?: () => void;
  onWorkspaceChange?: (
    workspace: { id: string; name: string; environment: string },
    database?: { id: string; name: string; status?: string } | null
  ) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  isMobile?: boolean;
}

export function AppSidebar({
  currentOrg,
  currentWorkspace,
  currentDatabase,
  workspaces = [],
  user,
  onLogout,
  onWorkspaceChange,
  isCollapsed = false,
  onToggleCollapse,
  onClose,
  isMobile = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [wsMenuOpen, setWsMenuOpen] = React.useState(false);
  const [isSwitchingWs, setIsSwitchingWs] = React.useState(false);
  const [wsSwitchError, setWsSwitchError] = React.useState<string | null>(null);
  const { t } = useTranslation();

  const safeOrg = currentOrg || { id: "", name: "", role: "" };
  const safeWorkspace = currentWorkspace || { id: "", name: "", environment: "" };
  const safeDatabase = currentDatabase || { id: "", name: "", status: "" };
  const safeUser = user || { email: "", fullName: "", avatarUrl: null };

  const handleSelectWorkspace = async (ws: { id: string; name: string; environment?: string }) => {
    if (ws.id === safeWorkspace.id) {
      setWsMenuOpen(false);
      return;
    }
    setIsSwitchingWs(true);
    setWsSwitchError(null);
    try {
      const res = await fetch("/api/v1/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: ws.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to switch workspace");
      }

      const data = await res.json();
      setWsMenuOpen(false);
      if (onWorkspaceChange) {
        onWorkspaceChange(data.workspace, data.database);
      }
    } catch (err: any) {
      console.error("Workspace switch failed:", err);
      setWsSwitchError(err.message || "Failed to switch workspace");
    } finally {
      setIsSwitchingWs(false);
    }
  };

  const navigationItems = [
    {
      title: t("nav.overview"),
      href: "/dashboard",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      title: t("nav.databaseExplorer"),
      href: "/explorer",
      icon: Database,
      badge: null,
    },
    {
      title: t("nav.sqlGateway"),
      href: "/sql-editor",
      icon: Terminal,
      badge: null,
    },
    {
      title: t("nav.timeTravel"),
      href: "/temporal",
      icon: Clock,
      badge: "Core",
    },
    {
      title: t("nav.transactionInspector"),
      href: "/transactions",
      icon: Activity,
      badge: null,
    },
    {
      title: t("nav.queryAnalyzer"),
      href: "/analyzer",
      icon: Layers,
      badge: null,
    },
    {
      title: t("nav.auditCenter"),
      href: "/audit",
      icon: ShieldCheck,
      badge: null,
    },
    {
      title: t("nav.backupRecovery"),
      href: "/backups",
      icon: Archive,
      badge: null,
    },
    {
      title: t("nav.settingsIam"),
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
          ? "w-70 max-w-[85vw]"
          : cn("hidden md:flex", isCollapsed ? "w-16" : "w-60")
      )}
    >
      {/* Top Organization & Brand section */}
      <div className="overflow-y-auto overflow-x-hidden flex-1 scrollbar-thin">
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
                  {t("nav.organization")}
                </span>
                {safeOrg.name ? (
                  <span className="font-medium text-foreground truncate text-[11px]">
                    {safeOrg.name}
                  </span>
                ) : (
                  <div className="h-3 w-20 bg-muted/40 rounded animate-pulse my-0.5" />
                )}
              </div>
              {safeOrg.role && (
                <Badge variant="secondary" className="text-[9px] capitalize shrink-0 ml-1">
                  {safeOrg.role}
                </Badge>
              )}
            </div>

            {/* Workspace & Environment Switcher */}
            <DropdownMenu open={wsMenuOpen} onOpenChange={setWsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isSwitchingWs}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-panel focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer transition-colors text-xs text-left group"
                >
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider flex items-center gap-1">
                      {t("nav.workspace")}
                      {isSwitchingWs && <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />}
                    </span>
                    {safeWorkspace.name ? (
                      <span className="font-medium text-foreground truncate text-[11px] group-hover:text-primary transition-colors">
                        {safeWorkspace.name}
                      </span>
                    ) : (
                      <div className="h-3 w-16 bg-muted/40 rounded animate-pulse my-0.5" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {safeWorkspace.environment && (
                      <Badge
                        variant={
                          safeWorkspace.environment === "production"
                            ? "destructive"
                            : safeWorkspace.environment === "staging"
                            ? "warning"
                            : "info"
                        }
                        className="text-[9px] capitalize shrink-0"
                      >
                        {safeWorkspace.environment}
                      </Badge>
                    )}
                    <ChevronsUpDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 p-1 z-50">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono px-2 py-1">
                  Accessible Workspaces
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {wsSwitchError && (
                  <div className="p-2 text-[10px] text-destructive bg-destructive/10 rounded mb-1">
                    {wsSwitchError}
                  </div>
                )}
                {workspaces.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground font-mono">
                    No accessible workspaces
                  </div>
                ) : (
                  workspaces.map((ws) => {
                    const isActive = ws.id === safeWorkspace.id;
                    return (
                      <DropdownMenuItem
                        key={ws.id}
                        onClick={() => handleSelectWorkspace(ws)}
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 cursor-pointer text-xs rounded",
                          isActive && "bg-elevated font-medium text-primary"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 mr-1">
                          <Check
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              isActive ? "opacity-100 text-primary" : "opacity-0"
                            )}
                          />
                          <span className="truncate">{ws.name}</span>
                        </div>
                        <Badge
                          variant={
                            ws.environment === "production"
                              ? "destructive"
                              : ws.environment === "staging"
                              ? "warning"
                              : "info"
                          }
                          className="text-[8px] uppercase px-1 py-0 h-4 shrink-0"
                        >
                          {ws.environment}
                        </Badge>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Connected Database */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-panel/60 border border-border/60 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <Server className="h-3 w-3 text-primary shrink-0" />
                <span className="font-mono text-[11px] text-foreground truncate">
                  {safeDatabase.name || "None"}
                </span>
              </div>
              {safeDatabase.status && <StatusIndicator status="active" />}
            </div>
          </div>
        ) : (
          <div className="p-2 border-b border-border flex flex-col items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 rounded-md bg-panel/70 hover:bg-panel flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={`Workspace: ${safeWorkspace.name || "None"} (${safeWorkspace.environment || ""})`}
                >
                  <Layers className="h-4 w-4 text-primary" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-56 p-1 z-50">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono px-2 py-1">
                  Accessible Workspaces
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workspaces.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground font-mono">
                    No accessible workspaces
                  </div>
                ) : (
                  workspaces.map((ws) => {
                    const isActive = ws.id === safeWorkspace.id;
                    return (
                      <DropdownMenuItem
                        key={ws.id}
                        onClick={() => handleSelectWorkspace(ws)}
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 cursor-pointer text-xs rounded",
                          isActive && "bg-elevated font-medium text-primary"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 mr-1">
                          <Check
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              isActive ? "opacity-100 text-primary" : "opacity-0"
                            )}
                          />
                          <span className="truncate">{ws.name}</span>
                        </div>
                        <Badge
                          variant={
                            ws.environment === "production"
                              ? "destructive"
                              : ws.environment === "staging"
                              ? "warning"
                              : "info"
                          }
                          className="text-[8px] uppercase px-1 py-0 h-4 shrink-0"
                        >
                          {ws.environment}
                        </Badge>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <div
              className="h-8 w-8 rounded-md bg-panel flex items-center justify-center text-primary"
              title={safeDatabase.name ? `Connected: ${safeDatabase.name}` : undefined}
            >
              <Server className="h-4 w-4" />
            </div>
          </div>
        )}

        {/* Nav Links */}
        <nav className="p-2 space-y-0.5">
          {(!isCollapsed || isMobile) && (
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {t("nav.modules")}
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
                    : "justify-between px-2.5 py-2 min-h-9.5",
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
              title={safeUser.fullName || safeUser.email}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-7 w-7 rounded-full bg-elevated border border-border flex items-center justify-center text-[10px] font-mono text-foreground shrink-0 font-semibold group-hover:border-foreground/30 transition-colors overflow-hidden tracking-tighter"
                >
                  {safeUser.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeUser.avatarUrl}
                      alt={safeUser.fullName || "User"}
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : safeUser.fullName || safeUser.email ? (
                    getInitials(safeUser.fullName || safeUser.email)
                  ) : (
                    <div className="h-full w-full bg-muted/40 animate-pulse" />
                  )}
                </div>
                {(!isCollapsed || isMobile) && (
                  <div className="flex flex-col min-w-0">
                    {safeUser.fullName ? (
                      <span className="text-[11px] font-medium text-foreground truncate leading-tight">
                        {safeUser.fullName}
                      </span>
                    ) : (
                      <div className="h-3 w-16 bg-muted/40 rounded animate-pulse mb-1" />
                    )}
                    {safeUser.email ? (
                      <span className="text-[10px] text-muted-foreground truncate font-mono">
                        {safeUser.email}
                      </span>
                    ) : (
                      <div className="h-2.5 w-24 bg-muted/30 rounded animate-pulse" />
                    )}
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
                <div className="h-8 w-8 rounded-full bg-elevated border border-border flex items-center justify-center text-xs font-mono text-foreground shrink-0 font-semibold overflow-hidden">
                  {safeUser.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeUser.avatarUrl}
                      alt={safeUser.fullName || "User"}
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : safeUser.fullName || safeUser.email ? (
                    getInitials(safeUser.fullName || safeUser.email)
                  ) : (
                    <div className="h-full w-full bg-muted/40 animate-pulse" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {safeUser.fullName || safeUser.email || "Account"}
                  </span>
                  {safeUser.email && (
                    <span className="text-[10px] text-muted-foreground truncate font-mono">
                      {safeUser.email}
                    </span>
                  )}
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
                    <span className="text-xs font-medium text-foreground">{t("nav.myProfile")}</span>
                    <span className="text-[10px] text-muted-foreground">{t("account.myProfile")}</span>
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
                    <span className="text-xs font-medium text-foreground">{t("nav.accountSettings")}</span>
                    <span className="text-[10px] text-muted-foreground">{t("settings.description")}</span>
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
                    <span className="text-xs font-medium text-foreground">{t("nav.security")}</span>
                    <span className="text-[10px] text-muted-foreground">{t("account.security")}</span>
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
                    <span className="text-xs font-medium text-foreground">{t("nav.appearance")}</span>
                    <span className="text-[10px] text-muted-foreground">{t("account.appearance")}</span>
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
              <span>{t("nav.signOut")}</span>
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
            title={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            aria-label={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
            ) : (
              <>
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {t("nav.collapseSidebar")}
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
