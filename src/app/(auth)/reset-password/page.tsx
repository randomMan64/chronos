"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/shared/brand-logo";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isSuccess, setIsSuccess] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!token) {
      setErrorMessage("Missing recovery token. Please request a new password reset.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: values.password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password.");
      }

      setIsSuccess(true);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-center space-y-2">
          <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
          <div className="text-xs font-semibold text-foreground">
            Invalid Reset Link
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This password recovery link is missing a valid security token.
            Please request a fresh link using the forgot password form.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:opacity-90 transition-opacity"
        >
          Request New Reset Link
        </Link>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
        <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
        <div className="text-xs font-medium text-foreground">
          Password updated
        </div>
        <p className="text-[11px] text-muted-foreground">
          Your password has been reset. All prior active sessions have been revoked.
          You may now sign in with your new credentials.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full h-8 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:opacity-90 transition-opacity"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-3"
    >
      {errorMessage && (
        <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          {errorMessage}
        </div>
      )}

      <Field error={errors.password?.message}>
        <FieldLabel
          htmlFor="password"
          className="text-xs font-medium"
        >
          New Password
        </FieldLabel>
        <PasswordInput
          id="password"
          placeholder="••••••••"
          className="h-9 text-xs"
          {...register("password")}
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
        <PasswordInput
          id="confirmPassword"
          placeholder="••••••••"
          className="h-9 text-xs"
          {...register("confirmPassword")}
        />
        <FieldError />
      </Field>

      <Button
        type="submit"
        size="sm"
        className="w-full h-9 text-xs"
        disabled={isLoading}
      >
        {isLoading ? "Saving..." : "Update Password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center text-center space-y-1">
          <BrandLogo
            width={48}
            height={48}
            className="h-12 w-12 drop-shadow-xs"
            priority
          />
          <h1 className="text-xl font-bold tracking-tight">CHRONOS</h1>
          <p className="text-xs text-muted-foreground font-mono">
            Create New Password
          </p>
        </div>

        <Card className="border-border">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-base font-semibold">
              Set New Password
            </CardTitle>
            <CardDescription className="text-xs">
              Choose a strong password of at least 8 characters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <React.Suspense
              fallback={
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Loading recovery session...
                </div>
              }
            >
              <ResetPasswordForm />
            </React.Suspense>
          </CardContent>
          <CardFooter className="pt-0">
            <Link
              href="/login"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
