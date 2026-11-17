"use client";

import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { maskEmail } from "@/lib/auth/email-validator";
import { AlertCircle, ArrowLeft, CheckCircle2, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

function VerificationPendingContent() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";

  const [email, setEmail] = React.useState(initialEmail);
  const [isEditingEmail, setIsEditingEmail] = React.useState(!initialEmail);
  const [isResending, setIsResending] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Cooldown countdown timer
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldown]);

  const handleResend = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) {
      setErrorMessage("Please provide a valid email address.");
      return;
    }

    setIsResending(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.retryAfter) {
          setCooldown(data.retryAfter);
        }
        throw new Error(data.error || "Failed to resend verification email.");
      }

      setSuccessMessage(
        data.message || "A new verification link has been sent to your email."
      );
      setCooldown(60); // 60s cooldown
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to resend verification email."
      );
    } finally {
      setIsResending(false);
    }
  };

  const displayMasked = email ? maskEmail(email) : "your email address";

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
            Distributed Postgres Control Plane
          </p>
        </div>

        {/* Card */}
        <Card className="border-border">
          <CardHeader className="space-y-1 pb-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
              <Mail className="h-6 w-6" />
            </div>
            <CardTitle className="text-base font-semibold">
              Verify your email address
            </CardTitle>
            <CardDescription className="text-xs">
              We&apos;ve sent a verification link to{" "}
              <strong className="text-foreground">{displayMasked}</strong>. Verify
              your account to continue using CHRONOS.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {successMessage && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-xs text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {isEditingEmail ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="h-8 text-xs"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full text-xs h-9"
                onClick={handleResend}
                disabled={isResending || cooldown > 0}
              >
                {isResending ? (
                  <>
                    <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Sending link...
                  </>
                ) : cooldown > 0 ? (
                  `Resend in ${cooldown}s`
                ) : (
                  "Resend verification email"
                )}
              </Button>

              <div className="flex items-center justify-between text-xs pt-1 text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setIsEditingEmail(!isEditingEmail)}
                  className="hover:text-foreground underline underline-offset-2"
                >
                  {isEditingEmail ? "Hide email field" : "Change email address"}
                </button>
                <Link
                  href="/register"
                  className="hover:text-foreground underline underline-offset-2"
                >
                  Create another account
                </Link>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-2 border-t border-border pt-4 text-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </CardFooter>
        </Card>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} CHRONOS Inc.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerificationPendingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground">
          Loading verification status...
        </div>
      }
    >
      <VerificationPendingContent />
    </React.Suspense>
  );
}
