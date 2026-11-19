"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MetricDisplay } from "@/components/shared/metric-display";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Layers,
  Database,
  Clock,
  Zap,
  Activity,
  AlertTriangle,
  RefreshCw,
  Search,
  Server,
  Lock,
  Play,
  CheckCircle2,
  XCircle,
  FileText,
  Shield,
  Download,
  Terminal,
  HelpCircle,
  Copy,
  Table as TableIcon,
  Flame,
  GitBranch,
} from "lucide-react";
import { formatDate, formatDuration } from "@/lib/utils";
import { PerformanceRolePolicy } from "@/modules/analytics/performance-authorization";
import {
  DatabaseCapabilities,
  PerformanceOverviewMetrics,
  QueryPerformanceEntry,
  IndexStatisticEntry,
  LiveSessionEntry,
  TableStatisticEntry,
  DiagnosticRecommendation,
} from "@/modules/analytics/analytics-service";

export default function AnalyzerPage() {
  const searchParams = useSearchParams();
  const urlDbId = searchParams.get("databaseId");

  const [databases, setDatabases] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<string>("overview");
  const [timeRangeKey, setTimeRangeKey] = React.useState<string>("24h");

  // Capabilities & RBAC Policy
  const [capabilities, setCapabilities] = React.useState<DatabaseCapabilities | null>(null);
  const [policy, setPolicy] = React.useState<PerformanceRolePolicy | null>(null);

  // Analytics Data
  const [overview, setOverview] = React.useState<PerformanceOverviewMetrics | null>(null);
  const [queries, setQueries] = React.useState<QueryPerformanceEntry[]>([]);
  const [indexes, setIndexes] = React.useState<IndexStatisticEntry[]>([]);
  const [liveSessions, setLiveSessions] = React.useState<LiveSessionEntry[]>([]);
  const [blockedCount, setBlockedCount] = React.useState<number>(0);
  const [tables, setTables] = React.useState<TableStatisticEntry[]>([]);
  const [recommendations, setRecommendations] = React.useState<DiagnosticRecommendation[]>([]);

  // Query Inspector & EXPLAIN state
  const [inspectorQuery, setInspectorQuery] = React.useState<string>("");
  const [selectedQueryEntry, setSelectedQueryEntry] = React.useState<QueryPerformanceEntry | null>(null);
  const [explainPlan, setExplainPlan] = React.useState<any>(null);
  const [explainDurationMs, setExplainDurationMs] = React.useState<number | null>(null);
  const [isExplainAnalyzed, setIsExplainAnalyzed] = React.useState<boolean>(false);
  const [explainWarnings, setExplainWarnings] = React.useState<string[]>([]);
  const [isExplaining, setIsExplaining] = React.useState(false);

  // Modals & Confirmations
  const [analyzeConfirmOpen, setAnalyzeConfirmOpen] = React.useState(false);
  const [terminateTargetPid, setTerminateTargetPid] = React.useState<number | null>(null);
  const [isTerminating, setIsTerminating] = React.useState(false);
  const [actionMessage, setActionMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters & Search
  const [querySearch, setQuerySearch] = React.useState("");
  const [minDurationFilter, setMinDurationFilter] = React.useState<string>("0");
  const [indexFilter, setIndexFilter] = React.useState<"all" | "unused" | "invalid" | "high">("all");
  const [recSeverityFilter, setRecSeverityFilter] = React.useState<string>("all");

  const [isLoading, setIsLoading] = React.useState(false);

  // Compute timeRange dates
  const getTimeRangeDates = React.useCallback(() => {
    const end = new Date();
    let start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (timeRangeKey === "15m") start = new Date(end.getTime() - 15 * 60 * 1000);
    else if (timeRangeKey === "1h") start = new Date(end.getTime() - 60 * 60 * 1000);
    else if (timeRangeKey === "7d") start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeRangeKey === "30d") start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end };
  }, [timeRangeKey]);

  // 1. Initial Load: Databases
  React.useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const orgId = me.organizations?.[0]?.id;
          if (orgId) {
            const dbRes = await fetch(`/api/v1/databases?organizationId=${orgId}`);
            if (dbRes.ok) {
              const data = await dbRes.json();
              const list = data.databases || [];
              setDatabases(list);
              if (urlDbId && list.some((d: any) => d.id === urlDbId)) {
                setSelectedDbId(urlDbId);
              } else if (list.length > 0) {
                setSelectedDbId(list[0].id);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load databases:", err);
      }
    }
    init();
  }, []);

  // 2. Load Capabilities & Data when DB or TimeRange changes
  const loadData = React.useCallback(async () => {
    if (!selectedDbId) return;
    setIsLoading(true);
    setActionMessage(null);
    const { start, end } = getTimeRangeDates();

    try {
      // 1. Capabilities & Policy
      const capRes = await fetch(`/api/v1/analytics/capabilities?databaseId=${selectedDbId}`);
      if (capRes.ok) {
        const capData = await capRes.json();
        setCapabilities(capData.capabilities);
        setPolicy(capData.policy);
      }

      // 2. Overview
      const overRes = await fetch(
        `/api/v1/analytics/performance?databaseId=${selectedDbId}&start=${start.toISOString()}&end=${end.toISOString()}`
      );
      if (overRes.ok) {
        const overData = await overRes.json();
        setOverview(overData);
      }

      // 3. Queries
      const qRes = await fetch(
        `/api/v1/analytics/queries?databaseId=${selectedDbId}&start=${start.toISOString()}&end=${end.toISOString()}&minDuration=${minDurationFilter}&search=${encodeURIComponent(querySearch)}`
      );
      if (qRes.ok) {
        const qData = await qRes.json();
        setQueries(qData.queries || []);
      }

      // 4. Index Statistics
      const idxRes = await fetch(`/api/v1/analytics/indexes?databaseId=${selectedDbId}`);
      if (idxRes.ok) {
        const idxData = await idxRes.json();
        setIndexes(idxData.indexes || []);
      }

      // 5. Live Sessions & Activity
      const actRes = await fetch(`/api/v1/analytics/activity?databaseId=${selectedDbId}`);
      if (actRes.ok) {
        const actData = await actRes.json();
        setLiveSessions(actData.sessions || []);
        setBlockedCount(actData.blockedCount || 0);
      }

      // 6. Table Statistics
      const tblRes = await fetch(`/api/v1/analytics/tables?databaseId=${selectedDbId}`);
      if (tblRes.ok) {
        const tblData = await tblRes.json();
        setTables(tblData.tables || []);
      }

      // 7. Recommendations
      const recRes = await fetch(`/api/v1/analytics/recommendations?databaseId=${selectedDbId}`);
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecommendations(recData.recommendations || []);
      }
    } catch (err) {
      console.error("Failed to load telemetry:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDbId, getTimeRangeDates, minDurationFilter, querySearch]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Execute EXPLAIN or EXPLAIN ANALYZE
  const handleExplain = async (analyze: boolean) => {
    if (!selectedDbId || !inspectorQuery.trim()) return;
    setIsExplaining(true);
    setAnalyzeConfirmOpen(false);
    setActionMessage(null);

    try {
      const res = await fetch("/api/v1/analytics/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: selectedDbId,
          query: inspectorQuery.trim(),
          analyze,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate execution plan");
      }

      setExplainPlan(data.plan);
      setExplainDurationMs(data.executionTimeMs || null);
      setIsExplainAnalyzed(data.analyzed || false);
      setExplainWarnings(data.warnings || []);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "EXPLAIN error" });
    } finally {
      setIsExplaining(false);
    }
  };

  // Terminate Session
  const handleTerminateSession = async () => {
    if (!selectedDbId || !terminateTargetPid) return;
    setIsTerminating(true);
    setActionMessage(null);

    try {
      const res = await fetch("/api/v1/analytics/sessions/terminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: selectedDbId,
          pid: terminateTargetPid,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to terminate session");
      }

      setActionMessage({ type: "success", text: data.message || "Session terminated." });
      setTerminateTargetPid(null);
      // Reload activity
      loadData();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Termination failed" });
    } finally {
      setIsTerminating(false);
    }
  };

  // Export Telemetry
  const handleExport = () => {
    const dataStr = JSON.stringify(
      {
        overview,
        queries,
        indexes,
        tables,
        recommendations,
        collectionTime: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chronos-telemetry-${selectedDbId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered lists
  const filteredIndexes = React.useMemo(() => {
    return indexes.filter((idx) => {
      if (indexFilter === "unused") return idx.isUnusedCandidate;
      if (indexFilter === "invalid") return !idx.isValid;
      if (indexFilter === "high") return idx.isHighUsage;
      return true;
    });
  }, [indexes, indexFilter]);

  const filteredRecommendations = React.useMemo(() => {
    return recommendations.filter((r) => {
      if (recSeverityFilter === "all") return true;
      return r.severity === recSeverityFilter;
    });
  }, [recommendations, recSeverityFilter]);

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12 font-sans text-foreground">
      {/* Action Notification Toast */}
      {actionMessage && (
        <div
          className={`p-3 rounded-md text-xs flex items-center justify-between border ${
            actionMessage.type === "success"
              ? "bg-success/15 border-success/30 text-success"
              : "bg-destructive/15 border-destructive/30 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActionMessage(null)}
            className="h-6 px-2 text-[11px]"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              PostgreSQL Diagnostics & Performance Center
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] bg-sidebar">
              Live Catalogs
            </Badge>
            {policy && (
              <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                Role: {policy.label}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Engine statistics, query execution plans, index utilization, locking graphs, and bloat diagnostics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Database Selector */}
          <div className="flex items-center gap-1 text-xs">
            <Database className="h-3.5 w-3.5 text-primary shrink-0" />
            <Select value={selectedDbId} onValueChange={setSelectedDbId}>
              <SelectTrigger className="h-8 text-xs font-mono w-44 bg-sidebar">
                <SelectValue placeholder="Select Database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id} className="text-xs font-mono">
                    {db.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Filter */}
          <Select value={timeRangeKey} onValueChange={setTimeRangeKey}>
            <SelectTrigger className="h-8 text-xs font-mono w-32 bg-sidebar">
              <Clock className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15m" className="text-xs">Last 15 minutes</SelectItem>
              <SelectItem value="1h" className="text-xs">Last 1 hour</SelectItem>
              <SelectItem value="24h" className="text-xs">Last 24 hours</SelectItem>
              <SelectItem value="7d" className="text-xs">Last 7 days</SelectItem>
              <SelectItem value="30d" className="text-xs">Last 30 days</SelectItem>
            </SelectContent>
          </Select>

          {/* Export Button */}
          {policy?.canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="h-8 text-xs bg-sidebar cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
          )}

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            isLoading={isLoading}
            className="h-8 text-xs bg-sidebar cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Sensitive Query Masking Warning Banner for Data Analyst / Auditor */}
      {policy && !policy.canReadSensitiveQuery && (
        <div className="bg-primary/10 border border-primary/20 rounded-md p-2.5 text-xs flex items-center justify-between text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary shrink-0" />
            <span>
              <strong>RBAC Privacy Active:</strong> Sensitive query parameters and literals are masked for your role (
              {policy.label}).
            </span>
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-panel border border-border p-1 h-auto flex flex-wrap gap-1">
          <TabsTrigger value="overview" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            <span>Performance Overview</span>
          </TabsTrigger>
          <TabsTrigger value="queries" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>Query Performance ({queries.length})</span>
          </TabsTrigger>
          <TabsTrigger value="inspector" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5" />
            <span>Query Inspector & Plans</span>
          </TabsTrigger>
          {policy?.canViewIndexStats && (
            <TabsTrigger value="indexes" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              <span>Index Statistics ({indexes.length})</span>
            </TabsTrigger>
          )}
          {policy?.canViewLiveSessions && (
            <TabsTrigger value="sessions" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span>Live Sessions & Locks ({liveSessions.length})</span>
              {blockedCount > 0 && (
                <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">
                  {blockedCount} BLOCKED
                </Badge>
              )}
            </TabsTrigger>
          )}
          {policy?.canViewTableStats && (
            <TabsTrigger value="tables" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table Statistics ({tables.length})</span>
            </TabsTrigger>
          )}
          {policy?.canViewRecommendations && (
            <TabsTrigger value="recommendations" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5" />
              <span>Recommendations ({recommendations.length})</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ============================================================== */}
        {/* TAB 1: PERFORMANCE OVERVIEW */}
        {/* ============================================================== */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Key Metric Displays */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricDisplay
              label="Tracked Queries"
              value={overview?.totalQueriesTracked || 0}
              subValue={`${overview?.queriesInTimeRange || 0} executed in period`}
              icon={<Zap className="h-4 w-4 text-primary" />}
            />
            <MetricDisplay
              label="Average Execution Latency"
              value={formatDuration(overview?.averageExecutionDurationMs || 0)}
              subValue="Mean execution time"
              icon={<Clock className="h-4 w-4 text-[#34D399]" />}
            />
            <MetricDisplay
              label="Peak Execution Time"
              value={formatDuration(overview?.peakExecutionDurationMs || 0)}
              subValue={`${overview?.slowQueriesCount || 0} slow queries (≥100ms)`}
              icon={<AlertTriangle className="h-4 w-4 text-warning" />}
            />
            <MetricDisplay
              label="Active Connections"
              value={`${overview?.activeConnections || 0} / ${overview?.maxConnections || 100}`}
              subValue={`${overview?.connectionUtilizationPercent || 0}% server utilization`}
              icon={<Activity className="h-4 w-4 text-[#60A5FA]" />}
            />
          </div>

          {/* Secondary Telemetry Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="bg-panel border-border">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs font-semibold text-foreground">Buffer Cache Hit Ratio</CardTitle>
                <CardDescription className="text-[11px]">
                  Shared buffers efficiency from pg_stat_database
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold font-mono text-foreground">
                  {overview?.cacheHitRatioPercent !== null && overview?.cacheHitRatioPercent !== undefined
                    ? `${overview.cacheHitRatioPercent}%`
                    : "Unavailable"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Target is ≥ 99.0%. Low ratios indicate frequent disk reads and cache churn.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-panel border-border">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs font-semibold text-foreground">Query Reliability</CardTitle>
                <CardDescription className="text-[11px]">
                  Failed executions in selected time range
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold font-mono text-foreground">
                  {overview?.failedQueriesCount || 0}
                  <span className="text-xs font-normal text-muted-foreground ml-2">failed</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {overview?.failedQueriesCount === 0
                    ? "Zero query failures observed in window."
                    : "Queries encountered SQL errors or timeouts."}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-panel border-border">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs font-semibold text-foreground">PostgreSQL Engine Status</CardTitle>
                <CardDescription className="text-[11px]">
                  {capabilities?.pgVersion || "Detecting version..."}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-1 text-xs font-mono mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">pg_stat_statements:</span>
                  {capabilities?.pgStatStatementsInstalled ? (
                    <Badge variant="success" className="text-[9px]">Installed & Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] text-warning border-warning">
                      Not Installed
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">track_io_timing:</span>
                  <span className="text-foreground">{capabilities?.trackIoTiming ? "ON" : "OFF"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Telemetry Source:</span>
                  <span className="text-foreground text-[10px] truncate max-w-37.5">
                    {overview?.source || "PostgreSQL Live Catalogs"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Extension Notice Banner if pg_stat_statements is missing */}
          {capabilities && !capabilities.pgStatStatementsInstalled && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">
                  PostgreSQL Extension `pg_stat_statements` is not installed on this database.
                </p>
                <p className="text-muted-foreground mt-0.5">
                  CHRONOS is currently displaying individual execution telemetry captured through the CHRONOS SQL
                  Gateway. To capture engine-level aggregated query statistics and buffer hits directly from the
                  PostgreSQL planner, install the extension using:{" "}
                  <code className="bg-sidebar px-1 py-0.5 rounded text-[11px] font-mono text-primary">
                    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
                  </code>
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 2: QUERY PERFORMANCE TABLE */}
        {/* ============================================================== */}
        <TabsContent value="queries" className="mt-4 space-y-3">
          {/* Query Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-sidebar p-2.5 rounded-lg border border-border">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search SQL statement..."
                value={querySearch}
                onChange={(e) => setQuerySearch(e.target.value)}
                className="h-8 text-xs font-mono w-full sm:w-72 bg-panel"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-xs text-muted-foreground">Min Duration:</span>
              <Select value={minDurationFilter} onValueChange={setMinDurationFilter}>
                <SelectTrigger className="h-8 text-xs font-mono w-32 bg-panel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0" className="text-xs">All Queries</SelectItem>
                  <SelectItem value="10" className="text-xs">≥ 10ms</SelectItem>
                  <SelectItem value="50" className="text-xs">≥ 50ms</SelectItem>
                  <SelectItem value="100" className="text-xs">≥ 100ms (Slow)</SelectItem>
                  <SelectItem value="500" className="text-xs">≥ 500ms</SelectItem>
                  <SelectItem value="1000" className="text-xs">≥ 1000ms (1s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card className="border-border">
            <CardHeader className="py-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-semibold">PostgreSQL Query Telemetry Table</CardTitle>
                  <CardDescription className="text-[11px]">
                    Detailed query performance metrics from engine statistics and SQL Gateway records
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {queries.length} statements
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-2.5 font-medium">Source</th>
                      <th className="p-2.5 font-medium">Calls</th>
                      <th className="p-2.5 font-medium">Mean Duration</th>
                      <th className="p-2.5 font-medium">Total Duration</th>
                      <th className="p-2.5 font-medium">Rows</th>
                      <th className="p-2.5 font-medium">Cache Hit %</th>
                      <th className="p-2.5 font-medium">Normalized SQL Statement</th>
                      <th className="p-2.5 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {queries.map((q, idx) => (
                      <tr key={q.queryId || idx} className="hover:bg-elevated/40">
                        <td className="p-2.5">
                          <Badge
                            variant={q.source === "pg_stat_statements" ? "success" : "secondary"}
                            className="text-[9px] uppercase"
                          >
                            {q.source === "pg_stat_statements" ? "Engine Stats" : "SQL Gateway"}
                          </Badge>
                        </td>
                        <td className="p-2.5 font-bold text-foreground">{q.calls.toLocaleString()}</td>
                        <td className="p-2.5 font-semibold text-warning">
                          {formatDuration(q.meanDurationMs)}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {formatDuration(q.totalDurationMs)}
                        </td>
                        <td className="p-2.5 text-muted-foreground">{q.rowsReturned.toLocaleString()}</td>
                        <td className="p-2.5">
                          {q.cacheHitRatioPercent !== null ? (
                            <span
                              className={
                                q.cacheHitRatioPercent >= 95 ? "text-success font-medium" : "text-warning"
                              }
                            >
                              {q.cacheHitRatioPercent}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                        <td className="p-2.5 text-foreground truncate max-w-95">
                          {q.normalizedSql}
                        </td>
                        <td className="p-2.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedQueryEntry(q);
                              setInspectorQuery(q.normalizedSql);
                              setActiveTab("inspector");
                            }}
                            className="h-6 text-[10px] px-2 cursor-pointer"
                          >
                            Inspect & Plan
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {queries.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                          No query performance records matching the selected duration or time range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 3: QUERY INSPECTOR & EXECUTION PLAN */}
        {/* ============================================================== */}
        <TabsContent value="inspector" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Query Inspector & Execution Action */}
            <div className="lg:col-span-1 space-y-3">
              <Card className="border-border">
                <CardHeader className="py-2.5">
                  <CardTitle className="text-xs font-semibold">Query Inspection</CardTitle>
                  <CardDescription className="text-[11px]">
                    Inspect statement attributes or test planner execution plans
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-muted-foreground block">
                        SQL Statement
                      </label>
                      {/\$\d+/.test(inspectorQuery) && (
                        <span className="text-[10px] text-primary font-mono">
                          Normalized ($1 auto-substituted with NULL for EXPLAIN)
                        </span>
                      )}
                    </div>
                    <textarea
                      value={inspectorQuery}
                      onChange={(e) => setInspectorQuery(e.target.value)}
                      placeholder="SELECT * FROM table WHERE ..."
                      className="w-full h-32 p-2 bg-sidebar border border-border rounded font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {selectedQueryEntry && (
                    <div className="bg-sidebar p-2 rounded text-[11px] font-mono space-y-1 border border-border">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Execution Calls:</span>
                        <span className="text-foreground font-bold">{selectedQueryEntry.calls}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mean Latency:</span>
                        <span className="text-warning font-bold">
                          {formatDuration(selectedQueryEntry.meanDurationMs)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Time:</span>
                        <span className="text-muted-foreground">
                          {formatDuration(selectedQueryEntry.totalDurationMs)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Telemetry Source:</span>
                        <span className="text-foreground">{selectedQueryEntry.source}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExplain(false)}
                      isLoading={isExplaining}
                      className="w-full text-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Play className="h-3.5 w-3.5 text-primary" />
                      Generate EXPLAIN Plan
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!policy?.canExplainAnalyze}
                      onClick={() => setAnalyzeConfirmOpen(true)}
                      className="w-full text-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      EXPLAIN ANALYZE (Live Execution)
                    </Button>
                    {!policy?.canExplainAnalyze && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        EXPLAIN ANALYZE disabled: Insufficient role permissions.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Plan Visualizer */}
            <div className="lg:col-span-2">
              <Card className="border-border h-full flex flex-col">
                <CardHeader className="py-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xs font-semibold">PostgreSQL Execution Plan</CardTitle>
                      <CardDescription className="text-[11px]">
                        {isExplainAnalyzed
                          ? `Live execution analyzed (${explainDurationMs}ms)`
                          : "Estimated planner execution graph"}
                      </CardDescription>
                    </div>
                    {explainPlan && (
                      <Badge
                        variant={isExplainAnalyzed ? "destructive" : "secondary"}
                        className="text-[10px] font-mono"
                      >
                        {isExplainAnalyzed ? "LIVE EXECUTED" : "ESTIMATED ONLY"}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 p-3">
                  {explainWarnings.length > 0 && (
                    <div className="mb-3 p-2 rounded bg-warning/10 border border-warning/30 text-warning text-[11px]">
                      {explainWarnings.join(" ")}
                    </div>
                  )}

                  {explainPlan ? (
                    <div className="bg-sidebar p-3 rounded border border-border overflow-x-auto max-h-125">
                      <ExecutionPlanTree plan={explainPlan} />
                      <details className="mt-4 pt-2 border-t border-border">
                        <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                          View Raw Planner JSON
                        </summary>
                        <pre className="text-[10px] font-mono p-2 bg-panel rounded mt-2 text-muted-foreground overflow-x-auto">
                          {JSON.stringify(explainPlan, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-lg text-muted-foreground">
                      <Terminal className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-xs font-medium">No execution plan generated yet</p>
                      <p className="text-[11px] max-w-sm mt-1">
                        Select a query or type SQL into the inspector and click "Generate EXPLAIN Plan" to view
                        PostgreSQL node operations and cost breakdowns.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 4: INDEX STATISTICS */}
        {/* ============================================================== */}
        {policy?.canViewIndexStats && (
          <TabsContent value="indexes" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-sidebar p-2.5 rounded-lg border border-border">
              <div className="flex items-center gap-1.5">
                <Button
                  variant={indexFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIndexFilter("all")}
                  className="h-7 text-xs px-2.5"
                >
                  All Indexes ({indexes.length})
                </Button>
                <Button
                  variant={indexFilter === "unused" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIndexFilter("unused")}
                  className="h-7 text-xs px-2.5"
                >
                  Unused Candidates ({indexes.filter((i) => i.isUnusedCandidate).length})
                </Button>
                <Button
                  variant={indexFilter === "invalid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIndexFilter("invalid")}
                  className="h-7 text-xs px-2.5"
                >
                  Invalid ({indexes.filter((i) => !i.isValid).length})
                </Button>
                <Button
                  variant={indexFilter === "high" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIndexFilter("high")}
                  className="h-7 text-xs px-2.5"
                >
                  High Usage ({indexes.filter((i) => i.isHighUsage).length})
                </Button>
              </div>
            </div>

            <Card className="border-border">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs font-semibold">PostgreSQL User Index Utilization</CardTitle>
                <CardDescription className="text-[11px]">
                  Evaluated from `pg_stat_user_indexes` and `pg_index` to identify unused or hot indexes
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                        <th className="p-2.5 font-medium">Table</th>
                        <th className="p-2.5 font-medium">Index Name</th>
                        <th className="p-2.5 font-medium">Type</th>
                        <th className="p-2.5 font-medium">Size</th>
                        <th className="p-2.5 font-medium">Scans</th>
                        <th className="p-2.5 font-medium">Tuples Read</th>
                        <th className="p-2.5 font-medium">Tuples Fetched</th>
                        <th className="p-2.5 font-medium">Status / Badges</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredIndexes.map((idx) => (
                        <tr key={idx.indexName} className="hover:bg-elevated/40">
                          <td className="p-2.5 font-semibold text-foreground">
                            {idx.schema}.{idx.table}
                          </td>
                          <td className="p-2.5 text-primary font-medium">{idx.indexName}</td>
                          <td className="p-2.5 text-muted-foreground uppercase text-[10px]">{idx.indexType}</td>
                          <td className="p-2.5 font-bold text-foreground">{idx.sizePretty}</td>
                          <td className="p-2.5 text-[#34D399] font-bold">
                            {idx.scansCount.toLocaleString()}
                          </td>
                          <td className="p-2.5 text-muted-foreground">{idx.tuplesRead.toLocaleString()}</td>
                          <td className="p-2.5 text-muted-foreground">{idx.tuplesFetched.toLocaleString()}</td>
                          <td className="p-2.5 flex flex-wrap gap-1">
                            {!idx.isValid && (
                              <Badge variant="destructive" className="text-[9px]">INVALID</Badge>
                            )}
                            {idx.isPrimaryKey && (
                              <Badge variant="outline" className="text-[9px]">PK</Badge>
                            )}
                            {idx.isUnique && !idx.isPrimaryKey && (
                              <Badge variant="secondary" className="text-[9px]">UNIQUE</Badge>
                            )}
                            {idx.isUnusedCandidate && (
                              <Badge variant="warning" className="text-[9px]">0 Scans (Candidate)</Badge>
                            )}
                            {idx.isHighUsage && (
                              <Badge variant="success" className="text-[9px]">Hot Index</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filteredIndexes.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                            No indexes found matching current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ============================================================== */}
        {/* TAB 5: LIVE SESSIONS & LOCKS */}
        {/* ============================================================== */}
        {policy?.canViewLiveSessions && (
          <TabsContent value="sessions" className="mt-4 space-y-4">
            {blockedCount > 0 && (
              <div className="bg-destructive/15 border border-destructive/30 rounded-lg p-3 text-xs flex items-center justify-between text-destructive">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Lock Contention Alert:</strong> {blockedCount} session(s) are currently blocked waiting on
                    database locks.
                  </span>
                </div>
              </div>
            )}

            <Card className="border-border">
              <CardHeader className="py-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xs font-semibold">Live PostgreSQL Client Sessions</CardTitle>
                    <CardDescription className="text-[11px]">
                      Monitored via `pg_stat_activity` excluding background engine workers
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {liveSessions.length} active sessions
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                        <th className="p-2.5 font-medium">PID</th>
                        <th className="p-2.5 font-medium">State</th>
                        <th className="p-2.5 font-medium">Duration</th>
                        <th className="p-2.5 font-medium">User & App</th>
                        <th className="p-2.5 font-medium">Wait Event</th>
                        <th className="p-2.5 font-medium">Blocking Tree</th>
                        <th className="p-2.5 font-medium">Current Statement</th>
                        <th className="p-2.5 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {liveSessions.map((s) => (
                        <tr key={s.pid} className="hover:bg-elevated/40">
                          <td className="p-2.5 font-bold text-foreground">{s.pid}</td>
                          <td className="p-2.5">
                            <Badge
                              variant={s.state === "active" ? "success" : "secondary"}
                              className="text-[9px]"
                            >
                              {s.state}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-primary font-semibold">
                            {formatDuration(s.durationSeconds * 1000)}
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {s.username} ({s.applicationName})
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {s.waitEvent ? `${s.waitEventType}: ${s.waitEvent}` : "None"}
                          </td>
                          <td className="p-2.5">
                            {s.blockedByPids.length > 0 && (
                              <Badge variant="destructive" className="text-[9px]">
                                Blocked by {s.blockedByPids.join(", ")}
                              </Badge>
                            )}
                            {s.blockingPids.length > 0 && (
                              <Badge variant="warning" className="text-[9px]">
                                Blocking {s.blockingPids.join(", ")}
                              </Badge>
                            )}
                            {s.blockedByPids.length === 0 && s.blockingPids.length === 0 && (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-foreground truncate max-w-70">
                            {s.query || "idle"}
                          </td>
                          <td className="p-2.5 text-right">
                            {policy?.canTerminateSession ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setTerminateTargetPid(s.pid)}
                                className="h-6 text-[10px] px-2 cursor-pointer"
                              >
                                Terminate
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">Restricted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {liveSessions.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                            No client sessions currently active.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ============================================================== */}
        {/* TAB 6: TABLE STATISTICS & BLOAT */}
        {/* ============================================================== */}
        {policy?.canViewTableStats && (
          <TabsContent value="tables" className="mt-4 space-y-3">
            <Card className="border-border">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs font-semibold">PostgreSQL Table Diagnostics & Bloat</CardTitle>
                <CardDescription className="text-[11px]">
                  Monitored via `pg_stat_user_tables` to identify vacuum needs, dead tuples, and table sizes
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                        <th className="p-2.5 font-medium">Table</th>
                        <th className="p-2.5 font-medium">Live Tuples</th>
                        <th className="p-2.5 font-medium">Dead Tuples</th>
                        <th className="p-2.5 font-medium">Dead Ratio</th>
                        <th className="p-2.5 font-medium">Table Size</th>
                        <th className="p-2.5 font-medium">Index Size</th>
                        <th className="p-2.5 font-medium">Total Size</th>
                        <th className="p-2.5 font-medium">Seq vs Idx Scans</th>
                        <th className="p-2.5 font-medium">Last Autovacuum</th>
                        <th className="p-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tables.map((t) => (
                        <tr key={`${t.schema}.${t.tableName}`} className="hover:bg-elevated/40">
                          <td className="p-2.5 font-semibold text-foreground">
                            {t.schema}.{t.tableName}
                          </td>
                          <td className="p-2.5 text-foreground">{t.liveTuples.toLocaleString()}</td>
                          <td className="p-2.5 text-warning">{t.deadTuples.toLocaleString()}</td>
                          <td className="p-2.5 font-bold">
                            <span className={t.deadTupleRatioPercent > 20 ? "text-destructive" : "text-muted-foreground"}>
                              {t.deadTupleRatioPercent}%
                            </span>
                          </td>
                          <td className="p-2.5 text-muted-foreground">{t.tableSizePretty}</td>
                          <td className="p-2.5 text-muted-foreground">{t.indexSizePretty}</td>
                          <td className="p-2.5 font-bold text-foreground">{t.totalSizePretty}</td>
                          <td className="p-2.5 text-muted-foreground">
                            {t.sequentialScans} seq / {t.indexScans} idx
                          </td>
                          <td className="p-2.5 text-[11px] text-muted-foreground">
                            {t.lastAutoVacuum ? formatDate(t.lastAutoVacuum) : "Never"}
                          </td>
                          <td className="p-2.5">
                            {t.needsVacuum ? (
                              <Badge variant="destructive" className="text-[9px]">Needs Vacuum</Badge>
                            ) : (
                              <Badge variant="success" className="text-[9px]">Healthy</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                      {tables.length === 0 && (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-xs text-muted-foreground">
                            No user tables recorded in this database.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ============================================================== */}
        {/* TAB 7: RECOMMENDATIONS & DIAGNOSTICS */}
        {/* ============================================================== */}
        {policy?.canViewRecommendations && (
          <TabsContent value="recommendations" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filter by Severity:</span>
                <Select value={recSeverityFilter} onValueChange={setRecSeverityFilter}>
                  <SelectTrigger className="h-7 text-xs font-mono w-32 bg-sidebar">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Severities</SelectItem>
                    <SelectItem value="critical" className="text-xs">Critical</SelectItem>
                    <SelectItem value="high" className="text-xs">High</SelectItem>
                    <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                    <SelectItem value="low" className="text-xs">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Badge variant="outline" className="text-[10px] font-mono">
                {filteredRecommendations.length} action items
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {filteredRecommendations.map((rec) => (
                <Card key={rec.id} className="border-border bg-panel">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            rec.severity === "critical"
                              ? "destructive"
                              : rec.severity === "high"
                              ? "destructive"
                              : rec.severity === "medium"
                              ? "warning"
                              : "secondary"
                          }
                          className="text-[9px] uppercase font-mono"
                        >
                          {rec.severity}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] uppercase font-mono">
                          {rec.category}
                        </Badge>
                        <span className="text-xs font-semibold text-foreground">{rec.finding}</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        Target: {rec.affectedResource}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground bg-sidebar/60 p-2 rounded border border-border/40 font-mono">
                      <strong>Evidence:</strong> {rec.evidence}
                    </p>

                    <div className="text-xs space-y-1">
                      <div>
                        <strong className="text-foreground">Suggested Action:</strong>{" "}
                        <span className="text-muted-foreground">{rec.suggestedAction}</span>
                      </div>
                      <div>
                        <strong className="text-foreground">Expected Benefit:</strong>{" "}
                        <span className="text-success font-medium">{rec.expectedBenefit}</span>
                      </div>
                    </div>

                    {rec.sqlRemediation && (
                      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between bg-sidebar p-2 rounded">
                        <code className="text-[11px] font-mono text-primary truncate max-w-[80%]">
                          {rec.sqlRemediation}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(rec.sqlRemediation!);
                            setActionMessage({ type: "success", text: "Remediation SQL copied to clipboard!" });
                          }}
                          className="h-6 text-[10px] px-2 flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="h-3 w-3" /> Copy SQL
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {filteredRecommendations.length === 0 && (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2 opacity-70" />
                  <p className="font-semibold text-foreground">No Performance Bottlenecks Detected</p>
                  <p className="text-[11px] mt-1">
                    Buffer hit ratio, dead tuples, sequential scans, and index validity are all within optimal ranges.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Confirmation Dialog: EXPLAIN ANALYZE */}
      <Dialog open={analyzeConfirmOpen} onOpenChange={setAnalyzeConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Confirm Live EXPLAIN ANALYZE
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-2 space-y-2">
              <p>
                <strong>Warning:</strong> EXPLAIN ANALYZE actually executes this query on the target database to measure
                exact runtimes and buffer reads.
              </p>
              <p>
                To protect production stability, CHRONOS enforces a strict <strong>10-second timeout</strong> and rejects
                destructive DDL commands (DROP, TRUNCATE, ALTER).
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnalyzeConfirmOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleExplain(true)}
              className="text-xs"
            >
              Execute EXPLAIN ANALYZE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Session Termination */}
      <Dialog
        open={terminateTargetPid !== null}
        onOpenChange={(open) => !open && setTerminateTargetPid(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <Lock className="h-4 w-4" />
              Terminate Backend Session
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-2 space-y-2">
              <p>
                Are you sure you want to terminate PostgreSQL backend PID{" "}
                <strong className="text-foreground">{terminateTargetPid}</strong>?
              </p>
              <p>
                This will immediately issue <code>pg_terminate_backend({terminateTargetPid})</code> and sever the client
                connection, rolling back any in-flight transaction.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTerminateTargetPid(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleTerminateSession}
              isLoading={isTerminating}
              className="text-xs"
            >
              Terminate Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Visual Execution Plan Tree component.
 * Recursively renders PostgreSQL execution plan nodes, highlighting expensive Seq Scans and filter discards.
 */
function ExecutionPlanTree({ plan }: { plan: any }) {
  const rootNode = Array.isArray(plan) ? plan[0]?.Plan || plan[0] : plan?.Plan || plan;

  if (!rootNode || typeof rootNode !== "object") {
    return (
      <div className="text-xs font-mono text-muted-foreground">
        Unable to parse execution plan hierarchy.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 border-b border-border pb-2 text-xs font-mono">
        <span className="font-semibold text-foreground">Planner Node Hierarchy:</span>
      </div>
      <PlanNodeItem node={rootNode} depth={0} />
    </div>
  );
}

function PlanNodeItem({ node, depth }: { node: any; depth: number }) {
  const nodeType = node["Node Type"] || "Operation";
  const totalCost = node["Total Cost"];
  const actualTime = node["Actual Total Time"];
  const actualRows = node["Actual Rows"];
  const planRows = node["Plan Rows"];
  const relationName = node["Relation Name"];
  const filter = node["Filter"];
  const rowsRemovedByFilter = node["Rows Removed by Filter"];
  const plans = node["Plans"] || [];

  const isSeqScan = String(nodeType).toLowerCase().includes("seq scan");
  const isExpensive = (actualTime && actualTime > 50) || (totalCost && totalCost > 1000) || isSeqScan;

  return (
    <div style={{ marginLeft: `${depth * 16}px` }} className="border-l-2 border-border/70 pl-2.5 my-1.5">
      <div
        className={`p-2 rounded text-xs font-mono flex flex-col gap-1 ${
          isExpensive ? "bg-warning/10 border border-warning/30" : "bg-panel border border-border/40"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-bold ${
                isSeqScan ? "text-warning" : "text-primary"
              }`}
            >
              {nodeType}
            </span>
            {relationName && (
              <span className="text-foreground font-semibold">on {relationName}</span>
            )}
            {isSeqScan && (
              <Badge variant="warning" className="text-[8px] py-0 px-1">
                Full Table Scan
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            {totalCost !== undefined && <span>Cost: {totalCost}</span>}
            {actualTime !== undefined && (
              <span className="text-warning font-semibold">Time: {actualTime}ms</span>
            )}
            {actualRows !== undefined && <span>Rows: {actualRows}</span>}
          </div>
        </div>

        {filter && (
          <div className="text-[10px] text-muted-foreground truncate">
            <strong>Filter:</strong> {filter}
            {rowsRemovedByFilter !== undefined && (
              <span className="text-warning ml-2 font-semibold">
                ({rowsRemovedByFilter} rows discarded)
              </span>
            )}
          </div>
        )}
      </div>

      {plans.length > 0 && (
        <div className="mt-1">
          {plans.map((child: any, idx: number) => (
            <PlanNodeItem key={idx} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
