"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AccountNav } from "@/components/account/account-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DismissibleAlert } from "@/components/shared/dismissible-alert";
import { formatDate } from "@/lib/utils";
import {
  Shield,
  KeyRound,
  Laptop,
  History,
  Lock,
  LogOut,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

interface SessionItem {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  lastActiveAt?: string | null;
  isCurrent: boolean;
}

interface LoginEvent {
  id: string;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp?: string | Date | null;
  createdAt?: string | Date | null;
  details?: unknown;
}

interface SecurityData {
  currentSessionId: string;
  sessions: SessionItem[];
  loginHistory: LoginEvent[];
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
  const [loginHistoryPage, setLoginHistoryPage] = React.useState(1);
  const LOGIN_HISTORY_PAGE_SIZE = 5;
  const [alert, setAlert] = React.useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

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

      setAlert({ type: "success", text: "Your password has been changed successfully." });
      resetPasswordForm();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to update password";
      setAlert({ type: "error", text: errorMsg });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleConfirmRevokeOthers = async () => {
    try {
      setIsRevoking(true);
      setAlert(null);
      const res = await fetch("/api/v1/account/security/sessions/revoke-others", {
        method: "POST",
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to revoke sessions");

      setAlert({ type: "success", text: "All other sessions have been revoked." });
      setShowRevokeModal(false);
      loadSecurityData();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to revoke sessions";
      setAlert({ type: "error", text: errorMsg });
    } finally {
      setIsRevoking(false);
    }
  };

  const totalLoginEvents = data?.loginHistory || [];
  const totalLoginPages = Math.ceil(totalLoginEvents.length / LOGIN_HISTORY_PAGE_SIZE) || 1;
  const paginatedLoginHistory = totalLoginEvents.slice(
    (loginHistoryPage - 1) * LOGIN_HISTORY_PAGE_SIZE,
    loginHistoryPage * LOGIN_HISTORY_PAGE_SIZE
  );

  return (
    <div className="space-y-5 w-full pb-10">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Account</h1>
        <p className="text-xs text-muted-foreground">
          Manage your personal profile, credentials, and individual system preferences
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
                Ensure your account uses a secure password of at least 8 characters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                noValidate
                onSubmit={handleSubmit(onPasswordSubmit)}
                className="space-y-4 max-w-md"
              >
                <Field error={errors.currentPassword?.message}>
                  <FieldLabel htmlFor="currentPassword" className="text-xs font-medium">
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
                  <FieldLabel htmlFor="newPassword" className="text-xs font-medium">
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
                  <FieldLabel htmlFor="confirmPassword" className="text-xs font-medium">
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
                    {isChangingPassword ? "Updating Password..." : "Update Password"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Active Sessions Card */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Laptop className="h-4 w-4 text-primary" />
                  Active Sessions
                </CardTitle>
                <CardDescription className="text-xs">
                  Devices and locations currently signed in to your account
                </CardDescription>
              </div>
              {data && data.sessions.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRevokeModal(true)}
                  disabled={isRevoking}
                  className="text-xs h-8 text-destructive hover:bg-destructive/10 hover:border-destructive/40 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  <span>Revoke Other Sessions</span>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {data && data.sessions.length > 0 ? (
                  data.sessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-elevated/20 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded bg-elevated border border-border text-foreground shrink-0 mt-0.5">
                          <Laptop className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground">
                              {session.userAgent ? session.userAgent.slice(0, 50) : "Web Browser"}
                            </span>
                            {session.isCurrent && (
                              <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono">
                                This Device
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            IP: {session.ipAddress || "127.0.0.1"} • Started: {formatDate(session.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground font-mono sm:self-center">
                        {session.isCurrent ? (
                          <span className="text-emerald-500 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Active Now
                          </span>
                        ) : (
                          <span>Last active: {session.lastActiveAt ? formatDate(session.lastActiveAt) : "Recently"}</span>
                        )}
                      </div>
                    </div>
                  ))
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
                Audited access events and security verifications from the past 30 days
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
                        <tr key={log.id} className="hover:bg-elevated/20 transition-colors">
                          <td className="px-3.5 py-2.5 font-medium text-foreground">
                            {log.action.replace("user:", "").replace("user.", "").replace(/[:._]/g, " ")}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-muted-foreground text-[11px]">
                            {log.ipAddress || "127.0.0.1"}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-muted-foreground text-[11px]">
                            {formatDate(log.timestamp || log.createdAt)}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Badge variant="outline" className="text-[10px] text-emerald-500 font-mono">
                              Success
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-3.5 py-4 text-center text-xs text-muted-foreground">
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
                      Showing {(loginHistoryPage - 1) * LOGIN_HISTORY_PAGE_SIZE + 1}–
                      {Math.min(loginHistoryPage * LOGIN_HISTORY_PAGE_SIZE, totalLoginEvents.length)} of{" "}
                      {totalLoginEvents.length}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loginHistoryPage === 1}
                        onClick={() => setLoginHistoryPage((p) => Math.max(1, p - 1))}
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
                        onClick={() => setLoginHistoryPage((p) => Math.min(totalLoginPages, p + 1))}
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
              Are you sure you want to sign out all other active sessions? This will immediately terminate access on any other browsers, workstations, or mobile devices.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
            <p className="font-semibold">Security Notice</p>
            <p className="text-[11px] leading-relaxed text-destructive/90">
              Only your current active session on this device will be preserved. Any active tokens on other devices will be invalidated.
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
