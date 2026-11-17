"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/shared/brand-logo";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CHRONOS_ROLES, normalizeRole } from "@/lib/permissions/roles";
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Building2,
  User,
  LogOut,
  Loader2,
} from "lucide-react";

const acceptNewUserSchema = z
  .object({
    fullName: z.string().min(1, "Full name is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type AcceptNewUserFormValues = z.infer<typeof acceptNewUserSchema>;

interface InvitationData {
  state:
    | "valid"
    | "expired"
    | "revoked"
    | "already_accepted"
    | "invalid"
    | "org_not_found"
    | "already_member";
  message?: string;
  invitation?: {
    id: string;
    organizationId: string;
    organizationName: string;
    inviterName: string;
    email: string;
    role: string;
    expiresAt: string;
    status: string;
  };
  userExists: boolean;
  isAlreadyMember: boolean;
  emailMismatch: boolean;
  currentUser?: {
    userId: string;
    email: string;
    fullName?: string;
  } | null;
}

function InvitationAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [isLoading, setIsLoading] = React.useState(true);
  const [data, setData] = React.useState<InvitationData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptNewUserFormValues>({
    resolver: zodResolver(acceptNewUserSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      fullName: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Fetch invitation validation details
  React.useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setData({
        state: "invalid",
        message:
          "No invitation token provided. Please click the link in your invitation email.",
        userExists: false,
        isAlreadyMember: false,
        emailMismatch: false,
      });
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch(`/api/v1/invitations/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to validate invitation");
        }
        return json;
      })
      .then((resData: InvitationData) => {
        if (isMounted) {
          setData(resData);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg =
            err instanceof Error ? err.message : "Failed to load invitation";
          setError(msg);
          setData({
            state: "invalid",
            message: msg,
            userExists: false,
            isAlreadyMember: false,
            emailMismatch: false,
          });
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handle Scenario B: Existing authenticated user acceptance
  const handleExistingUserAccept = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Failed to accept invitation");
      }

      setIsSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1200);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Scenario A: New user registration & acceptance
  const handleNewUserSubmit = async (values: AcceptNewUserFormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          fullName: values.fullName,
          password: values.password,
          confirmPassword: values.confirmPassword,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Failed to accept invitation");
      }

      setIsSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1200);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sign out and switch account
  const handleSwitchAccount = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    const returnUrl = `/invite/accept?token=${encodeURIComponent(token)}`;
    router.push(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  // Loading State
  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-mono">
            Validating invitation credentials...
          </p>
        </CardContent>
      </Card>
    );
  }

  // Success State
  if (isSuccess) {
    return (
      <Card className="border-border">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <CardTitle className="text-base font-semibold">
            Invitation Accepted
          </CardTitle>
          <CardDescription className="text-xs">
            You are now a member of{" "}
            {data?.invitation?.organizationName || "the organization"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4 pt-2">
          <p className="text-xs text-muted-foreground">
            Redirecting to your workspace dashboard...
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:opacity-90 transition-opacity"
            >
              Open Studio Dashboard <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Invalid / Expired / Revoked / Organization Not Found States
  if (!data || data.state !== "valid") {
    // Already Member
    if (data?.state === "already_member") {
      return (
        <Card className="border-border">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 border border-primary/30">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base font-semibold">
              Already a Member
            </CardTitle>
            <CardDescription className="text-xs">
              You already belong to {data.invitation?.organizationName}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2 text-center">
            <p className="text-xs text-muted-foreground">
              Your account has full access to this organization based on your
              assigned role.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:opacity-90 transition-opacity"
            >
              Go to Workspace Dashboard
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Already Accepted
    if (data?.state === "already_accepted") {
      return (
        <Card className="border-border">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted border border-border">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-base font-semibold">
              Invitation Already Accepted
            </CardTitle>
            <CardDescription className="text-xs">
              This invitation link has already been claimed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              If this was you, please sign in with your credentials to access
              your organization workspaces.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:opacity-90 transition-opacity"
            >
              Sign in to Studio
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Expired
    if (data?.state === "expired") {
      return (
        <Card className="border-border">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <CardTitle className="text-base font-semibold">
              Invitation Expired
            </CardTitle>
            <CardDescription className="text-xs">
              This security invitation link has expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {data.message ||
                "Organization invitations automatically expire after 7 days for security reasons. Please ask the organization owner to send a new invitation."}
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md border border-border bg-panel text-foreground hover:bg-elevated transition-colors"
            >
              Return to Sign In
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Revoked
    if (data?.state === "revoked") {
      return (
        <Card className="border-border">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <CardTitle className="text-base font-semibold">
              Invitation Revoked
            </CardTitle>
            <CardDescription className="text-xs">
              This invitation is no longer active.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              An administrator has revoked this invitation. If you believe this
              is an error, please reach out to the organization owner.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md border border-border bg-panel text-foreground hover:bg-elevated transition-colors"
            >
              Return to Sign In
            </Link>
          </CardContent>
        </Card>
      );
    }

    // Invalid Token or Org Not Found
    return (
      <Card className="border-border">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <CardTitle className="text-base font-semibold">
            Invalid Invitation
          </CardTitle>
          <CardDescription className="text-xs">
            Unable to locate this invitation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2 text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {data?.message ||
              "The invitation link is invalid or may have been removed. Please confirm the URL from your email."}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md border border-border bg-panel text-foreground hover:bg-elevated transition-colors"
          >
            Return to Sign In
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { invitation } = data;
  if (!invitation) return null;

  const returnUrl = `/invite/accept?token=${encodeURIComponent(token)}`;

  // Email Mismatch State (Scenario B edge case)
  if (data.emailMismatch && data.currentUser) {
    return (
      <Card className="border-border">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base font-semibold">
            Email Mismatch
          </CardTitle>
          <CardDescription className="text-xs">
            This invitation belongs to a different email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs space-y-2 text-foreground">
            <div className="flex items-center gap-1.5 font-medium text-amber-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Signed In As Different User</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This invitation was sent to{" "}
              <strong className="text-foreground">{invitation.email}</strong>.
              You are currently signed in as{" "}
              <strong className="text-foreground">
                {data.currentUser.email}
              </strong>
              .
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Please sign in using the invited email address to accept this
              invitation.
            </p>
          </div>

          {/* Invitation Details Summary */}
          <div className="p-3 rounded-md bg-panel/60 border border-border text-xs space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Invitation Details
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-muted-foreground">Organization:</span>
              <span className="font-semibold text-foreground">
                {invitation.organizationName}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-muted-foreground">Assigned Role:</span>
              <Badge
                variant="outline"
                className="text-[10px] font-mono capitalize"
              >
                {CHRONOS_ROLES[normalizeRole(invitation.role)]?.label || invitation.role}
              </Badge>
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <Button
              type="button"
              className="w-full h-8 text-xs font-medium cursor-pointer"
              onClick={handleSwitchAccount}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign Out &amp; Switch
              Account
            </Button>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md border border-border bg-panel text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
            >
              Continue to Dashboard as {data.currentUser.email}
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Scenario B: Existing Authenticated User (Emails Match)
  if (data.currentUser && !data.emailMismatch) {
    return (
      <Card className="border-border">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base font-semibold">
            Accept Organization Invitation
          </CardTitle>
          <CardDescription className="text-xs">
            Join <strong>{invitation.organizationName}</strong> with your
            existing account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              {error}
            </div>
          )}

          {/* Invitation Specs Card */}
          <div className="p-3.5 rounded-lg bg-panel/60 border border-border text-xs space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" /> Organization
              </span>
              <span className="font-semibold text-foreground">
                {invitation.organizationName}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" /> Invited
                By
              </span>
              <span className="text-foreground">{invitation.inviterName}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                Assigned Role
              </span>
              <Badge
                variant="info"
                className="text-[10px] font-mono capitalize px-1.5 py-0.5"
              >
                {CHRONOS_ROLES[normalizeRole(invitation.role)]?.label || invitation.role}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Expires
              </span>
              <span className="text-muted-foreground text-[11px] font-mono">
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-md bg-elevated/40 border border-border/60 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>
              Signed in as{" "}
              <strong className="text-foreground">
                {data.currentUser.fullName || data.currentUser.email}
              </strong>
            </span>
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="text-primary hover:underline text-[11px] cursor-pointer"
            >
              Switch
            </button>
          </div>

          <Button
            type="button"
            className="w-full h-9 text-xs font-semibold cursor-pointer"
            disabled={isSubmitting}
            onClick={handleExistingUserAccept}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{" "}
                Accepting Invitation...
              </>
            ) : (
              <>
                Accept Invitation &amp; Join{" "}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Scenario B (unauthenticated): User already has an account with this email
  if (data.userExists) {
    return (
      <Card className="border-border">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base font-semibold">
            Sign In to Accept Invitation
          </CardTitle>
          <CardDescription className="text-xs">
            An account already exists for <strong>{invitation.email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invitation Specs */}
          <div className="p-3.5 rounded-lg bg-panel/60 border border-border text-xs space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" /> Organization
              </span>
              <span className="font-semibold text-foreground">
                {invitation.organizationName}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" /> Invited
                By
              </span>
              <span className="text-foreground">{invitation.inviterName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                Assigned Role
              </span>
              <Badge
                variant="info"
                className="text-[10px] font-mono capitalize px-1.5 py-0.5"
              >
                {CHRONOS_ROLES[normalizeRole(invitation.role)]?.label || invitation.role}
              </Badge>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Please authenticate with your existing password to join{" "}
            <strong>{invitation.organizationName}</strong>. You will be
            redirected right back to complete acceptance.
          </p>

          <Link
            href={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}
            className="inline-flex items-center justify-center w-full h-9 text-xs font-semibold rounded-md bg-primary text-primary-foreground shadow hover:opacity-90 transition-opacity"
          >
            Sign in as {invitation.email}{" "}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </CardContent>
        <CardFooter className="pt-0 justify-center">
          <Link
            href="/forgot-password"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Forgot password?
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // Scenario A: New CHRONOS User (No account exists)
  return (
    <Card className="border-border">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base font-semibold">
          Accept Organization Invitation
        </CardTitle>
        <CardDescription className="text-xs">
          Join <strong>{invitation.organizationName}</strong> on CHRONOS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invitation Metadata Overview */}
        <div className="p-3.5 rounded-lg bg-panel/60 border border-border text-xs space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" /> Organization
            </span>
            <span className="font-semibold text-foreground">
              {invitation.organizationName}
            </span>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" /> Invited By
            </span>
            <span className="text-foreground">{invitation.inviterName}</span>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" /> Assigned
              Role
            </span>
            <Badge
              variant="info"
              className="text-[10px] font-mono capitalize px-1.5 py-0.5"
            >
              {CHRONOS_ROLES[normalizeRole(invitation.role)]?.label || invitation.role}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Expires On
            </span>
            <span className="text-muted-foreground text-[11px] font-mono">
              {new Date(invitation.expiresAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {error}
          </div>
        )}

        {/* New User Account Creation Form */}
        <form
          onSubmit={handleSubmit(handleNewUserSubmit)}
          noValidate
          className="space-y-3"
        >
          <Field error={errors.fullName?.message}>
            <FieldLabel htmlFor="fullName" className="text-xs font-medium">
              Full Name
            </FieldLabel>
            <Input
              id="fullName"
              placeholder="e.g. Jane Doe"
              className="h-9 text-xs"
              autoComplete="name"
              {...register("fullName")}
            />
            <FieldError />
          </Field>

          {/* Pre-filled read-only email */}
          <Field>
            <FieldLabel htmlFor="email" className="text-xs font-medium">
              Email Address (Pre-filled)
            </FieldLabel>
            <Input
              id="email"
              type="email"
              value={invitation.email}
              disabled
              readOnly
              className="h-9 text-xs bg-muted/50 cursor-not-allowed font-mono opacity-80"
            />
          </Field>

          <Field error={errors.password?.message}>
            <FieldLabel htmlFor="password" className="text-xs font-medium">
              Create Password
            </FieldLabel>
            <PasswordInput
              id="password"
              placeholder="Minimum 8 characters"
              className="h-9 text-xs"
              autoComplete="new-password"
              {...register("password")}
            />
            <FieldError />
          </Field>

          <Field error={errors.confirmPassword?.message}>
            <FieldLabel
              htmlFor="confirmPassword"
              className="text-xs font-medium"
            >
              Confirm Password
            </FieldLabel>
            <PasswordInput
              id="confirmPassword"
              placeholder="Re-enter password"
              className="h-9 text-xs"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            <FieldError />
          </Field>

          <Button
            type="submit"
            className="w-full h-9 text-xs font-semibold cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Creating
                Account &amp; Joining...
              </>
            ) : (
              <>
                Accept Invitation <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="pt-0 justify-center">
        <div className="text-[11px] text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}
            className="text-primary hover:underline font-medium"
          >
            Sign in
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm space-y-4">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-1">
          <BrandLogo
            width={48}
            height={48}
            className="h-12 w-12 drop-shadow-xs"
            priority
          />
          <p className="text-xs text-muted-foreground font-mono">
            Organization Onboarding
          </p>
        </div>

        <React.Suspense
          fallback={
            <Card className="border-border">
              <CardContent className="py-12 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground font-mono">
                  Loading invitation...
                </p>
              </CardContent>
            </Card>
          }
        >
          <InvitationAcceptContent />
        </React.Suspense>
      </div>
    </div>
  );
}
