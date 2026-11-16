"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ArrowRight, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export default function InvitePage(props: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const [token, setToken] = React.useState<string | null>(null);
  const [invite, setInvite] = React.useState<{
    organizationName: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAccepting, setIsAccepting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  React.useEffect(() => {
    props.params.then((p) => {
      setToken(p.token);
      fetch(`/api/v1/invitations/${p.token}`)
        .then((res) => {
          if (!res.ok) throw new Error("Invalid or expired invitation");
          return res.json();
        })
        .then((data) => {
          setInvite(data.invitation);
        })
        .catch((err) => {
          setError(err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    });
  }, [props.params]);

  const handleAccept = async () => {
    if (!token) return;
    setIsAccepting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/invitations/${token}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept invitation");
      }
      setIsSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs font-mono">
            Resolving invitation credentials...
          </span>
        </div>
      </div>
    );
  }

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
            Organization Invitation
          </p>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Join Organization</CardTitle>
            <CardDescription>
              You have been invited to join a collaborative control plane
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-3">
            {error && (
              <div className="rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {isSuccess && (
              <div className="rounded border border-[#34D399]/30 bg-[#34D399]/10 p-2.5 text-xs text-[#34D399] flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Invitation accepted! Redirecting to studio...</span>
              </div>
            )}

            {invite && !isSuccess && (
              <div className="space-y-3 rounded-md border border-border bg-sidebar p-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    Target Organization
                  </span>
                  <span className="font-semibold text-foreground">
                    {invite.organizationName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Assigned Role</span>
                  <Badge variant="info" className="capitalize">
                    {invite.role}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Invited Email</span>
                  <span className="font-mono text-muted-foreground truncate max-w-40">
                    {invite.email}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-2 pt-1">
            {invite && !isSuccess && (
              <Button
                onClick={handleAccept}
                className="w-full"
                isLoading={isAccepting}
              >
                Accept & Join Organization{" "}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}

            <div className="text-center text-[11px] text-muted-foreground mt-1">
              Signed in with a different account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign In
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
