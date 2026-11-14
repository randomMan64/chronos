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

interface StudioLayoutProps {
  children: React.ReactNode;
}

export function StudioLayout({ children }: StudioLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();

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
  }>({
    email: "admin@chronos.internal",
    fullName: "System Administrator",
  });

  const [currentOrg, setCurrentOrg] = React.useState({
    id: "org-1",
    name: "Enterprise Core",
    role: "owner",
  });

  const [currentWorkspace, setCurrentWorkspace] = React.useState({
    id: "ws-1",
    name: "Primary Cluster",
    environment: "production",
  });

  const [currentDatabase, setCurrentDatabase] = React.useState({
    id: "db-1",
    name: "neon-primary-pg",
    status: "active",
  });

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

  React.useEffect(() => {
    // Fetch active session info
    async function loadSession() {
      try {
        const res = await fetch("/api/v1/auth/me");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setCurrentUser({
              email: data.user.email,
              fullName: data.user.fullName,
            });
          }
          if (data.organizations?.[0]) {
            setCurrentOrg({
              id: data.organizations[0].id,
              name: data.organizations[0].name,
              role: data.organizations[0].role || "owner",
            });
          }
          if (data.workspaces?.[0]) {
            setCurrentWorkspace({
              id: data.workspaces[0].id,
              name: data.workspaces[0].name,
              environment: data.workspaces[0].environment || "development",
            });
          }

          // Fetch user appearance preferences for sidebar
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
            }
          } catch {}
        }
      } catch {
        // Fallback to default state
      }
    }
    loadSession();

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
    return () => window.removeEventListener("chronos:sidebar-pref", handlePrefChange);
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
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 sm:px-4 md:px-5">
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
                Sign Out
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Are you sure you want to end your current session?
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-sidebar/50 my-1">
            <div className="h-9 w-9 rounded-full bg-elevated border border-border flex items-center justify-center font-mono text-xs font-semibold text-foreground shrink-0">
              {currentUser.fullName
                ? currentUser.fullName[0].toUpperCase()
                : "U"}
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
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmLogout}
              isLoading={isLoggingOut}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="space-y-1.5 pb-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <LogOut className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Confirm Sign Out
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Are you sure you want to end your current session and sign out of CHRONOS?
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-sidebar/50 my-1">
            <div className="h-9 w-9 rounded-full bg-elevated border border-border flex items-center justify-center font-mono text-xs font-semibold text-foreground shrink-0">
              {currentUser.fullName ? currentUser.fullName[0].toUpperCase() : "U"}
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
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmLogout}
              isLoading={isLoggingOut}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
