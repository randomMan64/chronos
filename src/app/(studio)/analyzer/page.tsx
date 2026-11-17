"use client";

import * as React from "react";
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
import { MetricDisplay } from "@/components/shared/metric-display";
import { StatusIndicator } from "@/components/shared/status-indicator";
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
} from "lucide-react";
import { formatDate, formatDuration } from "@/lib/utils";

export default function AnalyzerPage() {
  const [databases, setDatabases] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<string>("slow");

  // Analytics data
  const [overview, setOverview] = React.useState<{
    totalCount: number;
    avgMs: number;
    maxMs: number;
    slowQueries: Array<{
      id: string;
      queryText: string;
      durationMs: number;
      status: string;
      executedAt: string;
    }>;
  } | null>(null);

  const [indexes, setIndexes] = React.useState<Array<{
    schemaname: string;
    table_name: string;
    index_name: string;
    scans_count: number;
    tuples_read: number;
    tuples_fetched: number;
  }>>([]);

  const [liveActivity, setLiveActivity] = React.useState<Array<{
    pid: number;
    usename: string;
    client_ip: string;
    application_name: string;
    state: string;
    duration_ms: number;
    query: string;
    wait_event: string;
  }>>([]);

  const [isLoading, setIsLoading] = React.useState(false);

  // 1. Initial Load: Fetch Session & Databases
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
              setDatabases(data.databases || []);
              if (data.databases?.length > 0) setSelectedDbId(data.databases[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load databases:", err);
      }
    }
    init();
  }, []);

  // 2. Fetch Performance & Diagnostics
  const loadPerformance = React.useCallback(async () => {
    if (!selectedDbId) return;
    setIsLoading(true);
    try {
      // 1. Overview & Slow queries
      const overRes = await fetch(`/api/v1/analytics/performance?databaseId=${selectedDbId}`);
      if (overRes.ok) {
        const overData = await overRes.json();
        setOverview(overData);
      }

      // 2. Index stats
      const idxRes = await fetch(`/api/v1/analytics/indexes?databaseId=${selectedDbId}`);
      if (idxRes.ok) {
        const idxData = await idxRes.json();
        setIndexes(idxData.indexes || []);
      }

      // 3. Live activity
      const actRes = await fetch(`/api/v1/analytics/activity?databaseId=${selectedDbId}`);
      if (actRes.ok) {
        const actData = await actRes.json();
        setLiveActivity(actData.activity || []);
      }
    } catch (err) {
      console.error("Failed to load performance metrics:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDbId]);

  React.useEffect(() => {
    loadPerformance();
  }, [loadPerformance]);

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">Query Analyzer & Diagnostics</h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              PostgreSQL Telemetry
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Investigate slow queries, evaluate index utilization, and monitor active connection states
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs w-full sm:w-auto">
            <Database className="h-3.5 w-3.5 text-primary shrink-0" />
            <Select value={selectedDbId} onValueChange={setSelectedDbId}>
              <SelectTrigger className="h-7 text-xs font-mono w-full sm:w-48">
                <SelectValue placeholder="Database" />
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

          <Button variant="outline" size="sm" onClick={loadPerformance} isLoading={isLoading} className="h-7 text-xs cursor-pointer">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Aggregate Metric Displays */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricDisplay
          label="Total Queries Tracked"
          value={overview?.totalCount || 0}
          subValue="All-time executed statements"
          icon={<Zap className="h-4 w-4 text-primary" />}
        />
        <MetricDisplay
          label="Average Duration"
          value={formatDuration(overview?.avgMs || 0)}
          subValue="Mean execution latency"
          icon={<Clock className="h-4 w-4 text-[#34D399]" />}
        />
        <MetricDisplay
          label="Peak Execution Time"
          value={formatDuration(overview?.maxMs || 0)}
          subValue="Slowest recorded query"
          icon={<AlertTriangle className="h-4 w-4 text-warning" />}
        />
        <MetricDisplay
          label="Active Connections"
          value={liveActivity.length}
          subValue="Live backend sessions"
          icon={<Activity className="h-4 w-4 text-[#60A5FA]" />}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-panel border border-border p-1 h-auto flex flex-wrap gap-1">
          <TabsTrigger value="slow" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>Slow Queries ({overview?.slowQueries?.length || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="indexes" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            <span>Index Statistics ({indexes.length})</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            <span>Live Sessions & Locks ({liveActivity.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Slow Queries */}
        <TabsContent value="slow" className="mt-4">
          <Card>
            <CardHeader className="py-2.5">
              <CardTitle className="text-xs">Top Slowest Queries</CardTitle>
              <CardDescription className="text-[11px]">
                Identified by actual PostgreSQL execution metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-2.5 font-medium">Duration</th>
                      <th className="p-2.5 font-medium">Statement</th>
                      <th className="p-2.5 font-medium">Status</th>
                      <th className="p-2.5 font-medium">Executed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview?.slowQueries?.map((q) => (
                      <tr key={q.id} className="hover:bg-elevated/40">
                        <td className="p-2.5 font-bold text-warning">
                          {formatDuration(q.durationMs)}
                        </td>
                        <td className="p-2.5 text-foreground truncate max-w-[450px]">
                          {q.queryText}
                        </td>
                        <td className="p-2.5">
                          <Badge
                            variant={q.status === "success" ? "success" : "destructive"}
                            className="text-[9px]"
                          >
                            {q.status}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-muted-foreground text-[11px]">
                          {formatDate(q.executedAt)}
                        </td>
                      </tr>
                    ))}
                    {(!overview?.slowQueries || overview.slowQueries.length === 0) && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-xs text-muted-foreground">
                          No slow queries recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Index Utilization */}
        <TabsContent value="indexes" className="mt-4">
          <Card>
            <CardHeader className="py-2.5">
              <CardTitle className="text-xs">PostgreSQL Index Utilization</CardTitle>
              <CardDescription className="text-[11px]">
                Inspected via `pg_stat_user_indexes` to detect unused or hot indexes
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-2.5 font-medium">Table</th>
                      <th className="p-2.5 font-medium">Index Name</th>
                      <th className="p-2.5 font-medium">Scans Count</th>
                      <th className="p-2.5 font-medium">Tuples Read</th>
                      <th className="p-2.5 font-medium">Tuples Fetched</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {indexes.map((idx) => (
                      <tr key={idx.index_name} className="hover:bg-elevated/40">
                        <td className="p-2.5 font-semibold text-foreground">{idx.table_name}</td>
                        <td className="p-2.5 text-primary">{idx.index_name}</td>
                        <td className="p-2.5 text-[#34D399] font-bold">
                          {idx.scans_count.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {idx.tuples_read.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {idx.tuples_fetched.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {indexes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                          No user index statistics available for this cluster.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Live Activity & Locks */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="py-2.5">
              <CardTitle className="text-xs">Live Connections & Lock Diagnostics</CardTitle>
              <CardDescription className="text-[11px]">
                Inspected via `pg_stat_activity`
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-2.5 font-medium">PID</th>
                      <th className="p-2.5 font-medium">State</th>
                      <th className="p-2.5 font-medium">Duration</th>
                      <th className="p-2.5 font-medium">Client IP</th>
                      <th className="p-2.5 font-medium">Wait Event</th>
                      <th className="p-2.5 font-medium">Query</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {liveActivity.map((a) => (
                      <tr key={a.pid} className="hover:bg-elevated/40">
                        <td className="p-2.5 font-bold text-foreground">{a.pid}</td>
                        <td className="p-2.5">
                          <Badge
                            variant={a.state === "active" ? "success" : "secondary"}
                            className="text-[9px]"
                          >
                            {a.state || "idle"}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-primary">{formatDuration(a.duration_ms)}</td>
                        <td className="p-2.5 text-muted-foreground">{a.client_ip || "localhost"}</td>
                        <td className="p-2.5 text-muted-foreground">{a.wait_event || "None"}</td>
                        <td className="p-2.5 truncate max-w-[280px] text-foreground">
                          {a.query}
                        </td>
                      </tr>
                    ))}
                    {liveActivity.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-xs text-muted-foreground">
                          No active background sessions.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
