"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AccountNav } from "@/components/account/account-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Settings, Globe, Clock, Calendar, CheckCircle2, ShieldAlert, AlertTriangle, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTranslation, type SupportedLocale } from "@/lib/i18n";

const settingsSchema = z.object({
  displayName: z.string().trim().max(100, "Display name cannot exceed 100 characters").optional(),
  timezone: z.string().min(1, "Please select a timezone"),
  dateFormat: z.string().min(1, "Please select a date format"),
  timeFormat: z.enum(["12h", "24h"]),
  language: z.string().min(2, "Please select a language"),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "London, Dublin, Lisbon (GMT/BST)" },
  { value: "Europe/Berlin", label: "Berlin, Paris, Amsterdam (CET)" },
  { value: "Asia/Kolkata", label: "India Standard Time (IST - UTC+05:30)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST - UTC+09:00)" },
  { value: "Australia/Sydney", label: "Sydney, Melbourne (AEST)" },
];

const DATE_FORMATS = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (e.g. 2026-11-14)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (e.g. 14/11/2026)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (e.g. 11/14/2026)" },
  { value: "DD-MM-YYYY", label: "DD-MM-YYYY (e.g. 14-11-2026)" },
];

const LANGUAGES = [
  { value: "en", label: "English (United States)" },
  { value: "es", label: "Español (Spanish)" },
  { value: "de", label: "Deutsch (German)" },
  { value: "fr", label: "Français (French)" },
  { value: "ja", label: "日本語 (Japanese)" },
];

function SettingsSkeleton() {
  return (
    <Card className="border-border/80 bg-panel/40">
      <CardHeader className="pb-4 space-y-1.5">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-3 w-80" />
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
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
      </CardContent>
    </Card>
  );
}

export default function AccountSettingsPage() {
  const { locale, setLocale, t } = useTranslation();
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "success" | "error">("idle");
  const [saveMessage, setSaveMessage] = React.useState<string>("");

  // Account Deletion State
  const [eligibility, setEligibility] = React.useState<{
    canDelete: boolean;
    blockingOrganizations: Array<{ id: string; name: string }>;
    membershipsCount: number;
    retentionNotice?: string;
  } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [deletePassword, setDeletePassword] = React.useState("");
  const [deleteConfirmation, setDeleteConfirmation] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      displayName: "",
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "24h",
      language: "en",
    },
  });

  const watchedTimezone = watch("timezone");
  const watchedDateFormat = watch("dateFormat");
  const watchedTimeFormat = watch("timeFormat");
  const watchedLanguage = watch("language");

  const [previewDate, setPreviewDate] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setPreviewDate(new Date());
    const interval = setInterval(() => setPreviewDate(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const loadPreferences = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/v1/account/preferences");
      if (res.ok) {
        const json = await res.json();
        const data = json.preferences || json;
        reset({
          displayName: data.displayName || "",
          timezone: data.timezone || "UTC",
          dateFormat: data.dateFormat || "YYYY-MM-DD",
          timeFormat: (data.timeFormat as "12h" | "24h") || "24h",
          language: data.language || "en",
        });

        if (data.language && ["en", "es", "de", "fr", "ja"].includes(data.language)) {
          setLocale(data.language as SupportedLocale);
        }

        // Initialize local storage cache
        try {
          if (data.displayName) localStorage.setItem("chronos_display_name", data.displayName);
          if (data.timezone) localStorage.setItem("chronos_timezone", data.timezone);
          if (data.dateFormat) localStorage.setItem("chronos_date_format", data.dateFormat);
          if (data.timeFormat) localStorage.setItem("chronos_time_format", data.timeFormat);
          if (data.language) localStorage.setItem("chronos_language", data.language);
        } catch {}
      }
    } catch {
      // Quietly use default state; do not trigger error on initial render
    } finally {
      setIsLoading(false);
    }
  }, [reset, setLocale]);

  const loadAccountEligibility = React.useCallback(async () => {
    try {
      const res = await fetch("/api/v1/account");
      if (res.ok) {
        const data = await res.json();
        setEligibility(data);
      }
    } catch {
      // Quietly ignore
    }
  }, []);

  React.useEffect(() => {
    loadPreferences();
    loadAccountEligibility();
  }, [loadPreferences, loadAccountEligibility]);

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword || deleteConfirmation !== "DELETE") return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/v1/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: deletePassword,
          confirmationPhrase: deleteConfirmation,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete account");
        setIsDeleting(false);
        return;
      }
      // Successful deletion redirects to login
      window.location.href = data.nextUrl || "/login";
    } catch {
      setDeleteError("A network error occurred. Please try again.");
      setIsDeleting(false);
    }
  };

  const onSubmit = async (values: SettingsFormValues) => {
    try {
      setIsSaving(true);
      setSaveStatus("idle");
      const res = await fetch("/api/v1/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save settings");

      if (values.language && ["en", "es", "de", "fr", "ja"].includes(values.language)) {
        setLocale(values.language as SupportedLocale);
      }

      // Save to localStorage for instant client-side date formatting
      try {
        if (values.displayName) localStorage.setItem("chronos_display_name", values.displayName);
        if (values.timezone) localStorage.setItem("chronos_timezone", values.timezone);
        if (values.dateFormat) localStorage.setItem("chronos_date_format", values.dateFormat);
        if (values.timeFormat) localStorage.setItem("chronos_time_format", values.timeFormat);
        if (values.language) {
          localStorage.setItem("chronos_language", values.language);
          document.documentElement.lang = values.language;
        }
      } catch {}

      // Dispatch event to update studio layout, user sidebar badge, and header immediately
      window.dispatchEvent(
        new CustomEvent("chronos:settings-updated", {
          detail: values,
        })
      );

      setSaveStatus("success");
      setSaveMessage(t("settings.saveSuccess"));
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveMessage("");
      }, 3500);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save settings";
      setSaveStatus("error");
      setSaveMessage(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const previewString = previewDate
    ? formatDate(previewDate, {
        timezone: watchedTimezone || "UTC",
        dateFormat: watchedDateFormat || "YYYY-MM-DD",
        timeFormat: watchedTimeFormat || "24h",
        locale: watchedLanguage || locale,
      })
    : "—";

  return (
    <div className="space-y-5 w-full max-w-[1920px] mx-auto pb-10">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("account.account")}</h1>
        <p className="text-xs text-muted-foreground">
          {t("account.accountDesc")}
        </p>
      </div>

      <AccountNav />

      {isLoading ? (
        <SettingsSkeleton />
      ) : (
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                {t("settings.title")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("settings.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              {/* Display Name */}
              <Field error={errors.displayName?.message}>
                <FieldLabel htmlFor="displayName" className="text-xs font-medium">
                  {t("settings.displayName")}
                </FieldLabel>
                <Input
                  id="displayName"
                  type="text"
                  placeholder={t("settings.displayNamePlaceholder")}
                  className="h-8 text-xs bg-elevated/40"
                  {...register("displayName")}
                />
                <FieldError />
              </Field>

              {/* Timezone */}
              <Field error={errors.timezone?.message}>
                <FieldLabel htmlFor="timezone" className="text-xs font-medium flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("settings.timezone")}
                </FieldLabel>
                <Controller
                  name="timezone"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="timezone" className="h-8 text-xs bg-elevated/40">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value} className="text-xs font-mono">
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("settings.timezoneHelp")}
                </p>
              </Field>

              {/* Date Format */}
              <Field error={errors.dateFormat?.message}>
                <FieldLabel htmlFor="dateFormat" className="text-xs font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("settings.dateFormat")}
                </FieldLabel>
                <Controller
                  name="dateFormat"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="dateFormat" className="h-8 text-xs bg-elevated/40">
                        <SelectValue placeholder="Select date format" />
                      </SelectTrigger>
                      <SelectContent>
                        {DATE_FORMATS.map((df) => (
                          <SelectItem key={df.value} value={df.value} className="text-xs font-mono">
                            {df.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError />
              </Field>

              {/* Time Format */}
              <Field error={errors.timeFormat?.message}>
                <FieldLabel htmlFor="timeFormat" className="text-xs font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("settings.timeFormat")}
                </FieldLabel>
                <Controller
                  name="timeFormat"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="timeFormat" className="h-8 text-xs bg-elevated/40">
                        <SelectValue placeholder="Select time format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12h" className="text-xs font-mono">
                          {t("settings.twelveHour")}
                        </SelectItem>
                        <SelectItem value="24h" className="text-xs font-mono">
                          {t("settings.twentyFourHour")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError />
              </Field>

              {/* Language Preferences */}
              <Field error={errors.language?.message}>
                <FieldLabel htmlFor="language" className="text-xs font-medium">
                  {t("settings.language")}
                </FieldLabel>
                <Controller
                  name="language"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val);
                        if (val && ["en", "es", "de", "fr", "ja"].includes(val)) {
                          setLocale(val as SupportedLocale);
                        }
                      }}
                    >
                      <SelectTrigger id="language" className="h-8 text-xs bg-elevated/40">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value} className="text-xs">
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError />
              </Field>

              {/* Active Timestamp Preview */}
              <div className="mt-4 rounded-lg border border-border/70 bg-elevated/40 p-3 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  {t("settings.previewTitle")}
                </div>
                <div className="font-mono text-xs font-semibold text-foreground">
                  {previewString}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t("settings.previewHelp")}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Form Actions (Outside of the card, aligned to bottom right) */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            {saveStatus === "success" && (
              <span className="text-xs dark:text-emerald-400 flex items-center gap-1.5 font-medium animate-in fade-in duration-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {saveMessage}
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-destructive flex items-center gap-1.5 font-medium animate-in fade-in duration-200">
                {saveMessage}
              </span>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="text-xs h-8 px-4 cursor-pointer"
            >
              {isSaving ? t("settings.saving") : saveStatus === "success" ? t("settings.saved") : t("settings.savePreferences")}
            </Button>
          </div>
        </form>
      )}

      {/* Danger Zone: Account Deletion */}
      <Card className="mt-8 border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3 space-y-1">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-4 w-4" />
            <CardTitle className="text-sm font-semibold">Danger Zone</CardTitle>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Permanently delete your account and personal credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {eligibility && !eligibility.canDelete && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 dark:border-amber-500/30 dark:bg-amber-500/10 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Account Deletion Blocked</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                You are the sole Owner of the following organization(s):{" "}
                <strong className="text-amber-950 dark:text-foreground font-semibold">
                  {eligibility.blockingOrganizations.map((o) => o.name).join(", ")}
                </strong>.
                You must transfer ownership to another member or delete the organization before deleting your account.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">Delete this account</p>
              <p className="text-[11px] text-muted-foreground max-w-lg">
                Once deleted, your active sessions, preferences, and personal profile will be permanently removed.
                Audit records will be retained with your identity anonymized.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={eligibility ? !eligibility.canDelete : false}
              onClick={() => {
                setDeleteError(null);
                setDeletePassword("");
                setDeleteConfirmation("");
                setIsDeleteModalOpen(true);
              }}
              className="text-xs h-8 cursor-pointer shrink-0 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Account</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SHADCN DIALOG: Delete Account Confirmation */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleDeleteAccount}>
            <DialogHeader className="space-y-1.5 pb-2">
              <div className="flex items-center gap-2 text-destructive">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  Permanently Delete Account
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground pt-1">
                This action is irreversible. All of your active sessions, personal preferences, and profile data will be permanently wiped.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                <p className="font-semibold">Compliance & Safety Notice</p>
                <p className="text-[11px] leading-relaxed text-destructive/90">
                  Active organizations, workspaces, and connected databases will remain intact. Historical audit trails are preserved with your identity anonymized.
                </p>
              </div>

              {deleteError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/15 p-2.5 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Current Password <span className="text-destructive">*</span>
                </label>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your current password to verify"
                  className="h-8 text-xs bg-elevated/40"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  To confirm, type <span className="font-mono font-bold text-destructive">DELETE</span> below:
                </label>
                <Input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="DELETE"
                  className="h-8 text-xs font-mono bg-elevated/40"
                  required
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="text-xs h-8 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                isLoading={isDeleting}
                disabled={isDeleting || deleteConfirmation !== "DELETE" || !deletePassword}
                className="text-xs h-8 cursor-pointer gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Account</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}