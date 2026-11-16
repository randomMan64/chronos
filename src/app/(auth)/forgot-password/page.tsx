"use client";

import * as React from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [submittedEmail, setSubmittedEmail] = React.useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setIsLoading(true);
    // Simulate safe password recovery flow (never leaks email existence)
    setTimeout(() => {
      setSubmittedEmail(values.email);
      setIsLoading(false);
    }, 600);
  };

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
          <p className="text-xs text-muted-foreground font-mono">
            Password Recovery
          </p>
        </div>

        <Card className="border-border">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-base font-semibold">
              Reset Password
            </CardTitle>
            <CardDescription className="text-xs">
              Enter your verified email address to receive password reset
              instructions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submittedEmail ? (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                <div className="text-xs font-medium text-foreground">
                  Recovery email dispatched
                </div>
                <p className="text-[11px] text-muted-foreground">
                  If an account exists for{" "}
                  <span className="font-mono text-foreground">
                    {submittedEmail}
                  </span>
                  , instructions have been sent.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="space-y-3"
              >
                <Field error={errors.email?.message}>
                  <FieldLabel htmlFor="email" className="text-xs font-medium">
                    Account Email
                  </FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="dba@enterprise.internal"
                    className="h-9 text-xs"
                    {...register("email")}
                  />
                  <FieldError />
                </Field>

                <Button
                  type="submit"
                  size="sm"
                  className="w-full h-9 text-xs"
                  disabled={isLoading}
                >
                  {isLoading ? "Verifying..." : "Send Reset Instructions"}
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="pt-0">
            <Link
              href="/login"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto mt-2"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
