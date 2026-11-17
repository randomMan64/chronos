"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

type VerificationStatus =
  | "verifying"
  | "success"
  | "expired"
  | "already_used"
  | "invalid";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [status, setStatus] = React.useState<VerificationStatus>("verifying");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [associatedEmail, setAssociatedEmail] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    if (!token) {
      setStatus("invalid");
      setErrorMessage("No verification token was provided.");
      return;
    }

    let isMounted = true;

    async function verify() {
      try {
        const res = await fetch("/api/v1/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data.success) {
          setStatus("success");
          if (data.email) setAssociatedEmail(data.email);
        } else {
          if (data.email) setAssociatedEmail(data.email);
          if (data.code === "TOKEN_EXPIRED") {
            setStatus("expired");
            setErrorMessage(data.error || "The verification link has expired.");
          } else if (data.code === "TOKEN_ALREADY_USED") {
            setStatus("already_used");
            setErrorMessage(
              data.error || "This verification link has already been used.",
            );
          } else {
            setStatus("invalid");
            setErrorMessage(data.error || "Invalid verification link.");
          }
        }
      } catch (err) {
        if (!isMounted) return;
        setStatus("invalid");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Failed to verify email address.",
        );
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token]);

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

        {/* Verification Card */}
        <Card className="border-border">
          {status === "verifying" && (
            <>
              <CardHeader className="space-y-1 pb-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
                <CardTitle className="text-base font-semibold">
                  Verifying your email...
                </CardTitle>
                <CardDescription className="text-xs">
                  Please wait while we validate your security token.
                </CardDescription>
              </CardHeader>
            </>
          )}

          {status === "success" && (
            <>
              <CardHeader className="space-y-1 pb-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <CardTitle className="text-base font-semibold text-emerald-500">
                  Email verified successfully.
                </CardTitle>
                <CardDescription className="text-xs">
                  Your email address is now verified and your CHRONOS account is
                  active.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full text-xs h-9"
                  onClick={() => router.push("/login?verified=true")}
                >
                  Continue to Sign In
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </>
          )}

          {status === "expired" && (
            <>
              <CardHeader className="space-y-1 pb-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 mb-2">
                  <Clock className="h-6 w-6" />
                </div>
                <CardTitle className="text-base font-semibold text-amber-500">
                  Verification link expired
                </CardTitle>
                <CardDescription className="text-xs">
                  {errorMessage ||
                    "Verification links expire after 30 minutes for security."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link
                  href={
                    associatedEmail
                      ? `/verify-email/pending?email=${encodeURIComponent(associatedEmail)}`
                      : "/verify-email/pending"
                  }
                  className="block w-full"
                >
                  <Button variant="outline" className="w-full text-xs h-9">
                    Request a new verification link
                  </Button>
                </Link>
              </CardContent>
            </>
          )}

          {status === "already_used" && (
            <>
              <CardHeader className="space-y-1 pb-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <CardTitle className="text-base font-semibold">
                  Link already used
                </CardTitle>
                <CardDescription className="text-xs">
                  {errorMessage ||
                    "This link has already been used. If you are already verified, you can sign in directly."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full text-xs h-9"
                  onClick={() => router.push("/login")}
                >
                  Continue to Sign In
                </Button>
              </CardContent>
            </>
          )}

          {status === "invalid" && (
            <>
              <CardHeader className="space-y-1 pb-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
                  <XCircle className="h-6 w-6" />
                </div>
                <CardTitle className="text-base font-semibold text-destructive">
                  Invalid verification link
                </CardTitle>
                <CardDescription className="text-xs">
                  {errorMessage ||
                    "This verification link is invalid, corrupted, or has already expired."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/register" className="block w-full">
                  <Button variant="outline" className="w-full text-xs h-9">
                    Back to Registration
                  </Button>
                </Link>
              </CardContent>
            </>
          )}

          <CardFooter className="flex flex-col space-y-2 border-t border-border pt-4 text-center">
            <Link
              href="/login"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
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

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground">
          Loading verification...
        </div>
      }
    >
      <VerifyEmailContent />
    </React.Suspense>
  );
}
