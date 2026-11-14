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
import { DismissibleAlert } from "@/components/shared/dismissible-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Globe, Clock, Calendar } from "lucide-react";

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
        <Skeleton className="h-8 w-32 mt-3" />
      </CardContent>
    </Card>
  );
}

export default function AccountSettingsPage() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [alert, setAlert] = React.useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
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
      }
    } catch {
      // Quietly use default state; do not trigger error on initial render
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  React.useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const onSubmit = async (values: SettingsFormValues) => {
    try {
      setIsSaving(true);
      setAlert(null);
      const res = await fetch("/api/v1/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save settings");

      setAlert({ type: "success", text: "Account settings saved successfully." });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save settings";
      setAlert({ type: "error", text: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

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
        <SettingsSkeleton />
      ) : (
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Localization & Display Preferences
              </CardTitle>
              <CardDescription className="text-xs">
                Configure your preferred regional formats, timestamps, and interface language
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              {/* Display Name */}
              <Field error={errors.displayName?.message}>
                <FieldLabel htmlFor="displayName" className="text-xs font-medium">
                  Display Name
                </FieldLabel>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Custom name shown in comments and logs"
                  className="h-8 text-xs bg-elevated/40"
                  {...register("displayName")}
                />
                <FieldError />
              </Field>

              {/* Timezone */}
              <Field error={errors.timezone?.message}>
                <FieldLabel htmlFor="timezone" className="text-xs font-medium flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  Timezone
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
                  Temporal audit trails and timeline queries will be rendered using this timezone.
                </p>
              </Field>

              {/* Date Format */}
              <Field error={errors.dateFormat?.message}>
                <FieldLabel htmlFor="dateFormat" className="text-xs font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Date Format
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
                  Time Format
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
                          12-Hour (e.g. 02:30 PM)
                        </SelectItem>
                        <SelectItem value="24h" className="text-xs font-mono">
                          24-Hour (e.g. 14:30)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError />
              </Field>

              {/* Language */}
              <Field error={errors.language?.message}>
                <FieldLabel htmlFor="language" className="text-xs font-medium">
                  Language Preferences
                </FieldLabel>
                <Controller
                  name="language"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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

              <div className="pt-3">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="text-xs h-8 px-4"
                >
                  {isSaving ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
