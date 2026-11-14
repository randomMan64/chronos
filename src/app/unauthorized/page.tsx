import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md p-6 bg-panel border border-border rounded-xl text-center space-y-4 shadow-xl">
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            <ShieldAlert className="h-8 w-8" />
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Access Restricted
          </h1>
          <p className="text-xs text-muted-foreground">
            You do not possess the required permissions or organization membership to view this resource.
          </p>
        </div>

        <div className="p-3 rounded-lg border border-border bg-elevated/40 text-xs text-muted-foreground font-mono text-left space-y-1">
          <div><span className="text-foreground font-medium">Status:</span> 403 Forbidden</div>
          <div><span className="text-foreground font-medium">Policy:</span> Strict Role-Based Tenant Isolation</div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-full sm:w-auto text-xs")}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Dashboard
          </Link>
          <Link
            href="/login"
            className={cn(buttonVariants({ size: "sm" }), "w-full sm:w-auto text-xs")}
          >
            Switch Account
          </Link>
        </div>
      </div>
    </div>
  );
}
