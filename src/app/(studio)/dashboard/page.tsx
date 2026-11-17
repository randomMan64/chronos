"use client";

import * as React from "react";
import Link from "next/link";
import { MetricDisplay } from "@/components/shared/metric-display";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/shared/status-indicator";
import {
  Database,
  Terminal,
  Clock,
  Activity,
  ShieldCheck,
  Server,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  History,
  Archive,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const [session, setSession] = React.useState<{
    user?: { fullName: string; email: string };
    organizations?: Array<{ id: string; name: string; role: string }>;
    workspaces?: Array<{ id: string; name: string; environment: string }>;
  } | null>(null);

  const [isLoading, setIsLoading] = React.useState(true);
  const [dbCount, setDbCount] = React.useState(0);
  const [activeDbs, setActiveDbs] = React.useState<
    Array<{
      id: string;
      name: string;
      environment: string;
      status: string;
      lastTestedAt?: string;
    }>
  >([]);

  React.useEffect(() => {
    async function loadDashboard() {
      try {
        setIsLoading(true);
        const meRes = await fetch("/api/v1/auth/me");
        if (meRes.ok) {
          const data = await meRes.json();
          setSession(data);

          const orgId = data.organizations?.[0]?.id;
          if (orgId) {
            const dbRes = await fetch(
              `/api/v1/databases?organizationId=${orgId}`,
            );
            if (dbRes.ok) {
              const dbs = await dbRes.json();
              setActiveDbs(dbs.databases || []);
              setDbCount(dbs.databases?.length || 0);
            }
          }
        }
      } catch (err) {
        console.error("Dashboard failed to load:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const currentOrg = session?.organizations?.[0];
  const userRole = currentOrg?.role?.toUpperCase() || "MEMBER";

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="rounded-md border border-border bg-panel p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">
              Welcome back, {session?.user?.fullName || "Engineer"}
            </h1>
            <Badge variant="info" className="font-mono text-[10px]">
              {userRole}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Cluster control plane: {currentOrg?.name || "Acme Primary"} •
            Environment:{" "}
            <span className="text-foreground font-mono">
              {session?.workspaces?.[0]?.environment || "development"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/sql-editor"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary hover:opacity-90 text-primary-foreground text-xs font-medium transition-colors shadow"
          >
            <Terminal className="h-3.5 w-3.5" /> Launch SQL Gateway
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricDisplay
          label="Registered Databases"
          value={dbCount}
          subValue={`${dbCount} active clusters`}
          icon={<Database className="h-4 w-4 text-primary" />}
          isLoading={isLoading}
        />
        <MetricDisplay
          label="Control Plane Status"
          value="Operational"
          subValue="Latency < 5ms"
          icon={<Server className="h-4 w-4 text-emerald-500 dark:text-[#34D399]" />}
          isLoading={isLoading}
        />
        <MetricDisplay
          label="Temporal Tracking"
          value="Enabled"
          subValue="Triggers active"
          icon={<Clock className="h-4 w-4 text-primary" />}
          isLoading={isLoading}
        />
        <MetricDisplay
          label="Audit Integrity"
          value="Append-Only"
          subValue="Zero modification policy"
          icon={<ShieldCheck className="h-4 w-4 text-amber-500 dark:text-[#FBBF24]" />}
          isLoading={isLoading}
        />
      </div>

      {/* Core Studio Modules Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="hover:border-primary/60 transition-colors">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5">
                <Database className="h-4 w-4 text-primary" /> Database Explorer
              </CardTitle>
              <Badge variant="outline">Live</Badge>
            </div>
            <CardDescription>
              Browse schemas, inspect tables, view constraints, and paginate row
              records.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              href="/explorer"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Open Explorer <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/60 transition-colors">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5">
                <Terminal className="h-4 w-4 text-[#34D399]" /> SQL Gateway
              </CardTitle>
              <Badge variant="outline">Monaco</Badge>
            </div>
            <CardDescription>
              Execute authorized SQL queries with statement timeouts and live
              EXPLAIN analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              href="/sql-editor"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Open SQL Console <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/60 transition-colors">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-warning" /> Time Travel &
                Versions
              </CardTitle>
              <Badge variant="info">Core</Badge>
            </div>
            <CardDescription>
              Investigate historical versions, compare before/after diffs, and
              restore records.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link
              href="/temporal"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              Investigate History <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Connected Databases Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Connected PostgreSQL Clusters</CardTitle>
              <CardDescription className="text-[10px] mt-1">
                Active databases registered under your current workspace
              </CardDescription>
            </div>
            <Link
              href="/explorer"
              className="text-xs font-mono text-primary hover:underline"
            >
              + Register Cluster
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                  <th className="p-3 font-medium">Database Name</th>
                  <th className="p-3 font-medium">Environment</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Last Verified</th>
                  <th className="p-3 font-medium text-right">Quick Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 bg-muted rounded" />
                          <div className="h-4 w-28 bg-muted rounded" />
                        </div>
                      </td>
                      <td className="p-3"><div className="h-5 w-16 bg-muted rounded" /></td>
                      <td className="p-3"><div className="h-4 w-14 bg-muted rounded" /></td>
                      <td className="p-3"><div className="h-4 w-24 bg-muted rounded" /></td>
                      <td className="p-3 text-right"><div className="h-4 w-20 bg-muted rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : activeDbs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-xs text-muted-foreground font-mono"
                    >
                      No databases registered yet. Visit{" "}
                      <Link href="/explorer" className="text-primary underline">
                        Database Explorer
                      </Link>{" "}
                      to register your first Neon PostgreSQL database.
                    </td>
                  </tr>
                ) : (
                  activeDbs.map((db) => (
                    <tr key={db.id} className="hover:bg-elevated/40">
                      <td className="p-3 font-semibold text-foreground flex items-center gap-2">
                        <Server className="h-3.5 w-3.5 text-primary" />
                        <span>{db.name}</span>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            db.environment === "production"
                              ? "destructive"
                              : db.environment === "staging"
                                ? "warning"
                                : "info"
                          }
                          className="text-[10px]"
                        >
                          {db.environment}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <StatusIndicator status="active" label={db.status} />
                      </td>
                      <td className="p-3 text-[11px] text-muted-foreground">
                        {formatDate(db.lastTestedAt)}
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/explorer`}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Explore Schemas →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
