"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Database,
  Terminal,
  Clock,
  RefreshCw,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  OverviewTelemetryResponse,
  TimeRangeKey,
} from "@/modules/overview/overview-service";
import { OverviewKpiGrid } from "@/components/dashboard/overview-kpis";
import {
  QueryVolumeChart,
  QueryLatencyChart,
  TransactionOutcomesChart,
  ConnectionUtilizationChart,
  QueryTypeDistributionChart,
  SlowQueryTrendChart,
  DatabaseStorageChart,
  DatabaseResourceSummaryCard,
} from "@/components/dashboard/overview-charts";
import {
  OverviewIssuesSection,
  OverviewRecentActivityTable,
} from "@/components/dashboard/overview-activity-issues";

const TIME_RANGES: Array<{ label: string; value: TimeRangeKey }> = [
  { label: "Last 15 min", value: "15m" },
  { label: "Last hour", value: "1h" },
  { label: "Last 6 hours", value: "6h" },
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
];

export default function DashboardPage() {
  const [session, setSession] = React.useState<{
    user?: { fullName: string; email: string };
    organizations?: Array<{ id: string; name: string; role: string }>;
    workspaces?: Array<{ id: string; name: string; environment: string }>;
  } | null>(null);

  const [telemetry, setTelemetry] = React.useState<OverviewTelemetryResponse | null>(null);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("all");
  const [timeRange, setTimeRange] = React.useState<TimeRangeKey>("24h");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // 1. Load initial session
  React.useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/v1/auth/me");
        if (res.ok) {
          const data = await res.json();
          setSession(data);
        }
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
    }
    loadSession();
  }, []);

  // 2. Fetch Dashboard Telemetry when workspace, db, or time range changes
  const fetchTelemetry = React.useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const params = new URLSearchParams();
      if (selectedDbId && selectedDbId !== "all") {
        params.set("databaseId", selectedDbId);
      }
      params.set("range", timeRange);

      const res = await fetch(`/api/v1/overview?${params.toString()}`);
      if (res.ok) {
        const data: OverviewTelemetryResponse = await res.json();
        setTelemetry(data);
      }
    } catch (err) {
      console.error("Failed to load dashboard telemetry:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedDbId, timeRange]);

  React.useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  const currentOrg = session?.organizations?.[0];
  const currentWs = session?.workspaces?.[0];
  const userRole = telemetry?.effectiveRoleLabel || currentOrg?.role?.toUpperCase() || "MEMBER";

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12 font-sans">
      {/* 1. Dashboard Header */}
      <div className="rounded-lg border border-border bg-panel p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">
              Operations Command Centre
            </h1>
            <Badge variant="info" className="font-mono text-[10px]">
              ROLE: {userRole}
            </Badge>
            {telemetry?.selectedDatabase && (
              <Badge variant="outline" className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 mr-1 animate-pulse" />
                {telemetry.selectedDatabase.status.toUpperCase()}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground font-mono truncate">
            Org: <span className="text-foreground">{currentOrg?.name || "Chronos"}</span> •
            Workspace: <span className="text-foreground">{currentWs?.name || "Production"}</span> •
            Env: <span className="text-foreground font-semibold uppercase">{currentWs?.environment || "production"}</span>
            {telemetry?.selectedDatabase?.version && (
              <span> • Engine: <span className="text-foreground">{telemetry.selectedDatabase.version}</span></span>
            )}
          </p>
        </div>

        {/* Filter Controls & Refresh */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          {/* Database Selector (shadcn Select) */}
          <Select value={selectedDbId} onValueChange={setSelectedDbId}>
            <SelectTrigger className="h-8 text-xs font-mono w-45 sm:w-50 bg-secondary/50 border-border">
              <div className="flex items-center gap-1.5 truncate">
                <Database className="h-3.5 w-3.5 text-primary shrink-0" />
                <SelectValue placeholder="Select Database" />
              </div>
            </SelectTrigger>
            <SelectContent className="font-mono text-xs">
              <SelectItem value="all">
                All Databases ({telemetry?.availableDatabases?.length || 0})
              </SelectItem>
              {telemetry?.availableDatabases?.map((db) => (
                <SelectItem key={db.id} value={db.id}>
                  {db.name} ({db.environment})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Time Range Selector (shadcn Select) */}
          <Select value={timeRange} onValueChange={(val) => setTimeRange(val as TimeRangeKey)}>
            <SelectTrigger className="h-8 text-xs font-mono w-35 sm:w-37.5 bg-secondary/50 border-border">
              <div className="flex items-center gap-1.5 truncate">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="font-mono text-xs">
              {TIME_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Manual Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTelemetry(true)}
            disabled={isRefreshing || isLoading}
            className="h-8 px-2.5 text-xs font-mono gap-1.5 border-border shrink-0"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : "text-muted-foreground"}`}
            />
            <span>Refresh</span>
          </Button>

          {/* Launch SQL Gateway */}
          <Link
            href="/sql-editor"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-primary hover:opacity-90 text-primary-foreground text-xs font-medium transition-colors shadow shrink-0 whitespace-nowrap"
          >
            <Terminal className="h-3.5 w-3.5" /> Launch SQL
          </Link>
        </div>
      </div>

      {/* Timestamp Indicator */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono px-1">
        <span>
          Window:{" "}
          <strong className="text-foreground">
            {telemetry ? formatDate(telemetry.timeRange.start) : "..."}
          </strong>{" "}
          &rarr;{" "}
          <strong className="text-foreground">
            {telemetry ? formatDate(telemetry.timeRange.end) : "..."}
          </strong>
        </span>
        <span>
          Last telemetry poll:{" "}
          <span className="text-foreground">
            {telemetry?.lastUpdated ? new Date(telemetry.lastUpdated).toLocaleTimeString() : "..."}
          </span>
        </span>
      </div>

      {/* 2. Compact KPI Section */}
      {isLoading && !telemetry ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-lg border border-border/60 bg-card/40 animate-pulse"
            />
          ))}
        </div>
      ) : telemetry ? (
        <OverviewKpiGrid kpis={telemetry.kpis} />
      ) : null}

      {/* 3. Main Visualization Grid */}
      {isLoading && !telemetry ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="col-span-1 lg:col-span-2 h-72 rounded-lg border border-border/60 bg-card/40 animate-pulse" />
          <div className="col-span-1 lg:col-span-2 h-72 rounded-lg border border-border/60 bg-card/40 animate-pulse" />
          <div className="h-60 rounded-lg border border-border/60 bg-card/40 animate-pulse" />
          <div className="h-60 rounded-lg border border-border/60 bg-card/40 animate-pulse" />
          <div className="h-60 rounded-lg border border-border/60 bg-card/40 animate-pulse" />
          <div className="h-60 rounded-lg border border-border/60 bg-card/40 animate-pulse" />
        </div>
      ) : telemetry ? (
        <div className="space-y-3">
          {/* Top Row: Volume & Latency (Responsive 2-column on desktop) */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <QueryVolumeChart data={telemetry.charts.queryVolume} />
            <QueryLatencyChart data={telemetry.charts.queryLatency} />
          </div>

          {/* Middle Row: Supporting Charts (4-column on desktop, 2-column on tablet) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <TransactionOutcomesChart data={telemetry.charts.transactionOutcomes} />
            <ConnectionUtilizationChart
              active={telemetry.charts.connectionUtilization.active}
              idle={telemetry.charts.connectionUtilization.idle}
              max={telemetry.charts.connectionUtilization.max}
              utilizationPct={telemetry.charts.connectionUtilization.utilizationPct}
            />
            <QueryTypeDistributionChart data={telemetry.charts.queryTypeDistribution} />
            <SlowQueryTrendChart data={telemetry.charts.slowQueryTrends} />
          </div>

          {/* Lower Row: Storage & Resource Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DatabaseStorageChart storage={telemetry.charts.databaseStorage} />
            <DatabaseResourceSummaryCard resource={telemetry.charts.resourceSummary} />
          </div>
        </div>
      ) : null}

      {/* 4. Operational Issues & Alerts */}
      {telemetry && <OverviewIssuesSection issues={telemetry.issues} />}

      {/* 5. Recent Activity Table */}
      {telemetry && (
        <OverviewRecentActivityTable activity={telemetry.recentActivity} />
      )}
    </div>
  );
}
