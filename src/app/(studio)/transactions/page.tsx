"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Activity,
  Database,
  Clock,
  User,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Layers,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Download,
  AlertCircle,
  GitCommit,
  GitPullRequest,
  Lock,
  Zap,
  Info,
} from "lucide-react";
import { formatDate, formatDuration } from "@/lib/utils";

interface TransactionItem {
  id: string;
  databaseId: string;
  transactionId: string;
  actorId?: string;
  actorEmail?: string;
  status: "COMMITTED" | "ROLLED_BACK" | "FAILED" | "ACTIVE" | "ABORTED";
  queryText?: string;
  durationMs: number;
  startedAt: string;
  endedAt?: string;
  statementCount: number;
  rowsAffected: number;
  applicationName: string;
  hasError: boolean;
  errorMessage?: string;
  isOwn?: boolean;
}

interface TransactionMetrics {
  totalCount: number;
  committedCount: number;
  rolledBackCount: number;
  failedCount: number;
  activeCount: number;
  avgDurationMs: number;
  longRunningCount: number;
  lockWaitingCount: number;
}

interface StatementTrace {
  seq: number;
  operation: string;
  sql: string;
  startedAt: string;
  endedAt?: string;
  durationMs: number;
  rowCount?: number;
  rowsAffected?: number;
  status: "SUCCESS" | "ERROR";
  errorCode?: string;
  errorMessage?: string;
  table?: string;
}

interface MutationTrace {
  id: string;
  tableName: string;
  schemaName?: string;
  recordId: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  diff?: Record<string, unknown> | null;
  versionNumber: number;
  actor: string;
  timestamp: string;
  status: "COMMITTED" | "ATTEMPTED_DISCARDED";
  timeTravelUrl: string;
}

interface TimelineEvent {
  seq: number;
  timestamp: string;
  type: "BEGIN" | "STATEMENT" | "MUTATION" | "ERROR" | "COMMIT" | "ROLLBACK";
  label: string;
  details?: string;
  durationMs?: number;
  rowsAffected?: number;
  status: "SUCCESS" | "FAILED" | "DISCARDED";
  isFailureCause?: boolean;
}

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const urlDbId = searchParams.get("databaseId");
  const urlTxId = searchParams.get("txId");

  const [databases, setDatabases] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("");
  const [currentRole, setCurrentRole] = React.useState<string>("owner");

  // Filter States
  const [activeTab, setActiveTab] = React.useState<"history" | "live">("history");
  const [timeRange, setTimeRange] = React.useState<"15m" | "1h" | "24h" | "7d" | "30d">("24h");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [durationFilter, setDurationFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState<string>("");

  // Pagination
  const [page, setPage] = React.useState<number>(1);
  const [totalPages, setTotalPages] = React.useState<number>(1);
  const [totalMatches, setTotalMatches] = React.useState<number>(0);

  // Data States
  const [metrics, setMetrics] = React.useState<TransactionMetrics | null>(null);
  const [transactions, setTransactions] = React.useState<TransactionItem[]>([]);
  const [selectedTxId, setSelectedTxId] = React.useState<string>("");
  const [txDetails, setTxDetails] = React.useState<{
    transaction: any;
    timeline: TimelineEvent[];
    statements: StatementTrace[];
    mutations: MutationTrace[];
    outcome: any;
    policy: any;
  } | null>(null);

  // Inspector Sub-tab
  const [inspectorSubTab, setInspectorSubTab] = React.useState<
    "timeline" | "statements" | "mutations" | "summary"
  >("timeline");

  // Live Activity & Locks
  const [liveSessions, setLiveSessions] = React.useState<any[]>([]);
  const [blockingGraph, setBlockingGraph] = React.useState<any[]>([]);
  const [uninstrumentedNotice, setUninstrumentedNotice] = React.useState<string>("");
  const [terminateTargetPid, setTerminateTargetPid] = React.useState<number | null>(null);
  const [isTerminating, setIsTerminating] = React.useState<boolean>(false);

  // UI States
  const [isLoadingList, setIsLoadingList] = React.useState<boolean>(false);
  const [isLoadingDetails, setIsLoadingDetails] = React.useState<boolean>(false);
  const [isLoadingLive, setIsLoadingLive] = React.useState<boolean>(false);
  const [copiedStmtId, setCopiedStmtId] = React.useState<number | null>(null);
  const [actionMessage, setActionMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // 1. Initial Load: Auth context & Databases
  React.useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const orgId = me.organizations?.[0]?.id;
          const role = me.organizations?.[0]?.role || "owner";
          setCurrentRole(role);

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
  }, [urlDbId]);

  // 2. Fetch Overview Metrics
  const loadOverview = React.useCallback(async () => {
    if (!selectedDbId) return;
    try {
      const res = await fetch(
        `/api/v1/transactions/overview?databaseId=${selectedDbId}&range=${timeRange}`
      );
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics || null);
      }
    } catch {
      // ignore
    }
  }, [selectedDbId, timeRange]);

  // 3. Fetch Transactions List
  const loadTransactions = React.useCallback(async () => {
    if (!selectedDbId) return;
    setIsLoadingList(true);
    try {
      const params = new URLSearchParams();
      params.set("databaseId", selectedDbId);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      let minDuration = 0;
      if (durationFilter === "100ms") minDuration = 100;
      else if (durationFilter === "500ms") minDuration = 500;
      else if (durationFilter === "1s") minDuration = 1000;
      else if (durationFilter === "5s") minDuration = 5000;
      if (minDuration > 0) params.set("minDurationMs", String(minDuration));

      const limit = 25;
      const offset = (page - 1) * limit;
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const res = await fetch(`/api/v1/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list: TransactionItem[] = data.transactions || [];
        setTransactions(list);
        setTotalMatches(data.totalCount || 0);
        setTotalPages(data.totalPages || 1);

        if (urlTxId && list.some((t) => t.transactionId === urlTxId)) {
          setSelectedTxId(urlTxId);
        } else if (list.length > 0 && (!selectedTxId || !list.some((t) => t.transactionId === selectedTxId))) {
          setSelectedTxId(list[0].transactionId);
        } else if (list.length === 0) {
          setSelectedTxId("");
          setTxDetails(null);
        }
      }
    } catch {
      setTransactions([]);
    } finally {
      setIsLoadingList(false);
    }
  }, [selectedDbId, statusFilter, searchQuery, durationFilter, page, urlTxId, selectedTxId]);

  // 4. Fetch Details for Selected Transaction
  React.useEffect(() => {
    if (!selectedTxId) {
      setTxDetails(null);
      return;
    }

    let isMounted = true;
    setIsLoadingDetails(true);

    fetch(`/api/v1/transactions/${encodeURIComponent(selectedTxId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) {
          setTxDetails(data);
        }
      })
      .catch(() => {
        if (isMounted) setTxDetails(null);
      })
      .finally(() => {
        if (isMounted) setIsLoadingDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTxId]);

  // 5. Fetch Live Sessions & Lock Diagnostics
  const loadLiveActivity = React.useCallback(async () => {
    if (!selectedDbId || activeTab !== "live") return;
    setIsLoadingLive(true);
    try {
      const res = await fetch(`/api/v1/transactions/live?databaseId=${selectedDbId}`);
      if (res.ok) {
        const data = await res.json();
        setLiveSessions(data.sessions || []);
        setBlockingGraph(data.blockingGraph || []);
        setUninstrumentedNotice(data.uninstrumentedNotice || "");
      }
    } catch {
      setLiveSessions([]);
      setBlockingGraph([]);
    } finally {
      setIsLoadingLive(false);
    }
  }, [selectedDbId, activeTab]);

  React.useEffect(() => {
    loadOverview();
    loadTransactions();
  }, [loadOverview, loadTransactions]);

  React.useEffect(() => {
    if (activeTab === "live") {
      loadLiveActivity();
    }
  }, [activeTab, loadLiveActivity]);

  // Copy SQL Helper
  const handleCopySql = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStmtId(id);
    setTimeout(() => setCopiedStmtId(null), 2000);
  };

  // Safe Session Termination
  const handleTerminateSession = async () => {
    if (!selectedDbId || !terminateTargetPid) return;
    setIsTerminating(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/v1/transactions/live/terminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseId: selectedDbId, pid: terminateTargetPid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to terminate session");

      setActionMessage({
        type: "success",
        text: `Backend session (PID: ${terminateTargetPid}) terminated successfully.`,
      });
      setTerminateTargetPid(null);
      loadLiveActivity();
      loadOverview();
    } catch (err: any) {
      setActionMessage({
        type: "error",
        text: err.message || "Session termination rejected",
      });
    } finally {
      setIsTerminating(false);
    }
  };

  // Export Transactions as JSON
  const handleExportJson = () => {
    if (transactions.length === 0) return;
    const blob = new Blob([JSON.stringify(transactions, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${selectedDbId}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12 select-text">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-semibold text-foreground">Transaction Inspector</h1>
            <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/40">
              LIFECYCLE TRACING
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] uppercase">
              ROLE: {currentRole}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            End-to-end transaction lifecycle tracing, statement sequences, rollback forensics, Time Travel mutations, and lock diagnostics
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-primary shrink-0" />
            <Select value={selectedDbId} onValueChange={setSelectedDbId}>
              <SelectTrigger className="h-8 text-xs font-mono w-[180px]">
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

          <Select value={timeRange} onValueChange={(val: any) => setTimeRange(val)}>
            <SelectTrigger className="h-8 text-xs font-mono w-[110px]">
              <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15m">Last 15m</SelectItem>
              <SelectItem value="1h">Last 1 hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>

          {txDetails?.policy?.canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              disabled={transactions.length === 0}
              className="h-8 text-xs font-mono cursor-pointer"
            >
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadOverview();
              if (activeTab === "history") loadTransactions();
              else loadLiveActivity();
            }}
            isLoading={isLoadingList || isLoadingLive}
            className="h-8 text-xs cursor-pointer"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            actionMessage.type === "success"
              ? "bg-[#34D399]/10 border-[#34D399]/30 text-[#34D399]"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-muted-foreground hover:text-foreground text-xs cursor-pointer ml-3"
          >
            ×
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: TRANSACTION OVERVIEW KPI METRICS */}
      {/* ========================================================================= */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <Card className="p-2.5 border-border bg-panel">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block">
              Total Recorded
            </span>
            <div className="text-lg font-bold text-foreground font-mono mt-0.5">
              {metrics.totalCount.toLocaleString()}
            </div>
            <span className="text-[10px] text-muted-foreground">In selected window</span>
          </Card>

          <Card className="p-2.5 border-border bg-panel">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block">
              Committed
            </span>
            <div className="text-lg font-bold text-[#34D399] font-mono mt-0.5">
              {metrics.committedCount.toLocaleString()}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {metrics.totalCount > 0
                ? `${Math.round((metrics.committedCount / metrics.totalCount) * 100)}% success rate`
                : "0%"}
            </span>
          </Card>

          <Card className="p-2.5 border-border bg-panel">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block">
              Rolled Back
            </span>
            <div className="text-lg font-bold text-warning font-mono mt-0.5">
              {metrics.rolledBackCount.toLocaleString()}
            </div>
            <span className="text-[10px] text-muted-foreground">Discarded mutations</span>
          </Card>

          <Card className="p-2.5 border-border bg-panel">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block">
              Execution Failures
            </span>
            <div className="text-lg font-bold text-destructive font-mono mt-0.5">
              {metrics.failedCount.toLocaleString()}
            </div>
            <span className="text-[10px] text-muted-foreground">SQL error events</span>
          </Card>

          <Card className="p-2.5 border-border bg-panel">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block">
              Active Sessions
            </span>
            <div className="text-lg font-bold text-primary font-mono mt-0.5">
              {metrics.activeCount.toLocaleString()}
            </div>
            <span className="text-[10px] text-muted-foreground">Live in PostgreSQL</span>
          </Card>

          <Card className="p-2.5 border-border bg-panel">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block">
              Mean Duration
            </span>
            <div className="text-lg font-bold text-foreground font-mono mt-0.5">
              {formatDuration(metrics.avgDurationMs)}
            </div>
            <span className="text-[10px] text-muted-foreground">Execution latency</span>
          </Card>

          <Card className="p-2.5 border-border bg-panel">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block">
              Long-Running
            </span>
            <div className={`text-lg font-bold font-mono mt-0.5 ${metrics.longRunningCount > 0 ? "text-warning" : "text-muted-foreground"}`}>
              {metrics.longRunningCount.toLocaleString()}
            </div>
            <span className="text-[10px] text-muted-foreground">&gt; 5,000ms duration</span>
          </Card>

          <Card className="p-2.5 border-border bg-panel">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block">
              Lock Waits
            </span>
            <div className={`text-lg font-bold font-mono mt-0.5 ${metrics.lockWaitingCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {metrics.lockWaitingCount.toLocaleString()}
            </div>
            <span className="text-[10px] text-muted-foreground">Contended locks</span>
          </Card>
        </div>
      )}

      {/* Main Mode Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border/80">
        <button
          onClick={() => setActiveTab("history")}
          className={`px-3 py-2 text-xs font-medium cursor-pointer border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "history"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span>Lifecycle History &amp; Forensics</span>
        </button>

        <button
          onClick={() => setActiveTab("live")}
          className={`px-3 py-2 text-xs font-medium cursor-pointer border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === "live"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="h-3.5 w-3.5 text-warning" />
          <span>Live Transactions &amp; Lock Diagnostics</span>
          {metrics && metrics.lockWaitingCount > 0 && (
            <Badge variant="destructive" className="h-4 px-1 text-[9px]">
              {metrics.lockWaitingCount} lock wait
            </Badge>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIFECYCLE HISTORY & TRANSACTION DETAIL INSPECTOR */}
      {/* ========================================================================= */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {/* Filters Bar */}
          <Card className="border-border bg-panel">
            <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search Tx ID, SQL, or Actor..."
                    className="h-8 pl-8 font-mono text-xs w-full"
                  />
                </div>

                {/* Status Pills */}
                <div className="flex items-center gap-1 bg-sidebar rounded-md border border-border p-0.5 text-[11px] font-mono">
                  {(["all", "committed", "rolled_back", "failed", "started"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        setStatusFilter(st);
                        setPage(1);
                      }}
                      className={`px-2 py-0.5 rounded cursor-pointer transition-colors uppercase ${
                        statusFilter === st
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {st === "all" ? "ALL" : st.replace("_", " ")}
                    </button>
                  ))}
                </div>

                {/* Duration Filter */}
                <Select
                  value={durationFilter}
                  onValueChange={(val) => {
                    setDurationFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs font-mono w-[120px]">
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Durations</SelectItem>
                    <SelectItem value="100ms">&gt; 100 ms</SelectItem>
                    <SelectItem value="500ms">&gt; 500 ms</SelectItem>
                    <SelectItem value="1s">&gt; 1,000 ms</SelectItem>
                    <SelectItem value="5s">&gt; 5,000 ms</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Pagination counter & controls */}
              <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground ml-auto">
                <span>
                  Showing {transactions.length} of {totalMatches} events
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-7 w-7 p-0 cursor-pointer"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span>
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 w-7 p-0 cursor-pointer"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Master-Detail Split Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            {/* LEFT COLUMN: Transaction Lifecycle Table (5/12 cols) */}
            <Card className="lg:col-span-5 flex flex-col border-border">
              <CardHeader className="py-2.5 border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-primary" /> Lifecycle Events ({totalMatches})
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    PAGE {page}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0 overflow-x-auto max-h-[700px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="sticky top-0 bg-sidebar border-b border-border text-muted-foreground text-[10px] uppercase z-10">
                    <tr>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Transaction ID</th>
                      <th className="p-2.5">Actor</th>
                      <th className="p-2.5">Duration</th>
                      <th className="p-2.5">Started At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {isLoadingList ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="p-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                          <td className="p-2.5"><div className="h-4 w-28 bg-muted rounded" /></td>
                          <td className="p-2.5"><div className="h-4 w-20 bg-muted rounded" /></td>
                          <td className="p-2.5"><div className="h-4 w-12 bg-muted rounded" /></td>
                          <td className="p-2.5"><div className="h-4 w-24 bg-muted rounded" /></td>
                        </tr>
                      ))
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                          No transactions found matching the filter criteria. Execute statements in the SQL Gateway to generate trace events.
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => {
                        const isSelected = selectedTxId === tx.transactionId;
                        return (
                          <tr
                            key={tx.id}
                            onClick={() => setSelectedTxId(tx.transactionId)}
                            className={`hover:bg-elevated/70 cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-primary/10 border-l-2 border-primary text-foreground font-semibold"
                                : "text-muted-foreground"
                            }`}
                          >
                            <td className="p-2.5">
                              <Badge
                                variant={
                                  tx.status === "COMMITTED"
                                    ? "success"
                                    : tx.status === "ROLLED_BACK" || tx.status === "ABORTED"
                                    ? "warning"
                                    : tx.status === "ACTIVE"
                                    ? "info"
                                    : "destructive"
                                }
                                className="text-[9px] px-1.5 py-0"
                              >
                                {tx.status}
                              </Badge>
                            </td>

                            <td className="p-2.5 font-bold text-foreground truncate max-w-[140px]" title={tx.transactionId}>
                              {tx.transactionId}
                            </td>

                            <td className="p-2.5 truncate max-w-[100px]" title={tx.actorEmail || "system"}>
                              {tx.actorEmail || "system"}
                            </td>

                            <td className="p-2.5 font-mono text-primary">
                              {formatDuration(tx.durationMs)}
                            </td>

                            <td className="p-2.5 text-[11px] text-muted-foreground truncate">
                              {formatDate(tx.startedAt)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* RIGHT COLUMN: Transaction Detail Inspector (7/12 cols) */}
            <Card className="lg:col-span-7 flex flex-col border-border min-h-[550px]">
              {selectedTxId && txDetails ? (
                <>
                  <CardHeader className="py-2.5 border-b border-border/80 flex flex-row items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                          <FileCode className="h-3.5 w-3.5 text-primary" /> Trace: {txDetails.transaction.transactionId}
                        </CardTitle>
                        <Badge
                          variant={
                            txDetails.outcome.isCommitted
                              ? "success"
                              : txDetails.outcome.isRolledBack
                              ? "warning"
                              : "destructive"
                          }
                          className="text-[10px] font-mono uppercase"
                        >
                          {txDetails.outcome.status}
                        </Badge>
                      </div>
                      <CardDescription className="text-[11px] font-mono mt-0.5">
                        Duration: {formatDuration(txDetails.transaction.durationMs)} • {txDetails.statements.length} statement(s) • {txDetails.mutations.length} mutation(s)
                      </CardDescription>
                    </div>

                    {/* Sub-tab switcher */}
                    <div className="flex items-center bg-sidebar rounded border border-border p-0.5 text-[11px] font-mono">
                      {(["timeline", "statements", "mutations", "summary"] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setInspectorSubTab(tab)}
                          className={`px-2 py-0.5 rounded transition-colors cursor-pointer capitalize ${
                            inspectorSubTab === tab
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  </CardHeader>

                  <CardContent className="p-3 flex-1 flex flex-col space-y-3 overflow-y-auto max-h-[640px]">
                    {/* Outcome Banner */}
                    <div
                      className={`p-2.5 rounded border text-xs flex items-start gap-2.5 ${
                        txDetails.outcome.isCommitted
                          ? "bg-[#34D399]/10 border-[#34D399]/30 text-[#34D399]"
                          : txDetails.outcome.isRolledBack
                          ? "bg-warning/10 border-warning/30 text-warning"
                          : "bg-destructive/10 border-destructive/30 text-destructive"
                      }`}
                    >
                      {txDetails.outcome.isCommitted ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5">
                        <div className="font-semibold font-mono text-[11px]">
                          {txDetails.outcome.isCommitted
                            ? "TRANSACTION COMMITTED PERMANENTLY"
                            : txDetails.outcome.isRolledBack
                            ? "TRANSACTION ROLLED BACK — MUTATIONS DISCARDED"
                            : "TRANSACTION EXECUTION FAILED"}
                        </div>
                        <p className="text-[11px] opacity-90 leading-relaxed font-sans">
                          {txDetails.outcome.explanation}
                        </p>
                        {txDetails.outcome.error && (
                          <div className="mt-1 p-1.5 rounded bg-panel/80 border border-destructive/40 text-[10px] font-mono text-destructive">
                            Error: {txDetails.outcome.error.message || "Execution exception"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SUB-TAB A: TIMELINE VISUALIZATION */}
                    {inspectorSubTab === "timeline" && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
                          Chronological Event Flow
                        </div>

                        <div className="relative border-l-2 border-border/80 ml-3.5 space-y-3.5 py-1">
                          {txDetails.timeline.map((evt) => {
                            const isFail = evt.isFailureCause;
                            return (
                              <div key={evt.seq} className="relative pl-5 group">
                                <span
                                  className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 flex items-center justify-center text-[9px] font-mono ${
                                    isFail
                                      ? "bg-destructive border-destructive text-destructive-foreground"
                                      : evt.type === "COMMIT"
                                      ? "bg-[#34D399] border-[#34D399] text-black font-bold"
                                      : evt.type === "BEGIN"
                                      ? "bg-primary border-primary text-primary-foreground font-bold"
                                      : "bg-sidebar border-border text-muted-foreground"
                                  }`}
                                >
                                  {evt.seq}
                                </span>

                                <div
                                  className={`p-2.5 rounded border text-xs font-mono transition-all ${
                                    isFail
                                      ? "border-destructive/60 bg-destructive/10 text-destructive"
                                      : "border-border bg-sidebar text-foreground"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 font-bold">
                                      <span>{evt.label}</span>
                                      {evt.durationMs !== undefined && evt.durationMs > 0 && (
                                        <span className="text-[10px] text-muted-foreground font-normal">
                                          ({formatDuration(evt.durationMs)})
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                      {formatDate(evt.timestamp)}
                                    </span>
                                  </div>

                                  {evt.details && (
                                    <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap break-all">
                                      {evt.details}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB B: SQL STATEMENT INSPECTOR */}
                    {inspectorSubTab === "statements" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground uppercase">
                          <span>Executed Statements ({txDetails.statements.length})</span>
                          <span>Sequential Execution</span>
                        </div>

                        {txDetails.statements.map((stmt) => (
                          <div
                            key={stmt.seq}
                            className={`p-3 rounded border text-xs font-mono space-y-2 ${
                              stmt.status === "ERROR"
                                ? "border-destructive/60 bg-destructive/10"
                                : "border-border bg-sidebar"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground font-bold">#{stmt.seq}</span>
                                <Badge
                                  variant={stmt.status === "ERROR" ? "destructive" : "outline"}
                                  className="text-[9px] px-1.5 py-0"
                                >
                                  {stmt.operation}
                                </Badge>
                                {stmt.durationMs > 0 && (
                                  <span className="text-primary text-[10px]">
                                    {formatDuration(stmt.durationMs)}
                                  </span>
                                )}
                                {stmt.rowsAffected !== undefined && stmt.rowsAffected > 0 && (
                                  <span className="text-[#34D399] text-[10px]">
                                    {stmt.rowsAffected} row(s) affected
                                  </span>
                                )}
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopySql(stmt.sql, stmt.seq)}
                                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                {copiedStmtId === stmt.seq ? (
                                  <>
                                    <Check className="h-3 w-3 mr-1 text-[#34D399]" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 mr-1" /> Copy SQL
                                  </>
                                )}
                              </Button>
                            </div>

                            <pre className="p-2.5 rounded bg-panel border border-border text-[11px] text-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-36 select-text">
                              {stmt.sql}
                            </pre>

                            {stmt.status === "ERROR" && stmt.errorMessage && (
                              <div className="p-2 rounded bg-destructive/20 border border-destructive/40 text-destructive text-[11px] flex items-center gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                  [{stmt.errorCode || "SQLSTATE_ERROR"}]: {stmt.errorMessage}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* SUB-TAB C: MUTATION INSPECTOR (TIME TRAVEL INTEGRATION) */}
                    {inspectorSubTab === "mutations" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground uppercase">
                          <span>Correlated Time Travel Mutations ({txDetails.mutations.length})</span>
                          <span>Row-Level Snapshots</span>
                        </div>

                        {txDetails.mutations.length === 0 ? (
                          <div className="p-8 text-center text-xs text-muted-foreground font-mono border border-border rounded bg-sidebar">
                            No temporal row mutations recorded for this transaction. Queries without row mutations (SELECT, DDL, or aborted transactions) do not write row versions.
                          </div>
                        ) : (
                          txDetails.mutations.map((m) => (
                            <div
                              key={m.id}
                              className="p-3 rounded border border-border bg-sidebar text-xs font-mono space-y-2"
                            >
                              <div className="flex items-center justify-between flex-wrap gap-1">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant={
                                      m.operation === "INSERT"
                                        ? "success"
                                        : m.operation === "UPDATE"
                                        ? "info"
                                        : "destructive"
                                    }
                                    className="text-[9px] px-1.5 py-0"
                                  >
                                    {m.operation}
                                  </Badge>
                                  <span className="font-bold text-foreground">{m.tableName}</span>
                                  <span className="text-muted-foreground">ID: {m.recordId}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant={m.status === "COMMITTED" ? "secondary" : "destructive"}
                                    className="text-[9px]"
                                  >
                                    {m.status}
                                  </Badge>
                                  <a
                                    href={m.timeTravelUrl}
                                    className="text-primary hover:underline text-[10px] flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>Time Travel v{m.versionNumber}</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </div>

                              {/* Snapshot Diff details */}
                              <div className="p-2 rounded bg-panel border border-border text-[10px] text-muted-foreground overflow-x-auto max-h-40">
                                {m.operation === "UPDATE" && m.diff ? (
                                  <div className="space-y-1">
                                    <div className="font-semibold text-foreground">Modified Attributes:</div>
                                    <pre className="text-primary font-mono whitespace-pre-wrap">
                                      {JSON.stringify(m.diff, null, 2)}
                                    </pre>
                                  </div>
                                ) : (
                                  <pre className="font-mono whitespace-pre-wrap">
                                    {JSON.stringify(m.newValues || m.previousValues, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* SUB-TAB D: METADATA & SUMMARY */}
                    {inspectorSubTab === "summary" && (
                      <div className="space-y-3 font-mono text-[11px]">
                        <div className="p-3 rounded border border-border bg-sidebar space-y-2">
                          <div className="font-semibold text-foreground uppercase tracking-wider text-xs border-b border-border pb-1.5">
                            Transaction Metadata &amp; Client Context
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                            <div>
                              <span className="block text-[10px] uppercase">Transaction ID</span>
                              <strong className="text-foreground">{txDetails.transaction.transactionId}</strong>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase">PostgreSQL XID</span>
                              <strong className="text-foreground">{txDetails.transaction.postgresXid || "N/A"}</strong>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase">CHRONOS Trace ID</span>
                              <strong className="text-foreground">{txDetails.transaction.traceId}</strong>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase">Application Name</span>
                              <strong className="text-foreground">{txDetails.transaction.applicationName}</strong>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase">Actor Email</span>
                              <strong className="text-foreground">{txDetails.transaction.actorEmail || "system"}</strong>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase">Execution Duration</span>
                              <strong className="text-primary">{formatDuration(txDetails.transaction.durationMs)}</strong>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase">Started At</span>
                              <span className="text-foreground">{formatDate(txDetails.transaction.startedAt)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase">Ended At</span>
                              <span className="text-foreground">{txDetails.transaction.endedAt ? formatDate(txDetails.transaction.endedAt) : "Active"}</span>
                            </div>
                          </div>
                        </div>

                        {txDetails.transaction.queryText && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-muted-foreground font-semibold">
                              Full Transaction Script
                            </span>
                            <pre className="p-3 rounded bg-sidebar border border-border text-[11px] font-mono text-primary whitespace-pre-wrap overflow-x-auto max-h-48 select-text">
                              {txDetails.transaction.queryText}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </>
              ) : (
                <EmptyState
                  icon={<Activity className="h-8 w-8 text-primary" />}
                  title="No Transaction Selected"
                  description="Select a transaction event from the lifecycle table to inspect the chronological timeline, statements, and Time Travel mutations."
                  className="m-auto"
                />
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LIVE TRANSACTIONS & LOCK DIAGNOSTICS */}
      {/* ========================================================================= */}
      {activeTab === "live" && (
        <div className="space-y-3">
          {/* Uninstrumented Direct Connection Notice */}
          {uninstrumentedNotice && (
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/10 text-xs flex items-start gap-2.5">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-foreground text-[11px] leading-relaxed">
                {uninstrumentedNotice}
              </p>
            </div>
          )}

          {/* Section A: Blocking Relationships Graph */}
          {blockingGraph.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/10">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Lock Contention Detected ({blockingGraph.length} blocked session(s))
                </CardTitle>
                <CardDescription className="text-[11px] text-destructive/80">
                  Transactions waiting on row, relation, or table locks from another PostgreSQL backend
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {blockingGraph.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded bg-panel border border-destructive/40 text-xs font-mono grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                  >
                    <div className="md:col-span-5 space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase">
                        Blocking Transaction (PID {item.blockerPid})
                      </div>
                      <div className="text-foreground font-bold">{item.blockerUser}</div>
                      <div className="text-[11px] text-muted-foreground truncate" title={item.blockerQuery}>
                        {item.blockerQuery}
                      </div>
                    </div>

                    <div className="md:col-span-2 text-center flex flex-col items-center">
                      <ArrowRight className="h-4 w-4 text-destructive" />
                      <span className="text-[10px] text-destructive font-bold">{item.lockType}</span>
                      <span className="text-[9px] text-muted-foreground">{item.relationName}</span>
                    </div>

                    <div className="md:col-span-5 space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase">
                        Blocked Waiter (PID {item.blockedPid})
                      </div>
                      <div className="text-foreground font-bold">{item.blockedUser}</div>
                      <div className="text-[11px] text-destructive truncate">
                        Waiting: {formatDuration(item.waitingDurationMs)} ({item.waitEvent})
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Section B: Active Sessions Table */}
          <Card className="border-border">
            <CardHeader className="py-2.5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xs font-semibold">Active PostgreSQL Sessions</CardTitle>
                <CardDescription className="text-[11px]">
                  Live introspection via `pg_stat_activity` excluding idle connections
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {liveSessions.length} SESSIONS ACTIVE
              </Badge>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-border bg-sidebar/50 text-muted-foreground text-[10px] uppercase">
                    <th className="p-2.5">PID</th>
                    <th className="p-2.5">User</th>
                    <th className="p-2.5">Application</th>
                    <th className="p-2.5">State</th>
                    <th className="p-2.5">Tx Age</th>
                    <th className="p-2.5">Query Duration</th>
                    <th className="p-2.5">Wait Event</th>
                    <th className="p-2.5">Current Query</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoadingLive ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="p-2.5"><div className="h-4 w-12 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-20 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-24 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-20 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-40 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                      </tr>
                    ))
                  ) : liveSessions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-xs text-muted-foreground">
                        No active transactions currently running on target database.
                      </td>
                    </tr>
                  ) : (
                    liveSessions.map((s) => (
                      <tr key={s.pid} className="hover:bg-elevated/40">
                        <td className="p-2.5 font-bold text-foreground">{s.pid}</td>
                        <td className="p-2.5 text-muted-foreground">{s.usename}</td>
                        <td className="p-2.5 text-muted-foreground">{s.applicationName || "psql"}</td>
                        <td className="p-2.5">
                          <Badge
                            variant={s.state === "active" ? "success" : "secondary"}
                            className="text-[9px] px-1 py-0"
                          >
                            {s.state}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-primary">{formatDuration(s.xactAgeMs)}</td>
                        <td className="p-2.5 text-muted-foreground">{formatDuration(s.durationMs)}</td>
                        <td className="p-2.5 text-muted-foreground">
                          {s.waitEventType ? `${s.waitEventType}: ${s.waitEvent}` : "None"}
                        </td>
                        <td className="p-2.5 text-foreground truncate max-w-72" title={s.query}>
                          {s.query || "idle"}
                        </td>
                        <td className="p-2.5 text-right">
                          {txDetails?.policy?.canTerminateSession ? (
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
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirmation Dialog: Safe Session Termination */}
      <Dialog
        open={terminateTargetPid !== null}
        onOpenChange={(open) => !open && setTerminateTargetPid(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-4 w-4" /> Terminate PostgreSQL Backend (PID {terminateTargetPid})
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to terminate this active backend process? Any uncommitted transaction state will be forcefully rolled back.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
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
              Confirm Termination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
