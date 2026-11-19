"use client";

import * as React from "react";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { AppHeader } from "@/components/navigation/app-header";
import { useRouter, usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/components/shared/theme-provider";
import type { AuthenticatedSession } from "@/lib/auth/session";
import {
  installGlobalAuthInterceptor,
  startSessionWatchdog,
  performLogout,
  handleSessionRevocation,
} from "@/lib/auth/auth-client";

interface StudioLayoutProps {
  children: React.ReactNode;
  initialSession?: AuthenticatedSession | null;
}

export function StudioLayout({ children, initialSession }: StudioLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { setTheme } = useTheme();

  // Synchronize server-side user theme preference on initial mount
  const serverTheme = initialSession?.preferences?.theme;
  React.useEffect(() => {
    if (serverTheme && (serverTheme === "light" || serverTheme === "dark" || serverTheme === "system")) {
      const currentStored = typeof window !== "undefined" ? localStorage.getItem("chronos_theme") : null;
      if (currentStored !== serverTheme) {
        setTheme(serverTheme as "light" | "dark" | "system");
      }
    }
  }, [serverTheme, setTheme]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState<boolean>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("chronos_sidebar_pref") === "collapsed";
      }
      return false;
    },
  );
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

  const [workspacesList, setWorkspacesList] = React.useState<
    Array<{
      id: string;
      name: string;
      slug?: string;
      environment: string;
      role?: string;
    }>
  >(() => initialSession?.workspaces || []);

  const [currentDatabase, setCurrentDatabase] = React.useState(() => ({
    id: initialSession?.currentDatabase?.id || "",
    name: initialSession?.currentDatabase?.name || "No database selected",
    status: initialSession?.currentDatabase?.status || "active",
  }));

  const handleWorkspaceChange = React.useCallback(
    (
      newWs: { id: string; name: string; environment?: string },
      newDb?: { id: string; name: string; status?: string } | null,
    ) => {
      setCurrentWorkspace({
        id: newWs.id,
        name: newWs.name,
        environment: newWs.environment || "development",
      });
      if (newDb) {
        setCurrentDatabase({
          id: newDb.id,
          name: newDb.name,
          status: newDb.status || "active",
        });
      } else {
        setCurrentDatabase({
          id: "",
          name: "No database selected",
          status: "none",
        });
      }

      // Broadcast workspace changed event for all client modules to clear stale data
      window.dispatchEvent(
        new CustomEvent("chronos:workspace-changed", {
          detail: { workspace: newWs, database: newDb },
        }),
      );

      router.refresh();
    },
    [router],
  );

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
    if (initialSession?.workspaces) {
      setWorkspacesList(initialSession.workspaces);
    }
    if (initialSession?.currentWorkspace) {
      setCurrentWorkspace({
        id: initialSession.currentWorkspace.id,
        name: initialSession.currentWorkspace.name,
        environment:
          initialSession.currentWorkspace.environment || "development",
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
          handleSessionRevocation("SESSION_REVOKED");
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
          if (data.workspaces) {
            setWorkspacesList(data.workspaces);
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
              if (pref?.theme && (pref.theme === "light" || pref.theme === "dark" || pref.theme === "system")) {
                const currentStored = typeof window !== "undefined" ? localStorage.getItem("chronos_theme") : null;
                if (currentStored !== pref.theme) {
                  setTheme(pref.theme);
                }
              }
              if (pref?.sidebarPreference) {
                const shouldCollapse = pref.sidebarPreference === "collapsed";
                setIsSidebarCollapsed(shouldCollapse);
                try {
                  localStorage.setItem(
                    "chronos_sidebar_pref",
                    pref.sidebarPreference,
                  );
                } catch {}
              }
              if (pref?.displayName) {
                setCurrentUser((prev) => ({
                  ...prev,
                  fullName: pref.displayName,
                }));
              }
              try {
                if (pref?.timezone)
                  localStorage.setItem("chronos_timezone", pref.timezone);
                if (pref?.dateFormat)
                  localStorage.setItem("chronos_date_format", pref.dateFormat);
                if (pref?.timeFormat)
                  localStorage.setItem("chronos_time_format", pref.timeFormat);
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

    const handleWorkspacesUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<
        Array<{ id: string; name: string; slug?: string; environment: string }>
      >;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setWorkspacesList(customEvent.detail);
      } else if (currentOrg.id) {
        fetch(`/api/v1/workspaces?organizationId=${currentOrg.id}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.workspaces) setWorkspacesList(d.workspaces);
          })
          .catch(() => {});
      }
    };
    window.addEventListener(
      "chronos:workspaces-updated",
      handleWorkspacesUpdated,
    );

    return () => {
      window.removeEventListener("chronos:sidebar-pref", handlePrefChange);
      window.removeEventListener(
        "chronos:settings-updated",
        handleSettingsChange,
      );
      window.removeEventListener(
        "chronos:workspaces-updated",
        handleWorkspacesUpdated,
      );
    };
  }, []);

  const handleToggleSidebar = React.useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  const handleLogout = () => {
    performLogout();
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Desktop / Tablet Sidebar */}
      <AppSidebar
        currentOrg={currentOrg}
        currentWorkspace={currentWorkspace}
        currentDatabase={currentDatabase}
        workspaces={workspacesList}
        user={currentUser}
        onLogout={handleLogout}
        onWorkspaceChange={handleWorkspaceChange}
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
              workspaces={workspacesList}
              user={currentUser}
              onLogout={handleLogout}
              onWorkspaceChange={handleWorkspaceChange}
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
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 sm:py-4 lg:px-8 lg:py-5 xl:py-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
