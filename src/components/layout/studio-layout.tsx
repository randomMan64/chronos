"use client";

import * as React from "react";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { AppHeader } from "@/components/navigation/app-header";
import { useRouter, usePathname } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getInitials } from "@/lib/utils";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { installGlobalAuthInterceptor, startSessionWatchdog } from "@/lib/auth/auth-client";

interface StudioLayoutProps {
  children: React.ReactNode;
  initialSession?: AuthenticatedSession | null;
}

export function StudioLayout({ children, initialSession }: StudioLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chronos_sidebar_pref") === "collapsed";
    }
    return false;
  });
  const [showLogoutDialog, setShowLogoutDialog] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const [currentUser, setCurrentUser] = React.useState<{
    email: string;
    fullName: string;
    avatarUrl?: string | null;
  }>(() => ({
    email: initialSession?.user?.email || "",
    fullName: initialSession?.user?.fullName || "",
    avatarUrl: initialSession?.user?.avatarUrl ?? null,
  }));

  const [currentOrg, setCurrentOrg] = React.useState(() => ({
    id: initialSession?.currentOrg?.id || "",
    name: initialSession?.currentOrg?.name || "",
    role: initialSession?.currentOrg?.role || "member",
  }));

  const [currentWorkspace, setCurrentWorkspace] = React.useState(() => ({
    id: initialSession?.currentWorkspace?.id || "",
    name: initialSession?.currentWorkspace?.name || "",
    environment: initialSession?.currentWorkspace?.environment || "development",
  }));

  const [currentDatabase, setCurrentDatabase] = React.useState(() => ({
    id: initialSession?.currentDatabase?.id || "",
    name: initialSession?.currentDatabase?.name || "No database selected",
    status: initialSession?.currentDatabase?.status || "active",
  }));

  // Sync state if initialSession updates
  React.useEffect(() => {
    if (initialSession?.user) {
      setCurrentUser({
        email: initialSession.user.email,
        fullName: initialSession.user.fullName,
        avatarUrl: initialSession.user.avatarUrl ?? null,
      });
    }
    if (initialSession?.currentOrg) {
      setCurrentOrg({
        id: initialSession.currentOrg.id,
        name: initialSession.currentOrg.name,
        role: initialSession.currentOrg.role || "member",
      });
    }
    if (initialSession?.currentWorkspace) {
      setCurrentWorkspace({
        id: initialSession.currentWorkspace.id,
        name: initialSession.currentWorkspace.name,
        environment: initialSession.currentWorkspace.environment || "development",
      });
    }
    if (initialSession?.currentDatabase) {
      setCurrentDatabase({
        id: initialSession.currentDatabase.id,
        name: initialSession.currentDatabase.name,
        status: initialSession.currentDatabase.status || "active",
      });
    }
  }, [initialSession]);

  // Automatically close mobile menu on route change
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Handle escape key to close mobile drawer
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  // 1. Centralized global 401 interceptor & session watchdog
  React.useEffect(() => {
    const uninstallInterceptor = installGlobalAuthInterceptor();
    const stopWatchdog = startSessionWatchdog();

    return () => {
      uninstallInterceptor();
      stopWatchdog();
    };
  }, []);

  // 2. Initial profile and environment loader (runs ONCE on mount, not continuously polled)
  React.useEffect(() => {
    let isCancelled = false;

    async function loadInitialProfile() {
      try {
        const res = await fetch("/api/v1/auth/me", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/login?reason=SESSION_REVOKED";
          return;
        }

        if (res.ok && !isCancelled) {
          const data = await res.json();
          if (data.user) {
            setCurrentUser({
              email: data.user.email,
              fullName: data.user.fullName,
              avatarUrl: data.user.avatarUrl || null,
            });
          }
          if (data.currentOrg) {
            setCurrentOrg({
              id: data.currentOrg.id,
              name: data.currentOrg.name,
              role: data.currentOrg.role || "member",
            });
          } else if (data.organizations?.[0]) {
            setCurrentOrg({
              id: data.organizations[0].id,
              name: data.organizations[0].name,
              role: data.organizations[0].role || "member",
            });
          }
          if (data.currentWorkspace) {
            setCurrentWorkspace({
              id: data.currentWorkspace.id,
              name: data.currentWorkspace.name,
              environment: data.currentWorkspace.environment || "development",
            });
          } else if (data.workspaces?.[0]) {
            setCurrentWorkspace({
              id: data.workspaces[0].id,
              name: data.workspaces[0].name,
              environment: data.workspaces[0].environment || "development",
            });
          }
          if (data.currentDatabase) {
            setCurrentDatabase({
              id: data.currentDatabase.id,
              name: data.currentDatabase.name,
              status: data.currentDatabase.status || "active",
            });
          } else if (data.databases?.[0]) {
            setCurrentDatabase({
              id: data.databases[0].id,
              name: data.databases[0].name,
              status: data.databases[0].status || "active",
            });
          }

          // Fetch user preferences (appearance & localization)
          try {
            const prefRes = await fetch("/api/v1/account/preferences");
            if (prefRes.ok) {
              const prefJson = await prefRes.json();
              const pref = prefJson.preferences || prefJson;
              if (pref?.sidebarPreference) {
                const shouldCollapse = pref.sidebarPreference === "collapsed";
                setIsSidebarCollapsed(shouldCollapse);
                try {
                  localStorage.setItem("chronos_sidebar_pref", pref.sidebarPreference);
                } catch {}
              }
              if (pref?.displayName) {
                setCurrentUser((prev) => ({
                  ...prev,
                  fullName: pref.displayName,
                }));
              }
              try {
                if (pref?.timezone) localStorage.setItem("chronos_timezone", pref.timezone);
                if (pref?.dateFormat) localStorage.setItem("chronos_date_format", pref.dateFormat);
                if (pref?.timeFormat) localStorage.setItem("chronos_time_format", pref.timeFormat);
                if (pref?.language) {
                  localStorage.setItem("chronos_language", pref.language);
                  document.documentElement.lang = pref.language;
                }
              } catch {}
            }
          } catch {
            // Non-critical preferences load failure
          }
        }
      } catch {
        // Network error during initial profile load
      }
    }

    loadInitialProfile();

    return () => {
      isCancelled = true;
    };
  }, []);

  React.useEffect(() => {
    // Listen to sidebar preference changes from appearance settings
    const handlePrefChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail === "collapsed") {
        setIsSidebarCollapsed(true);
      } else if (customEvent.detail === "expanded") {
        setIsSidebarCollapsed(false);
      }
    };
    window.addEventListener("chronos:sidebar-pref", handlePrefChange);

    // Listen to general account settings changes (display name, language, avatar, etc.)
    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<{
        displayName?: string;
        timezone?: string;
        dateFormat?: string;
        timeFormat?: string;
        language?: string;
        avatarUrl?: string | null;
      }>;
      const detail = customEvent.detail;
      if (detail?.displayName) {
        setCurrentUser((prev) => ({
          ...prev,
          fullName: detail.displayName!,
        }));
      }
      if (detail?.avatarUrl !== undefined) {
        setCurrentUser((prev) => ({
          ...prev,
          avatarUrl: detail.avatarUrl,
        }));
      }
      if (detail?.language) {
        document.documentElement.lang = detail.language;
      }
    };
    window.addEventListener("chronos:settings-updated", handleSettingsChange);

    return () => {
      window.removeEventListener("chronos:sidebar-pref", handlePrefChange);
      window.removeEventListener("chronos:settings-updated", handleSettingsChange);
    };
  }, []);

  const handleToggleSidebar = React.useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  const handleTriggerLogout = () => {
    setShowLogoutDialog(true);
  };

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Desktop / Tablet Sidebar */}
      <AppSidebar
        currentOrg={currentOrg}
        currentWorkspace={currentWorkspace}
        currentDatabase={currentDatabase}
        user={currentUser}
        onLogout={handleTriggerLogout}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      {/* Mobile Navigation Drawer & Backdrop */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div className="relative z-50 animate-in slide-in-from-left duration-200">
            <AppSidebar
              currentOrg={currentOrg}
              currentWorkspace={currentWorkspace}
              currentDatabase={currentDatabase}
              user={currentUser}
              onLogout={handleTriggerLogout}
              isMobile={true}
              onClose={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <AppHeader
          currentDatabaseName={currentDatabase.name}
          role={currentOrg.role?.toUpperCase() || "OWNER"}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 sm:py-4 lg:px-8 lg:py-5 xl:px-10 xl:py-6 2xl:px-12">
          {children}
        </main>
      </div>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="space-y-1.5 pb-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <LogOut className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground -mt-1">
                {t("account.signOut")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              {t("account.signOutConfirm")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-sidebar/50 my-1">
            <div className="h-9 w-9 rounded-full bg-elevated border border-border flex items-center justify-center font-mono text-xs font-semibold text-foreground shrink-0 overflow-hidden">
              {currentUser.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className="h-full w-full object-cover rounded-full"
                />
              ) : (
                getInitials(currentUser.fullName)
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-foreground truncate">
                {currentUser.fullName}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground truncate">
                {currentUser.email}
              </span>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowLogoutDialog(false)}
              disabled={isLoggingOut}
              className="h-8 text-xs cursor-pointer"
            >
              {t("account.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmLogout}
              isLoading={isLoggingOut}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" /> {t("account.signOut")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
