"use client";

import * as React from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
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

const registerSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  organizationName: z.string().min(1, "Organization name is required"),
  email: z
    .string()
    .min(1, "Work email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      fullName: "",
      organizationName: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "Registration failed",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm space-y-4">
        {/* Brand */}
        <div className="flex flex-col items-center text-center space-y-1">
          <BrandLogo
            width={96}
            height={96}
            className="h-22 w-22 drop-shadow-md mb-1"
            priority
          />
          <p className="text-xs text-muted-foreground">
            Create Organization & Control Plane
          </p>
        </div>

        {/* Card */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Initialize Workspace</CardTitle>
            <CardDescription>
              Create your organization owner account. The owner role configures
              workspaces and registered databases.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-3 pt-3">
              {serverError && (
                <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                  {serverError}
                </div>
              )}

              <Field error={errors.fullName?.message}>
                <FieldLabel htmlFor="fullName">Full Name</FieldLabel>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Jane Doe"
                  {...register("fullName")}
                />
                <FieldError />
              </Field>

              <Field error={errors.organizationName?.message}>
                <FieldLabel htmlFor="organizationName">
                  Organization Name
                </FieldLabel>
                <Input
                  id="organizationName"
                  type="text"
                  placeholder="Acme Engineering"
                  {...register("organizationName")}
                />
                <FieldError />
              </Field>

              <Field error={errors.email?.message}>
                <FieldLabel htmlFor="email">Work Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="jane@acme.corp"
                  autoComplete="email"
                  {...register("email")}
                />
                <FieldError />
              </Field>

              <Field error={errors.password?.message}>
                <FieldLabel htmlFor="password">Master Password</FieldLabel>
                <PasswordInput
                  id="password"
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  {...register("password")}
                />
                {!errors.password && (
                  <FieldDescription>Minimum 8 characters</FieldDescription>
                )}
                <FieldError />
              </Field>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 pt-2">
              <Button type="submit" className="w-full" isLoading={isLoading}>
                Create Account <ArrowRight className="ml-1 h-3 w-3" />
              </Button>

              <div className="text-center text-[11px] text-muted-foreground mt-1">
                Already registered?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
