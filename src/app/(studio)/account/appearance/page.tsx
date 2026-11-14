"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AccountNav } from "@/components/account/account-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/shared/theme-provider";
import { cn } from "@/lib/utils";
import {
  Monitor,
  Moon,
  Sun,
  Code2,
  PanelLeft,
  Check,
  CheckCircle2,
} from "lucide-react";

const appearanceSchema = z.object({
  theme: z.enum(["system", "dark", "light"]),
  sidebarPreference: z.enum(["expanded", "collapsed"]),
  sqlFontSize: z.number().int().min(10).max(24),
  editorWordWrap: z.boolean(),
  editorLineNumbers: z.boolean(),
  editorMinimap: z.boolean(),
});

type AppearanceFormValues = z.infer<typeof appearanceSchema>;

function AppearanceSkeleton() {
  return (
    <div className="space-y-6">
      {/* Theme Selection Card */}
      <Card className="border-border/80 bg-panel/40">
        <CardHeader className="pb-4 space-y-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-80" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-panel space-y-2"
              >
                <Skeleton className="h-10 w-10 rounded-lg mb-1" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Navigation Card */}
      <Card className="border-border/80 bg-panel/40">
        <CardHeader className="pb-4 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="max-w-lg space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>

      {/* SQL Editor Preferences Card */}
      <Card className="border-border/80 bg-panel/40">
        <CardHeader className="pb-4 space-y-1.5">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-72" />
        </CardHeader>
        <CardContent className="space-y-5 max-w-lg">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-3 pt-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-elevated/30"
              >
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-5 w-9 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Button Skeleton (Outside of the box, bottom right) */}
      <div className="flex justify-end pt-2">
        <Skeleton className="h-8 w-44 rounded-md" />
      </div>
    </div>
  );
}

export default function AccountAppearancePage() {
  const { theme: activeTheme, setTheme } = useTheme();
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"success" | "error" | null>(null);
  const [saveMessage, setSaveMessage] = React.useState("");

  const {
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
  } = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceSchema),
    defaultValues: {
      theme: activeTheme || "dark",
      sidebarPreference: "expanded",
      sqlFontSize: 13,
      editorWordWrap: true,
      editorLineNumbers: true,
      editorMinimap: false,
    },
  });

  const selectedTheme = watch("theme");

  // Load preferences ONCE on mount
  React.useEffect(() => {
    let isCancelled = false;

    async function loadPreferences() {
      try {
        setIsLoading(true);
        const res = await fetch("/api/v1/account/preferences");
        if (res.ok && !isCancelled) {
          const json = await res.json();
          const data = json.preferences || json;
          const localStored =
            typeof window !== "undefined"
              ? (localStorage.getItem("chronos_theme") as "system" | "dark" | "light")
              : null;
          const resolvedTheme = data.theme || localStored || activeTheme || "dark";

          reset({
            theme: resolvedTheme,
            sidebarPreference: (data.sidebarPreference as "expanded" | "collapsed") || "expanded",
            sqlFontSize: data.sqlFontSize ?? 13,
            editorWordWrap: data.editorWordWrap ?? true,
            editorLineNumbers: data.editorLineNumbers ?? true,
            editorMinimap: data.editorMinimap ?? false,
          });
        }
      } catch {
        // Quietly use local defaults without triggering error alert on page load
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPreferences();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectTheme = (newTheme: "system" | "dark" | "light") => {
    setValue("theme", newTheme, { shouldDirty: true });
  };

  const onSubmit = async (values: AppearanceFormValues) => {
    try {
      setIsSaving(true);
      setSaveStatus(null);
      const res = await fetch("/api/v1/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save appearance settings");

      // Apply theme changes only upon saving
      if (values.theme) {
        setTheme(values.theme);
      }

      // Apply sidebar preference changes only upon saving
      if (values.sidebarPreference) {
        localStorage.setItem("chronos_sidebar_pref", values.sidebarPreference);
        window.dispatchEvent(
          new CustomEvent("chronos:sidebar-pref", { detail: values.sidebarPreference })
        );
      }

      setSaveStatus("success");
      setSaveMessage("Appearance preferences saved successfully.");
      setTimeout(() => {
        setSaveStatus(null);
      }, 3500);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save preferences";
      setSaveStatus("error");
      setSaveMessage(errorMsg);
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

      {isLoading ? (
        <AppearanceSkeleton />
      ) : (
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Theme Selection Card */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sun className="h-4 w-4 text-primary" />
                Theme & Interface Appearance
              </CardTitle>
              <CardDescription className="text-xs">
                Select your preferred color scheme for the studio and editor environments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* System */}
                <button
                  type="button"
                  onClick={() => handleSelectTheme("system")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer group",
                    selectedTheme === "system"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-sm"
                      : "border-border bg-panel hover:bg-elevated/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="p-2.5 rounded-lg bg-elevated border border-border mb-3 group-hover:border-primary/40 transition-colors">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    System Preference
                    {selectedTheme === "system" && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    Synchronize with your operating system
                  </span>
                </button>

                {/* Dark */}
                <button
                  type="button"
                  onClick={() => handleSelectTheme("dark")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer group",
                    selectedTheme === "dark"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-sm"
                      : "border-border bg-panel hover:bg-elevated/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="p-2.5 rounded-lg bg-elevated border border-border mb-3 group-hover:border-primary/40 transition-colors">
                    <Moon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Dark Mode
                    {selectedTheme === "dark" && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    High contrast dark palette
                  </span>
                </button>

                {/* Light */}
                <button
                  type="button"
                  onClick={() => handleSelectTheme("light")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all cursor-pointer group",
                    selectedTheme === "light"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-sm"
                      : "border-border bg-panel hover:bg-elevated/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="p-2.5 rounded-lg bg-elevated border border-border mb-3 group-hover:border-primary/40 transition-colors">
                    <Sun className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Light Mode
                    {selectedTheme === "light" && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    Crisp minimal light palette
                  </span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Navigation & Layout Preferences */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PanelLeft className="h-4 w-4 text-primary" />
                Sidebar & Navigation
              </CardTitle>
              <CardDescription className="text-xs">
                Configure default drawer behavior and sidebar layout
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              <Field>
                <FieldLabel className="text-xs font-medium">Default Sidebar State</FieldLabel>
                <Controller
                  name="sidebarPreference"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-xs bg-elevated/40">
                        <SelectValue placeholder="Select default sidebar behavior" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expanded" className="text-xs font-mono">
                          Expanded (Full Navigation Labels)
                        </SelectItem>
                        <SelectItem value="collapsed" className="text-xs font-mono">
                          Collapsed (Compact Icons Only)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  On mobile and small tablets, the sidebar automatically transitions to an overlay drawer.
                </p>
              </Field>
            </CardContent>
          </Card>

          {/* SQL Editor Preferences */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                SQL Editor & Monaco Defaults
              </CardTitle>
              <CardDescription className="text-xs">
                Customize typography and convenience toggles in the query editor
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 max-w-lg">
              {/* Font Size */}
              <Field>
                <FieldLabel className="text-xs font-medium">Editor Font Size</FieldLabel>
                <Controller
                  name="sqlFontSize"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(val) => field.onChange(parseInt(val, 10))}
                    >
                      <SelectTrigger className="h-8 text-xs bg-elevated/40">
                        <SelectValue placeholder="Select font size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="11" className="text-xs font-mono">
                          11px (Compact)
                        </SelectItem>
                        <SelectItem value="12" className="text-xs font-mono">
                          12px (Small)
                        </SelectItem>
                        <SelectItem value="13" className="text-xs font-mono">
                          13px (Default)
                        </SelectItem>
                        <SelectItem value="14" className="text-xs font-mono">
                          14px (Medium)
                        </SelectItem>
                        <SelectItem value="16" className="text-xs font-mono">
                          16px (Large)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              {/* Toggles */}
              <div className="space-y-3 pt-2">
                {/* Word wrap */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-elevated/30">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground">Word Wrap</span>
                    <p className="text-[11px] text-muted-foreground">
                      Wrap long SQL query lines instead of horizontal scrolling
                    </p>
                  </div>
                  <Controller
                    name="editorWordWrap"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>

                {/* Line numbers */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-elevated/30">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground">Line Numbers</span>
                    <p className="text-[11px] text-muted-foreground">
                      Show line numbering gutter in SQL editor
                    </p>
                  </div>
                  <Controller
                    name="editorLineNumbers"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>

                {/* Minimap */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-elevated/30">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground">Editor Minimap</span>
                    <p className="text-[11px] text-muted-foreground">
                      Display high-level code minimap overview on right gutter
                    </p>
                  </div>
                  <Controller
                    name="editorMinimap"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Actions (Outside of the card, aligned to bottom right) */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            {saveStatus === "success" && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium animate-in fade-in duration-200">
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
              {isSaving ? "Saving..." : saveStatus === "success" ? "Saved!" : "Save Appearance Preferences"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
