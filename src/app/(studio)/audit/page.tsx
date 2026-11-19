"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Search,
  Download,
  RefreshCw,
  FileCode,
  User,
  Activity,
  Lock,
  Database,
  Layers,
  Clock,
  Check,
  Copy,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  SlidersHorizontal,
  Info,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface AuditEventItem {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  databaseId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  eventCategory: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "success" | "failure" | "denied";
  severity: "info" | "warning" | "error" | "critical";
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

interface SecurityAlertItem {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "investigating" | "resolved";
  relatedUserEmail?: string | null;
  relatedUserId?: string | null;
  ipAddress?: string | null;
  eventCount: number;
  firstEventAt: string;
  lastEventAt: string;
  metadata?: Record<string, unknown> | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

interface AuditMetricsData {
  timeRange: string;
  startTime: string;
  endTime: string;
  metrics: {
    totalAuditEvents: number;
    failedLoginAttempts: number;
    administrativeActions: number;
    securityAlerts: number;
  };
  categoryBreakdown: Record<string, number>;
}

export default function AuditCenterPage() {
  const [activeOrgId, setActiveOrgId] = React.useState<string>("");
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<string>("explorer");

  // Time range
  const [timeRange, setTimeRange] = React.useState<string>("24h");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");

  // Metrics
  const [metricsData, setMetricsData] = React.useState<AuditMetricsData | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = React.useState<boolean>(false);

  // Events & Filtering
  const [events, setEvents] = React.useState<AuditEventItem[]>([]);
  const [totalCount, setTotalCount] = React.useState<number>(0);
  const [totalPages, setTotalPages] = React.useState<number>(1);
  const [page, setPage] = React.useState<number>(1);
  const [pageSize] = React.useState<number>(25);
  const [search, setSearch] = React.useState<string>("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = React.useState<string>("all");
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<"createdAt" | "action" | "outcome" | "severity">("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [isLoadingEvents, setIsLoadingEvents] = React.useState<boolean>(false);

  // Policy & Role Scope state
  const [currentUserEmail, setCurrentUserEmail] = React.useState<string>("");
  const [auditPolicy, setAuditPolicy] = React.useState<{
    role: string;
    label: string;
    canViewOwn: boolean;
    canViewWorkspace: boolean;
    canViewOrganization: boolean;
    canExport: boolean;
    canManageAlerts: boolean;
  } | null>(null);
  const [isOwnActivityOnly, setIsOwnActivityOnly] = React.useState<boolean>(false);
  const [isDatabaseScopeOnly, setIsDatabaseScopeOnly] = React.useState<boolean>(false);
  const [onlyMyActivity, setOnlyMyActivity] = React.useState<boolean>(false);

  // Selected Event Details Inspector
  const [selectedEvent, setSelectedEvent] = React.useState<AuditEventItem | null>(null);
  const [isCopiedJson, setIsCopiedJson] = React.useState<boolean>(false);
  const [isCopiedId, setIsCopiedId] = React.useState<boolean>(false);

  // Security Alerts
  const [alerts, setAlerts] = React.useState<SecurityAlertItem[]>([]);
  const [alertSummary, setAlertSummary] = React.useState({ total: 0, open: 0, investigating: 0, resolved: 0 });
  const [alertStatusFilter, setAlertStatusFilter] = React.useState<string>("all");
  const [alertSeverityFilter, setAlertSeverityFilter] = React.useState<string>("all");
  const [isLoadingAlerts, setIsLoadingAlerts] = React.useState<boolean>(false);
  const [isUpdatingAlert, setIsUpdatingAlert] = React.useState<string | null>(null);

  // 1. Initial Session Load
  React.useEffect(() => {
    async function initSession() {
      try {
        const meRes = await fetch("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const orgId = me.organizations?.[0]?.id;
          if (orgId) setActiveOrgId(orgId);
          if (me.user?.email) setCurrentUserEmail(me.user.email);
        }
        if (typeof window !== "undefined") {
          const ws = localStorage.getItem("chronos_active_workspace");
          if (ws) setActiveWorkspaceId(ws);
        }
      } catch (err) {
        console.error("Failed to load audit session:", err);
      }
    }
    initSession();

    const handleWsChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ workspaceId: string }>;
      if (customEvent.detail?.workspaceId) {
        setActiveWorkspaceId(customEvent.detail.workspaceId);
      }
    };
    window.addEventListener("chronos:workspace-changed", handleWsChange);
    return () => window.removeEventListener("chronos:workspace-changed", handleWsChange);
  }, []);

  // 2. Fetch Metrics
  const loadMetrics = React.useCallback(async () => {
    if (!activeOrgId) return;
    setIsLoadingMetrics(true);
    try {
      const url = new URL("/api/v1/audit/metrics", window.location.origin);
      url.searchParams.set("organizationId", activeOrgId);
      if (activeWorkspaceId) url.searchParams.set("workspaceId", activeWorkspaceId);
      url.searchParams.set("timeRange", timeRange);
      if (timeRange === "custom" && startDate) url.searchParams.set("startDate", startDate);
      if (timeRange === "custom" && endDate) url.searchParams.set("endDate", endDate);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setMetricsData(data);
      }
    } catch (err) {
      console.error("Failed to load audit metrics:", err);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [activeOrgId, activeWorkspaceId, timeRange, startDate, endDate]);

  // 3. Fetch Events
  const loadEvents = React.useCallback(async () => {
    if (!activeOrgId) return;
    setIsLoadingEvents(true);
    try {
      const url = new URL("/api/v1/audit", window.location.origin);
      url.searchParams.set("organizationId", activeOrgId);
      if (activeWorkspaceId) url.searchParams.set("workspaceId", activeWorkspaceId);
      url.searchParams.set("timeRange", timeRange);
      if (timeRange === "custom" && startDate) url.searchParams.set("startDate", startDate);
      if (timeRange === "custom" && endDate) url.searchParams.set("endDate", endDate);

      if (categoryFilter && categoryFilter !== "all") url.searchParams.set("category", categoryFilter);
      if (outcomeFilter && outcomeFilter !== "all") url.searchParams.set("outcome", outcomeFilter);
      if (severityFilter && severityFilter !== "all") url.searchParams.set("severity", severityFilter);
      if (search.trim()) url.searchParams.set("search", search.trim());
      if (onlyMyActivity && currentUserEmail) url.searchParams.set("actorEmail", currentUserEmail);
      url.searchParams.set("sortBy", sortBy);
      url.searchParams.set("sortOrder", sortOrder);

      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(pageSize));

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        if (data.policy) setAuditPolicy(data.policy);
        if (data.isOwnActivityOnly != null) setIsOwnActivityOnly(data.isOwnActivityOnly);
        if (data.isDatabaseScopeOnly != null) setIsDatabaseScopeOnly(data.isDatabaseScopeOnly);
        if (data.pagination) {
          setTotalCount(data.pagination.totalCount || 0);
          setTotalPages(data.pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error("Failed to load audit events:", err);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [
    activeOrgId,
    activeWorkspaceId,
    timeRange,
    startDate,
    endDate,
    categoryFilter,
    outcomeFilter,
    severityFilter,
    search,
    onlyMyActivity,
    currentUserEmail,
    sortBy,
    sortOrder,
    page,
    pageSize,
  ]);

  // 4. Fetch Security Alerts
  const loadAlerts = React.useCallback(async () => {
    if (!activeOrgId) return;
    setIsLoadingAlerts(true);
    try {
      const url = new URL("/api/v1/audit/alerts", window.location.origin);
      url.searchParams.set("organizationId", activeOrgId);
      if (activeWorkspaceId) url.searchParams.set("workspaceId", activeWorkspaceId);
      if (alertStatusFilter && alertStatusFilter !== "all") url.searchParams.set("status", alertStatusFilter);
      if (alertSeverityFilter && alertSeverityFilter !== "all") url.searchParams.set("severity", alertSeverityFilter);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
        if (data.summary) setAlertSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to load security alerts:", err);
    } finally {
      setIsLoadingAlerts(false);
    }
  }, [activeOrgId, activeWorkspaceId, alertStatusFilter, alertSeverityFilter]);

  // Load everything on trigger
  React.useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  React.useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  React.useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Refresh handler
  const handleRefresh = () => {
    loadMetrics();
    loadEvents();
    loadAlerts();
  };

  // Table column sort handler
  const handleSort = (field: "createdAt" | "action" | "outcome" | "severity") => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const renderSortIndicator = (field: "createdAt" | "action" | "outcome" | "severity") => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 inline-block" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-primary inline-block" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-primary inline-block" />
    );
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setOutcomeFilter("all");
    setSeverityFilter("all");
    setOnlyMyActivity(false);
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  // Export action
  const handleExport = (format: "csv" | "json") => {
    if (!activeOrgId) return;
    const url = new URL("/api/v1/audit/export", window.location.origin);
    url.searchParams.set("organizationId", activeOrgId);
    if (activeWorkspaceId) url.searchParams.set("workspaceId", activeWorkspaceId);
    url.searchParams.set("timeRange", timeRange);
    if (timeRange === "custom" && startDate) url.searchParams.set("startDate", startDate);
    if (timeRange === "custom" && endDate) url.searchParams.set("endDate", endDate);
    if (categoryFilter && categoryFilter !== "all") url.searchParams.set("category", categoryFilter);
    if (outcomeFilter && outcomeFilter !== "all") url.searchParams.set("outcome", outcomeFilter);
    if (severityFilter && severityFilter !== "all") url.searchParams.set("severity", severityFilter);
    if (search.trim()) url.searchParams.set("search", search.trim());
    url.searchParams.set("sortBy", sortBy);
    url.searchParams.set("sortOrder", sortOrder);
    url.searchParams.set("format", format);

    window.open(url.toString(), "_blank");
  };

  // Update alert status
  const handleUpdateAlertStatus = async (alertId: string, newStatus: "open" | "investigating" | "resolved") => {
    if (!activeOrgId) return;
    setIsUpdatingAlert(alertId);
    try {
      const res = await fetch(`/api/v1/audit/alerts/${alertId}?organizationId=${activeOrgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await loadAlerts();
        await loadMetrics();
      }
    } catch (err) {
      console.error("Failed to update alert status:", err);
    } finally {
      setIsUpdatingAlert(null);
    }
  };

  // Copy JSON metadata
  const handleCopyJson = () => {
    if (!selectedEvent) return;
    navigator.clipboard.writeText(JSON.stringify(selectedEvent.metadata || {}, null, 2));
    setIsCopiedJson(true);
    setTimeout(() => setIsCopiedJson(false), 2000);
  };

  const handleCopyId = () => {
    if (!selectedEvent) return;
    navigator.clipboard.writeText(selectedEvent.id);
    setIsCopiedId(true);
    setTimeout(() => setIsCopiedId(false), 2000);
  };

  // Outcome color badges
  const renderOutcomeBadge = (outcome: string) => {
    if (outcome === "success") {
      return (
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
          SUCCESS
        </Badge>
      );
    }
    if (outcome === "denied") {
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono text-[10px]">
          DENIED
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400 font-mono text-[10px]">
        FAILURE
      </Badge>
    );
  };

  // Severity indicator
  const renderSeverityBadge = (severity: string) => {
    if (severity === "critical") {
      return <Badge variant="destructive" className="font-mono text-[9px] uppercase">critical</Badge>;
    }
    if (severity === "error") {
      return <Badge variant="outline" className="border-red-500/40 text-red-400 bg-red-500/10 font-mono text-[9px] uppercase">error</Badge>;
    }
    if (severity === "warning") {
      return <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 font-mono text-[9px] uppercase">warning</Badge>;
    }
    return <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[9px] uppercase">info</Badge>;
  };

  // Category Icon & Color
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case "authentication":
        return { label: "Authentication", icon: <Lock className="h-3 w-3 text-cyan-400" />, color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" };
      case "workspace":
        return { label: "Workspace", icon: <Layers className="h-3 w-3 text-indigo-400" />, color: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" };
      case "iam":
        return { label: "IAM & Access", icon: <User className="h-3 w-3 text-purple-400" />, color: "bg-purple-500/10 text-purple-300 border-purple-500/30" };
      case "database":
        return { label: "Database", icon: <Database className="h-3 w-3 text-emerald-400" />, color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" };
      case "admin":
        return { label: "Admin & Backups", icon: <Activity className="h-3 w-3 text-amber-400" />, color: "bg-amber-500/10 text-amber-300 border-amber-500/30" };
      default:
        return { label: "System", icon: <ShieldCheck className="h-3 w-3 text-blue-400" />, color: "bg-blue-500/10 text-blue-300 border-blue-500/30" };
    }
  };

  return (
    <div className="space-y-5 w-full max-w-[1920px] mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Audit Center
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/40 text-emerald-400 bg-emerald-500/5">
              Append-Only Ledger
            </Badge>
            {auditPolicy && (
              <Badge
                variant="outline"
                className={`font-mono text-[10px] ${
                  auditPolicy.role === "owner"
                    ? "border-primary/40 text-primary bg-primary/10"
                    : auditPolicy.role === "dba"
                    ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                    : auditPolicy.role === "auditor"
                    ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                    : auditPolicy.role === "database_engineer"
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                    : "border-purple-500/40 text-purple-400 bg-purple-500/10"
                }`}
              >
                Role: {auditPolicy.label}
                {isOwnActivityOnly
                  ? " (Personal Activity Scope)"
                  : isDatabaseScopeOnly
                  ? " (Workspace DB Scope)"
                  : " (Organization Scope)"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Centralized accountability, security anomaly detection, and tamper-evident event forensics
          </p>
        </div>

        {/* Global Controls: Time Range & Export & Refresh */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* My Activity Filter toggle (available to every authenticated role) */}
          <Button
            variant={onlyMyActivity || isOwnActivityOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              if (!isOwnActivityOnly) {
                setOnlyMyActivity((prev) => !prev);
                setPage(1);
              }
            }}
            disabled={isOwnActivityOnly}
            className="h-8 text-xs cursor-pointer font-mono"
            title={
              isOwnActivityOnly
                ? "Your role is restricted to your personal activity only"
                : "Toggle My Activity"
            }
          >
            <User className="h-3.5 w-3.5 mr-1" />
            {isOwnActivityOnly ? "My Activity (Locked)" : onlyMyActivity ? "My Activity (Active)" : "My Activity"}
          </Button>

          {/* Time range selector */}
          <Select value={timeRange} onValueChange={(val) => { setTimeRange(val); setPage(1); }}>
            <SelectTrigger className="h-8 text-xs font-mono w-44 bg-sidebar/80">
              <div className="flex items-center gap-1.5 truncate">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Time Range" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15m">Last 15 minutes</SelectItem>
              <SelectItem value="1h">Last 1 hour</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {timeRange === "custom" && (
            <div className="flex items-center gap-1 text-xs">
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs font-mono w-44"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs font-mono w-44"
              />
            </div>
          )}

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={auditPolicy?.canExport === false}
                className="h-8 text-xs cursor-pointer"
                title={
                  auditPolicy?.canExport === false
                    ? "Exporting audit logs is restricted to Owner, DBA, and Auditor roles."
                    : "Export audit ledger records"
                }
              >
                <Download className="h-3.5 w-3.5 mr-1 text-muted-foreground" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 font-mono text-xs">
              <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                Export as CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("json")} className="cursor-pointer">
                Export as JSON (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoadingMetrics || isLoadingEvents || isLoadingAlerts}
            className="h-8 text-xs cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* 1. Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Audit Events */}
        <Card className="bg-card/70 border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                Total Audit Events
              </div>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">
                {isLoadingMetrics ? "..." : (metricsData?.metrics.totalAuditEvents ?? 0).toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Active time window: {timeRange}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Activity className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Failed Login Attempts */}
        <Card className="bg-card/70 border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                Failed Logins
              </div>
              <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
                {isLoadingMetrics ? "..." : (metricsData?.metrics.failedLoginAttempts ?? 0).toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Authentication rejections
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Lock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Administrative Actions */}
        <Card className="bg-card/70 border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                Admin & Governance
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {isLoadingMetrics ? "..." : (metricsData?.metrics.administrativeActions ?? 0).toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                IAM, backups, and restores
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Security Alerts */}
        <Card className="bg-card/70 border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                Security Alerts
              </div>
              <div className="text-2xl font-bold font-mono text-red-500 mt-1 flex items-center gap-2">
                {isLoadingMetrics ? "..." : (metricsData?.metrics.securityAlerts ?? 0).toLocaleString()}
                {(metricsData?.metrics.securityAlerts ?? 0) > 0 && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Requiring review / triage
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Activity Breakdown */}
      {metricsData && metricsData.metrics.totalAuditEvents > 0 && (
        <Card className="bg-card/50 border-border">
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
              <div className="text-[11px] font-mono font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-primary" /> Activity Distribution by Category
              </div>
              <div className="text-[11px] font-mono text-muted-foreground">
                Total events in period: {metricsData.metrics.totalAuditEvents}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {Object.entries(metricsData.categoryBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, count]) => {
                const meta = getCategoryMeta(cat);
                const pct = metricsData.metrics.totalAuditEvents > 0
                  ? Math.round((count / metricsData.metrics.totalAuditEvents) * 100)
                  : 0;
                return (
                  <div
                    key={cat}
                    onClick={() => {
                      setCategoryFilter(cat);
                      setActiveTab("explorer");
                    }}
                    className="p-2 rounded border border-border/80 bg-sidebar/50 hover:bg-elevated/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        {meta.icon}
                        <span className="truncate">{meta.label}</span>
                      </span>
                      <span className="font-mono text-[11px] font-bold text-foreground">{count}</span>
                    </div>
                    <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[9px] text-muted-foreground font-mono mt-1 text-right">
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs: Event Explorer vs Security Monitoring */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-1">
          <TabsList className="bg-secondary/60 p-0.5 h-8">
            <TabsTrigger value="explorer" className="text-xs px-3 py-1 font-mono flex items-center gap-1.5 cursor-pointer">
              <Activity className="h-3.5 w-3.5" /> Event Explorer
            </TabsTrigger>
            <TabsTrigger value="security" className="text-xs px-3 py-1 font-mono flex items-center gap-1.5 cursor-pointer">
              <ShieldAlert className="h-3.5 w-3.5" /> Security Monitoring
              {alertSummary.open > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-red-500/20 text-red-400 border border-red-500/30">
                  {alertSummary.open}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="text-xs text-muted-foreground font-mono hidden sm:block">
            {activeTab === "explorer"
              ? `Displaying ${events.length} of ${totalCount} records`
              : `${alertSummary.total} recorded detections`}
          </div>
        </div>

        {/* TAB 1: EVENT EXPLORER */}
        <TabsContent value="explorer" className="space-y-4 mt-0">
          {/* Filters Bar */}
          <Card className="bg-card/70 border-border">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search */}
                <div className="relative flex-1 min-w-50">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                  <Input
                    placeholder="Search by actor email, action, resource, IP, or Event ID..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="h-8 pl-8 text-xs font-mono bg-sidebar/50"
                  />
                </div>

                {/* Category Filter */}
                <div className="w-40">
                  <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs font-mono bg-sidebar/50">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                      <SelectItem value="workspace">Workspace</SelectItem>
                      <SelectItem value="iam">IAM & Access</SelectItem>
                      <SelectItem value="database">Database</SelectItem>
                      <SelectItem value="admin">Admin & Backups</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status / Outcome Filter */}
                <div className="w-36">
                  <Select value={outcomeFilter} onValueChange={(val) => { setOutcomeFilter(val); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs font-mono bg-sidebar/50">
                      <SelectValue placeholder="All Outcomes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Outcomes</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="failure">Failure</SelectItem>
                      <SelectItem value="denied">Denied</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Severity Filter */}
                <div className="w-32">
                  <Select value={severityFilter} onValueChange={(val) => { setSeverityFilter(val); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs font-mono bg-sidebar/50">
                      <SelectValue placeholder="All Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severity</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Reset Filters */}
                {(search || categoryFilter !== "all" || outcomeFilter !== "all" || severityFilter !== "all") && (
                  <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-8 text-xs text-muted-foreground cursor-pointer">
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Events Ledger Table */}
          <Card className="border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/80 text-muted-foreground text-[11px]">
                      <th
                        className="p-3 font-semibold w-24 cursor-pointer hover:text-foreground transition-colors select-none"
                        onClick={() => handleSort("outcome")}
                        title="Sort by Status"
                      >
                        <div className="flex items-center">
                          Status {renderSortIndicator("outcome")}
                        </div>
                      </th>
                      <th
                        className="p-3 font-semibold w-24 cursor-pointer hover:text-foreground transition-colors select-none"
                        onClick={() => handleSort("severity")}
                        title="Sort by Severity"
                      >
                        <div className="flex items-center">
                          Severity {renderSortIndicator("severity")}
                        </div>
                      </th>
                      <th
                        className="p-3 font-semibold cursor-pointer hover:text-foreground transition-colors select-none"
                        onClick={() => handleSort("action")}
                        title="Sort by Action"
                      >
                        <div className="flex items-center">
                          Action / Event {renderSortIndicator("action")}
                        </div>
                      </th>
                      <th className="p-3 font-semibold w-32">Category</th>
                      <th className="p-3 font-semibold">Actor</th>
                      <th className="p-3 font-semibold">Target / Resource</th>
                      <th className="p-3 font-semibold">IP Address</th>
                      <th
                        className="p-3 font-semibold cursor-pointer hover:text-foreground transition-colors select-none"
                        onClick={() => handleSort("createdAt")}
                        title="Sort by Timestamp"
                      >
                        <div className="flex items-center">
                          Timestamp {renderSortIndicator("createdAt")}
                        </div>
                      </th>
                      <th className="p-3 font-semibold text-right w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLoadingEvents ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="p-3"><div className="h-4 w-16 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-4 w-12 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-4 w-32 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-4 w-20 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-4 w-28 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-4 w-24 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-4 w-20 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-4 w-28 bg-muted rounded" /></td>
                          <td className="p-3 text-right"><div className="h-4 w-12 bg-muted rounded ml-auto" /></td>
                        </tr>
                      ))
                    ) : events.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-12 text-center">
                          <EmptyState
                            icon={<ShieldCheck className="h-10 w-10 text-primary/70" />}
                            title="No Audit Records Found"
                            description="No recorded actions match the active query filters and time range."
                            className="m-auto"
                          />
                        </td>
                      </tr>
                    ) : (
                      events.map((e) => {
                        const isSelected = selectedEvent?.id === e.id;
                        const catMeta = getCategoryMeta(e.eventCategory);
                        return (
                          <tr
                            key={e.id}
                            onClick={() => setSelectedEvent(e)}
                            className={`hover:bg-elevated/70 cursor-pointer transition-colors ${
                              isSelected ? "bg-elevated text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            <td className="p-3">{renderOutcomeBadge(e.outcome)}</td>
                            <td className="p-3">{renderSeverityBadge(e.severity)}</td>
                            <td className="p-3 font-semibold text-foreground">
                              {e.action}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className={`text-[10px] font-mono flex items-center gap-1 w-fit ${catMeta.color}`}>
                                {catMeta.icon}
                                {e.eventCategory}
                              </Badge>
                            </td>
                            <td className="p-3 text-foreground/90 truncate max-w-40" title={e.actorEmail || "system"}>
                              {e.actorEmail || "system"}
                            </td>
                            <td className="p-3">
                              <span className="text-primary font-medium">{e.resourceType}</span>
                              {e.resourceId && (
                                <span className="text-muted-foreground ml-1 text-[11px] truncate max-w-30" title={e.resourceId}>
                                  ({e.resourceId.slice(0, 8)}...)
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground text-[11px]">
                              {e.ipAddress || "—"}
                            </td>
                            <td className="p-3 text-muted-foreground text-[11px] whitespace-nowrap">
                              {formatDate(e.createdAt)}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setSelectedEvent(e);
                                }}
                                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <Eye className="h-3 w-3 mr-1" /> Inspect
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Server-Side Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-t border-border bg-sidebar/50 text-xs font-mono gap-3">
                <div className="text-muted-foreground text-[11px]">
                  Showing {events.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
                  {Math.min(page * pageSize, totalCount)} of {totalCount} records
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || isLoadingEvents}
                    className="h-7 text-xs px-2.5 cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                  </Button>
                  <span className="text-muted-foreground px-1">
                    Page {page} of {Math.max(1, totalPages)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || isLoadingEvents}
                    className="h-7 text-xs px-2.5 cursor-pointer"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: SECURITY MONITORING */}
        <TabsContent value="security" className="space-y-4 mt-0">
          {/* Security Subheader & Status Tabs */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card/60 p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Active Anomaly & Security Rules</h3>
                <p className="text-[11px] text-muted-foreground">
                  Automated rule-based detection for credential abuse, unauthorized access patterns, and privilege anomalies
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={alertStatusFilter} onValueChange={setAlertStatusFilter}>
                <SelectTrigger className="h-8 text-xs font-mono w-36">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status ({alertSummary.total})</SelectItem>
                  <SelectItem value="open">Open ({alertSummary.open})</SelectItem>
                  <SelectItem value="investigating">Investigating ({alertSummary.investigating})</SelectItem>
                  <SelectItem value="resolved">Resolved ({alertSummary.resolved})</SelectItem>
                </SelectContent>
              </Select>

              <Select value={alertSeverityFilter} onValueChange={setAlertSeverityFilter}>
                <SelectTrigger className="h-8 text-xs font-mono w-32">
                  <SelectValue placeholder="All Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Alerts List */}
          {isLoadingAlerts ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse p-4">
                  <div className="h-5 w-48 bg-muted rounded mb-2" />
                  <div className="h-4 w-full bg-muted rounded" />
                </Card>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-12 text-center">
                <EmptyState
                  icon={<ShieldCheck className="h-10 w-10 text-emerald-400" />}
                  title="No Security Alerts Detected"
                  description="No anomalous security alerts or policy violations recorded for this scope."
                  className="m-auto"
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {alerts.map((alt) => (
                <Card key={alt.id} className="border-border bg-card/80">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle
                          className={`h-4 w-4 ${
                            alt.severity === "critical"
                              ? "text-red-400"
                              : alt.severity === "warning"
                              ? "text-amber-400"
                              : "text-blue-400"
                          }`}
                        />
                        <span className="font-semibold text-sm text-foreground">{alt.title}</span>
                        {renderSeverityBadge(alt.severity)}
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {alt.eventCount} occurrences
                        </Badge>
                      </div>

                      {/* Status Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground font-mono">Investigation:</span>
                        <Select
                          value={alt.status}
                          disabled={isUpdatingAlert === alt.id || auditPolicy?.canManageAlerts === false}
                          onValueChange={(val) =>
                            handleUpdateAlertStatus(alt.id, val as "open" | "investigating" | "resolved")
                          }
                        >
                          <SelectTrigger
                            title={
                              auditPolicy?.canManageAlerts === false
                                ? "Managing security alerts requires Owner or DBA role (Auditor is read-only)."
                                : "Update investigation status"
                            }
                            className={`h-7 text-xs font-mono font-semibold w-36 ${
                              alt.status === "open"
                                ? "border-red-500/40 text-red-400 bg-red-500/10"
                                : alt.status === "investigating"
                                ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                                : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                            }`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="investigating">Investigating</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">{alt.description}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-muted-foreground border-t border-border/40">
                      <div>
                        <span className="text-muted-foreground/70 block">Target Actor:</span>
                        <span className="text-foreground">{alt.relatedUserEmail || "Unknown"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/70 block">Origin IP:</span>
                        <span className="text-foreground">{alt.ipAddress || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/70 block">First Detected:</span>
                        <span className="text-foreground">{formatDate(alt.firstEventAt)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/70 block">Last Active:</span>
                        <span className="text-foreground">{formatDate(alt.lastEventAt)}</span>
                      </div>
                    </div>

                    {alt.resolvedBy && (
                      <div className="text-[11px] font-mono text-emerald-400/90 pt-1">
                        ✓ Resolved by <span className="font-semibold">{alt.resolvedBy}</span> on {formatDate(alt.resolvedAt || alt.lastEventAt)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 4. EVENT DETAILS INSPECTOR (Shadcn Sheet Slider) */}
      <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl h-full bg-card border-l border-border shadow-2xl flex flex-col justify-between overflow-hidden p-0">
          {selectedEvent && (
            <>
              <div className="sr-only">
                <SheetTitle>Audit Event Details: {selectedEvent.action}</SheetTitle>
                <SheetDescription>Inspection parameters and execution metadata</SheetDescription>
              </div>

              {/* Inspector Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-sidebar/80">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold font-mono text-foreground">{selectedEvent.action}</h2>
                  {renderOutcomeBadge(selectedEvent.outcome)}
                  {renderSeverityBadge(selectedEvent.severity)}
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                  <span>ID: {selectedEvent.id.slice(0, 16)}...</span>
                  <button
                    onClick={handleCopyId}
                    className="hover:text-foreground inline-flex items-center gap-0.5 cursor-pointer"
                    title="Copy full Event ID"
                  >
                    {isCopiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedEvent(null)}
                className="h-8 w-8 p-0 rounded-full hover:bg-elevated cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Inspector Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
              {/* Section 1: Event Information */}
              <div className="space-y-2 border border-border/80 rounded-md p-3 bg-sidebar/40">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 pb-1 border-b border-border/40">
                  <Info className="h-3.5 w-3.5 text-primary" /> Event Information
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block">Category:</span>
                    <span className="text-foreground capitalize">{selectedEvent.eventCategory}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Timestamp (UTC):</span>
                    <span className="text-foreground">{formatDate(selectedEvent.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Request ID:</span>
                    <span className="text-foreground">{selectedEvent.requestId || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Execution Duration:</span>
                    <span className="text-foreground">
                      {selectedEvent.durationMs != null ? `${selectedEvent.durationMs} ms` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Actor Information */}
              <div className="space-y-2 border border-border/80 rounded-md p-3 bg-sidebar/40">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 pb-1 border-b border-border/40">
                  <User className="h-3.5 w-3.5 text-primary" /> Actor Information
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block">Email:</span>
                    <span className="text-foreground">{selectedEvent.actorEmail || "system"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Actor ID:</span>
                    <span className="text-foreground">{selectedEvent.actorId || "system"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Client IP:</span>
                    <span className="text-foreground">{selectedEvent.ipAddress || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Session ID:</span>
                    <span className="text-foreground truncate block" title={selectedEvent.sessionId || ""}>
                      {selectedEvent.sessionId || "—"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block">User Agent:</span>
                    <span className="text-foreground text-[10px] break-all block">{selectedEvent.userAgent || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Target Resource Information */}
              <div className="space-y-2 border border-border/80 rounded-md p-3 bg-sidebar/40">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 pb-1 border-b border-border/40">
                  <Layers className="h-3.5 w-3.5 text-primary" /> Target Information
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block">Resource Type:</span>
                    <span className="text-primary font-semibold">{selectedEvent.resourceType}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Resource ID:</span>
                    <span className="text-foreground">{selectedEvent.resourceId || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Workspace ID:</span>
                    <span className="text-foreground">{selectedEvent.workspaceId || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Database ID:</span>
                    <span className="text-foreground">{selectedEvent.databaseId || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Section 4: Change Details (Before vs After Diff) */}
              {selectedEvent.metadata &&
                (("before" in selectedEvent.metadata && "after" in selectedEvent.metadata) ||
                  ("previousValue" in selectedEvent.metadata && "newValue" in selectedEvent.metadata)) && (
                  <div className="space-y-2 border border-border/80 rounded-md p-3 bg-sidebar/40">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 pb-1 border-b border-border/40">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-primary" /> Change Details (Before vs After)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded bg-rose-500/5 border border-rose-500/20">
                        <span className="text-rose-400 font-semibold block mb-1">Before:</span>
                        <pre className="text-[10px] text-rose-300/90 whitespace-pre-wrap overflow-auto">
                          {JSON.stringify(
                            (selectedEvent.metadata as Record<string, unknown>).before ??
                              (selectedEvent.metadata as Record<string, unknown>).previousValue,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                      <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20">
                        <span className="text-emerald-400 font-semibold block mb-1">After:</span>
                        <pre className="text-[10px] text-emerald-300/90 whitespace-pre-wrap overflow-auto">
                          {JSON.stringify(
                            (selectedEvent.metadata as Record<string, unknown>).after ??
                              (selectedEvent.metadata as Record<string, unknown>).newValue,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

              {/* Section 5: Structured Metadata JSON */}
              <div className="space-y-2 border border-border/80 rounded-md p-3 bg-sidebar/40 flex-1">
                <div className="flex items-center justify-between pb-1 border-b border-border/40">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5 text-primary" /> Structured Event Metadata
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyJson}
                    className="h-6 text-[11px] px-2 cursor-pointer font-mono"
                  >
                    {isCopiedJson ? (
                      <>
                        <Check className="h-3 w-3 mr-1 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1" /> Copy JSON
                      </>
                    )}
                  </Button>
                </div>
                <pre className="p-2.5 rounded bg-background border border-border text-[11px] font-mono text-foreground whitespace-pre-wrap overflow-auto max-h-72">
                  {JSON.stringify(selectedEvent.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>

            {/* Inspector Footer */}
            <div className="p-3 border-t border-border bg-sidebar/80 flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Tamper-evident ledger record
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedEvent(null)}
                className="h-7 text-xs cursor-pointer"
              >
                Close
              </Button>
            </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
