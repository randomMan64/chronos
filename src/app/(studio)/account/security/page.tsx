"use client";

import { AccountNav } from "@/components/account/account-nav";
import { DismissibleAlert } from "@/components/shared/dismissible-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Globe,
  History,
  KeyRound,
  Laptop,
  LogOut,
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

interface DeviceInfo {
  id?: string | null;
  name: string;
  type: "desktop" | "laptop" | "mobile" | "tablet" | "unknown" | string;
  manufacturer?: string | null;
  model?: string | null;
  operatingSystem: string;
  operatingSystemVersion?: string | null;
  browser: string;
  browserVersion?: string | null;
  firstSeenAt?: string | Date | null;
  lastSeenAt?: string | Date | null;
}

interface SessionItem {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  location?: string | null;
  createdAt: string;
  lastActiveAt?: string | null;
  expiresAt?: string | null;
  isCurrent: boolean;
  device?: DeviceInfo;
}

interface LoginEvent {
  id: string;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp?: string | Date | null;
  createdAt?: string | Date | null;
  metadata?: unknown;
}

interface SecurityData {
  sessions: SessionItem[];
  loginHistory: LoginEvent[];
}

function getDeviceIcon(type?: string) {
  switch (type?.toLowerCase()) {
    case "mobile":
      return <Smartphone className="h-4 w-4 text-primary" />;
    case "tablet":
      return <Tablet className="h-4 w-4 text-primary" />;
    case "laptop":
      return <Laptop className="h-4 w-4 text-primary" />;
    default:
      return <Monitor className="h-4 w-4 text-primary" />;
  }
}

function SecuritySkeleton() {
  return (
    <div className="space-y-6">
      {/* Change Password Card */}
      <Card className="border-border/80 bg-panel/40">
        <CardHeader className="pb-4 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-72" />
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-8 w-full" />
          </div>
          <Skeleton className="h-8 w-32 mt-2" />
        </CardContent>
      </Card>

      {/* Active Sessions Card */}
      <Card className="border-border/80 bg-panel/40">
        <CardHeader className="pb-3 space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3.5 rounded-lg border border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountSecurityPage() {
  const [data, setData] = React.useState<SecurityData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [isRevoking, setIsRevoking] = React.useState(false);
  const [showRevokeModal, setShowRevokeModal] = React.useState(false);
  const [sessionToRevoke, setSessionToRevoke] =
    React.useState<SessionItem | null>(null);
  const [isRevokingSingle, setIsRevokingSingle] = React.useState(false);
  const [loginHistoryPage, setLoginHistoryPage] = React.useState(1);
  const LOGIN_HISTORY_PAGE_SIZE = 5;
  const [alert, setAlert] = React.useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset: resetPasswordForm,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const loadSecurityData = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/v1/account/security/sessions");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Quietly use local default state; do not trigger error on initial render
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSecurityData();
  }, [loadSecurityData]);

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    try {
      setIsChangingPassword(true);
      setAlert(null);
      const res = await fetch("/api/v1/account/security/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update password");

      setAlert({
        type: "success",
        text: "Your password has been changed successfully. Other sessions have been signed out.",
      });
      resetPasswordForm();
      loadSecurityData();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to update password";
      setAlert({ type: "error", text: errorMsg });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleConfirmRevokeOthers = async () => {
    try {
      setIsRevoking(true);
      setAlert(null);
      const res = await fetch(
        "/api/v1/account/security/sessions/revoke-others",
        {
          method: "POST",
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to revoke sessions");

      setAlert({
        type: "success",
        text: "All other sessions have been revoked.",
      });
      setShowRevokeModal(false);
      loadSecurityData();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to revoke sessions";
      setAlert({ type: "error", text: errorMsg });
    } finally {
      setIsRevoking(false);
    }
  };

  const handleConfirmRevokeSingle = async () => {
    if (!sessionToRevoke) return;
    try {
      setIsRevokingSingle(true);
      setAlert(null);
      const res = await fetch(
        `/api/v1/account/security/sessions/${sessionToRevoke.id}`,
        {
          method: "DELETE",
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to revoke session");

      setAlert({
        type: "success",
        text: result.message || "Session revoked successfully.",
      });
      const wasCurrent = sessionToRevoke.isCurrent;
      setSessionToRevoke(null);

      if (wasCurrent) {
        window.location.href = "/login";
        return;
      }
      loadSecurityData();
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to revoke session";
      setAlert({ type: "error", text: errorMsg });
    } finally {
      setIsRevokingSingle(false);
    }
  };

  const totalLoginEvents = data?.loginHistory || [];
  const totalLoginPages =
    Math.ceil(totalLoginEvents.length / LOGIN_HISTORY_PAGE_SIZE) || 1;
  const paginatedLoginHistory = totalLoginEvents.slice(
    (loginHistoryPage - 1) * LOGIN_HISTORY_PAGE_SIZE,
    loginHistoryPage * LOGIN_HISTORY_PAGE_SIZE,
  );

  return (
    <div className="space-y-5 w-full pb-10">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Account
        </h1>
        <p className="text-xs text-muted-foreground">
          Manage your personal profile, credentials, and individual system
          preferences
        </p>
      </div>

      <AccountNav />

      {alert && (
        <DismissibleAlert
          message={alert}
          onDismiss={() => setAlert(null)}
          autoDismissMs={5000}
        />
      )}

      {isLoading ? (
        <SecuritySkeleton />
      ) : (
        <div className="space-y-6">
          {/* Change Password Card */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                Change Password
              </CardTitle>
              <CardDescription className="text-xs">
                Ensure your account uses a secure password of at least 8
                characters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                noValidate
                onSubmit={handleSubmit(onPasswordSubmit)}
                className="space-y-4 max-w-md"
              >
                <Field error={errors.currentPassword?.message}>
                  <FieldLabel
                    htmlFor="currentPassword"
                    className="text-xs font-medium"
                  >
                    Current Password
                  </FieldLabel>
                  <Input
                    id="currentPassword"
                    type="password"
                    placeholder="Enter existing password"
                    className="h-8 text-xs bg-elevated/40"
                    {...register("currentPassword")}
                  />
                  <FieldError />
                </Field>

                <Field error={errors.newPassword?.message}>
                  <FieldLabel
                    htmlFor="newPassword"
                    className="text-xs font-medium"
                  >
                    New Password
                  </FieldLabel>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="At least 8 characters"
                    className="h-8 text-xs bg-elevated/40"
                    {...register("newPassword")}
                  />
                  <FieldError />
                </Field>

                <Field error={errors.confirmPassword?.message}>
                  <FieldLabel
                    htmlFor="confirmPassword"
                    className="text-xs font-medium"
                  >
                    Confirm New Password
                  </FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-type new password"
                    className="h-8 text-xs bg-elevated/40"
                    {...register("confirmPassword")}
                  />
                  <FieldError />
                </Field>

                <div className="pt-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isChangingPassword}
                    className="text-xs h-8 px-4"
                  >
                    {isChangingPassword
                      ? "Updating Password..."
                      : "Update Password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Devices & Active Sessions Card */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" />
                  Devices &amp; Sessions
                </CardTitle>
                <CardDescription className="text-xs">
                  Recognized devices and active login sessions associated with
                  your account
                </CardDescription>
              </div>
              {data && data.sessions.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRevokeModal(true)}
                  disabled={isRevoking}
                  className="text-xs h-8 text-destructive border-destructive/20 hover:bg-destructive/10 hover:border-destructive/40 cursor-pointer self-start sm:self-auto"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  <span>Sign Out All Other Sessions</span>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border divide-y divide-border overflow-hidden bg-panel/20">
                {data && data.sessions.length > 0 ? (
                  data.sessions.map((session) => {
                    const dev = session.device;
                    const hardwareInfo = [dev?.manufacturer, dev?.model]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div
                        key={session.id}
                        className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-elevated/20 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-lg bg-elevated border border-border text-foreground shrink-0 mt-0.5">
                            {getDeviceIcon(dev?.type)}
                          </div>
                          <div className="space-y-1">
                            {/* Device Name & Badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                {dev?.name ||
                                  session.userAgent?.slice(0, 45) ||
                                  "Recognized Device"}
                              </span>
                              {session.isCurrent && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono"
                                >
                                  This Device
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className="text-[10px] dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-mono"
                              >
                                Active Session
                              </Badge>
                            </div>

                            {/* Device & Client Details */}
                            <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>
                                {dev?.operatingSystem || "OS"}{" "}
                                {dev?.operatingSystemVersion
                                  ? `(${dev.operatingSystemVersion})`
                                  : ""}
                              </span>
                              <span>•</span>
                              <span>
                                {dev?.browser || "Browser"}{" "}
                                {dev?.browserVersion
                                  ? `v${dev.browserVersion}`
                                  : ""}
                              </span>
                              {hardwareInfo && (
                                <>
                                  <span>•</span>
                                  <span>Hardware: {hardwareInfo}</span>
                                </>
                              )}
                            </div>

                            {/* Network, Approximate Location & Timestamps */}
                            <div className="text-[11px] text-muted-foreground font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                              <span className="flex items-center gap-1">
                                <Globe className="h-3 w-3 text-muted-foreground" />
                                {session.location || "Local Network"}
                              </span>
                              <span>•</span>
                              <span>
                                IP: {session.ipAddress || "127.0.0.1"}
                              </span>
                              <span>•</span>
                              <span>
                                First login:{" "}
                                {formatDate(
                                  dev?.firstSeenAt || session.createdAt,
                                )}
                              </span>
                              <span>•</span>
                              <span>
                                Last active:{" "}
                                {formatDate(
                                  session.lastActiveAt || session.createdAt,
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 md:self-center shrink-0 pt-2 md:pt-0">
                          {session.isCurrent ? (
                            <span className="text-[11px] text-emerald-500 flex items-center gap-1 font-mono">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Current
                              Session
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSessionToRevoke(session)}
                              className="text-xs h-7 text-destructive border-destructive/20 hover:bg-destructive/10 hover:border-destructive/40 cursor-pointer gap-1"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Revoke</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    No active sessions recorded.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Login History Card */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Recent Login History
              </CardTitle>
              <CardDescription className="text-xs">
                Audited access events and security verifications from the past
                30 days (older records are automatically pruned)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel border-b border-border text-muted-foreground font-mono text-[11px]">
                    <tr>
                      <th className="px-3.5 py-2.5">Event</th>
                      <th className="px-3.5 py-2.5">IP Address</th>
                      <th className="px-3.5 py-2.5">Timestamp</th>
                      <th className="px-3.5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedLoginHistory.length > 0 ? (
                      paginatedLoginHistory.map((log) => (
                        <tr
                          key={log.id}
                          className="hover:bg-elevated/20 transition-colors"
                        >
                          <td className="px-3.5 py-2.5 font-medium text-foreground">
                            {log.action
                              .replace("user:", "")
                              .replace("user.", "")
                              .replace(/[:._]/g, " ")}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-muted-foreground text-[11px]">
                            {log.ipAddress || "127.0.0.1"}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-muted-foreground text-[11px]">
                            {formatDate(log.timestamp || log.createdAt)}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Badge
                              variant="outline"
                              className="text-[10px] text-emerald-500 font-mono"
                            >
                              {log.action.includes("failed")
                                ? "Failed"
                                : "Success"}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3.5 py-4 text-center text-xs text-muted-foreground"
                        >
                          No recent login history recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination Controls (Max 5 per page) */}
                {totalLoginEvents.length > LOGIN_HISTORY_PAGE_SIZE && (
                  <div className="h-10 border-t border-border px-3.5 flex items-center justify-between bg-panel text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground font-mono text-[11px]">
                      Showing{" "}
                      {(loginHistoryPage - 1) * LOGIN_HISTORY_PAGE_SIZE + 1}–
                      {Math.min(
                        loginHistoryPage * LOGIN_HISTORY_PAGE_SIZE,
                        totalLoginEvents.length,
                      )}{" "}
                      of {totalLoginEvents.length}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loginHistoryPage === 1}
                        onClick={() =>
                          setLoginHistoryPage((p) => Math.max(1, p - 1))
                        }
                        className="h-6 px-2 text-[10px] cursor-pointer"
                      >
                        <ChevronLeft className="h-3 w-3 mr-0.5" /> Prev
                      </Button>
                      <span className="text-[11px] font-mono text-muted-foreground px-1">
                        Page {loginHistoryPage} of {totalLoginPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loginHistoryPage >= totalLoginPages}
                        onClick={() =>
                          setLoginHistoryPage((p) =>
                            Math.min(totalLoginPages, p + 1),
                          )
                        }
                        className="h-6 px-2 text-[10px] cursor-pointer"
                      >
                        Next <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SHADCN DIALOG: Revoke Single Session Confirmation */}
      <Dialog
        open={!!sessionToRevoke}
        onOpenChange={(open) => !open && setSessionToRevoke(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1.5 pb-2">
            <div className="flex items-center gap-2 text-destructive">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                <LogOut className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Revoke Session
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Are you sure you want to revoke this session? The device will be
              immediately signed out and required to re-authenticate.
            </DialogDescription>
          </DialogHeader>

          {sessionToRevoke && (
            <div className="rounded-md border border-border bg-panel p-3 text-xs space-y-1.5 font-mono">
              <div className="text-foreground font-semibold flex items-center gap-2 text-xs">
                {getDeviceIcon(sessionToRevoke.device?.type)}
                <span>{sessionToRevoke.device?.name || "Session Device"}</span>
              </div>
              <div className="text-muted-foreground text-[11px]">
                Location: {sessionToRevoke.location || "Local Network"}
              </div>
              <div className="text-muted-foreground text-[11px]">
                IP Address: {sessionToRevoke.ipAddress || "127.0.0.1"}
              </div>
              <div className="text-muted-foreground text-[11px]">
                Last Active:{" "}
                {formatDate(
                  sessionToRevoke.lastActiveAt || sessionToRevoke.createdAt,
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSessionToRevoke(null)}
              disabled={isRevokingSingle}
              className="text-xs h-8 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isRevokingSingle}
              onClick={handleConfirmRevokeSingle}
              className="text-xs h-8 cursor-pointer gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Revoke Session</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: Revoke Other Sessions Confirmation */}
      <Dialog open={showRevokeModal} onOpenChange={setShowRevokeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1.5 pb-2">
            <div className="flex items-center gap-2 text-destructive">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                <LogOut className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Revoke Other Active Sessions
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Are you sure you want to sign out all other active sessions? This
              will immediately terminate access on any other browsers,
              workstations, or mobile devices.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
            <p className="font-semibold">Security Notice</p>
            <p className="text-[11px] leading-relaxed text-destructive/90">
              Only your current active session on this device will be preserved.
              Any active tokens on other devices will be invalidated.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRevokeModal(false)}
              disabled={isRevoking}
              className="text-xs h-8 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isRevoking}
              onClick={handleConfirmRevokeOthers}
              className="text-xs h-8 cursor-pointer gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Revoke Other Sessions</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
