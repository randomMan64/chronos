"use client";

import * as React from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ArrowRight } from "lucide-react";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");

  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sign in");
      }

      // Safe returnUrl redirection
      const destination =
        returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")
          ? returnUrl
          : "/dashboard";

      router.push(destination);
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "Authentication failed",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-base font-semibold">
          Sign in to Studio
        </CardTitle>
        <CardDescription className="text-xs">
          Enter credentials to access your Postgres workspaces
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-3">
          {serverError && (
            <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {serverError}
            </div>
          )}

          <Field error={errors.email?.message}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="admin@chronos.internal"
              autoComplete="email"
              {...register("email")}
            />
            <FieldError />
          </Field>

          <Field error={errors.password?.message}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              placeholder="••••••••••••"
              autoComplete="current-password"
              {...register("password")}
            />
            <FieldError />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 pt-2">
          <Button type="submit" className="w-full" isLoading={isLoading}>
            Authenticate <ArrowRight className="ml-1 h-3 w-3" />
          </Button>

          <div className="text-center text-[11px] text-muted-foreground mt-1">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Create Organization
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center text-center space-y-1">
          <BrandLogo
            width={96}
            height={96}
            className="h-24 w-24 drop-shadow-md"
            priority
          />
          <p className="text-xs text-muted-foreground font-mono">
            Time-Travel PostgreSQL Engine
          </p>
        </div>

        <React.Suspense
          fallback={
            <div className="p-8 text-center text-xs text-muted-foreground">
              Loading login form...
            </div>
          }
        >
          <LoginForm />
        </React.Suspense>
      </div>
    </div>
  );
}
