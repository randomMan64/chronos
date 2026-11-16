"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AccountNav } from "@/components/account/account-nav";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ImagePicker } from "@/components/ui/image-picker";
import { formatDate, getInitials } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Shield,
  User,
  Info,
} from "lucide-react";

const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name cannot exceed 100 characters"),
  avatarUrl: z
    .string()
    .trim()
    .refine(
      (val) =>
        !val ||
        val.startsWith("http://") ||
        val.startsWith("https://") ||
        val.startsWith("data:image/"),
      { message: "Please enter a valid image URL or upload an image file" },
    )
    .or(z.literal(""))
    .optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileData {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl?: string | null;
    createdAt: string;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
    joinedAt: string;
  }>;
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border-border/80 bg-panel/40">
        <CardHeader className="pb-4 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-border">
            <Skeleton className="h-16 w-16 rounded-full shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-60" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <div className="mt-6 space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-8 w-28 mt-2" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-panel/40">
        <CardHeader className="pb-3 space-y-1.5">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-3 w-72" />
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="p-3 bg-panel border-b border-border flex gap-8">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="p-3.5 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountProfilePage() {
  const { t } = useTranslation();
  const [data, setData] = React.useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<
    "idle" | "success" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = React.useState("");

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const loadProfile = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/v1/account/profile");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        reset({
          fullName: json.user?.fullName || "",
          avatarUrl: json.user?.avatarUrl || "",
        });
      }
    } catch {
      // Quietly use local default state; do not trigger intrusive alert on initial load
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      setIsSaving(true);
      setSaveStatus("idle");
      const res = await fetch("/api/v1/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to update profile");

      setData((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                fullName: result.user.fullName,
                avatarUrl: result.user.avatarUrl,
              },
            }
          : null,
      );

      // Sync display name globally across layout
      window.dispatchEvent(
        new CustomEvent("chronos:settings-updated", {
          detail: { displayName: result.user.fullName },
        }),
      );

      setSaveStatus("success");
      setSaveMessage("Profile information updated successfully.");
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveMessage("");
      }, 3500);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to update profile";
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("account.account")}
        </h1>
        <p className="text-xs text-muted-foreground">
          {t("account.accountDesc")}
        </p>
      </div>

      <AccountNav />

      {isLoading ? (
        <ProfileSkeleton />
      ) : data ? (
        <div className="space-y-6">
          {/* Identity Overview Card */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Profile Information
              </CardTitle>
              <CardDescription className="text-xs">
                Your personal account details and authentication identity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-border">
                <div className="h-16 w-16 rounded-full bg-elevated border-2 border-primary/30 flex items-center justify-center text-xl font-bold font-mono text-foreground shrink-0 shadow-inner overflow-hidden">
                  {data.user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.user.avatarUrl}
                      alt={data.user.fullName}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    getInitials(data.user.fullName)
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-foreground">
                      {data.user.fullName}
                    </h2>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-panel/60 font-mono"
                    >
                      Personal Account
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <span>{data.user.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Member since {formatDate(data.user.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Edit Personal Profile Form */}
              <form
                noValidate
                onSubmit={handleSubmit(onSubmit)}
                className="mt-6 w-full"
              >
                <div className="space-y-4 max-w-xl">
                  <Field error={errors.fullName?.message}>
                    <FieldLabel
                      htmlFor="fullName"
                      className="text-xs font-medium"
                    >
                      Full Name
                    </FieldLabel>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Your legal or preferred name"
                      className="h-8 text-xs bg-elevated/40"
                      {...register("fullName")}
                    />
                    <FieldError />
                  </Field>

                  <Field error={errors.avatarUrl?.message}>
                    <FieldLabel className="text-xs font-medium">
                      Avatar Image
                    </FieldLabel>
                    <Controller
                      name="avatarUrl"
                      control={control}
                      render={({ field }) => (
                        <ImagePicker
                          value={field.value}
                          onChange={(val) => {
                            field.onChange(val);
                            setData((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    user: {
                                      ...prev.user,
                                      avatarUrl: val,
                                    },
                                  }
                                : null,
                            );
                          }}
                          disabled={isSaving}
                        />
                      )}
                    />
                    <FieldError />
                  </Field>
                </div>

                {/* Form Actions aligned all the way to the right */}
                <div className="w-full flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border/40 mt-6">
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
                    {isSaving
                      ? "Saving..."
                      : saveStatus === "success"
                        ? "Saved!"
                        : "Save Profile"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Organization Memberships Card */}
          <Card className="border-border/80 bg-panel/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Organization Memberships & Roles
              </CardTitle>
              <CardDescription className="text-xs">
                Organizations you belong to and your current access tier
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel border-b border-border text-muted-foreground font-mono text-[11px]">
                    <tr>
                      <th className="px-3.5 py-2.5">Organization</th>
                      <th className="px-3.5 py-2.5">Role</th>
                      <th className="px-3.5 py-2.5">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.organizations.map((org) => (
                      <tr
                        key={org.id}
                        className="hover:bg-elevated/20 transition-colors"
                      >
                        <td className="px-3.5 py-2.5">
                          <div className="font-medium text-foreground">
                            {org.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {org.slug}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Badge
                            variant={
                              org.role === "owner"
                                ? "default"
                                : org.role === "admin"
                                  ? "info"
                                  : "outline"
                            }
                            className="capitalize text-[10px] font-mono"
                          >
                            {org.role === "owner" && (
                              <Shield className="h-3 w-3 mr-1 inline" />
                            )}
                            {org.role}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground font-mono text-[11px]">
                          {formatDate(org.joinedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-start gap-2 p-2.5 rounded-lg border border-border/60 bg-elevated/20 text-muted-foreground text-[11px]">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-info" />
                <div>
                  Organization roles and permissions are governed within each
                  organization. To modify member roles or transfer ownership,
                  navigate to Organization Settings & IAM.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
