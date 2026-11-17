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
import { EmptyState } from "@/components/shared/empty-state";
import {
  ShieldCheck,
  Search,
  Download,
  RefreshCw,
  FileCode,
  User,
  Activity,
  Lock,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface AuditLogItem {
  id: string;
  organizationId: string;
  workspaceId?: string;
  databaseId?: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome: "success" | "failure" | "denied";
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export default function AuditPage() {
  const [activeOrgId, setActiveOrgId] = React.useState<string>("");
  const [logs, setLogs] = React.useState<AuditLogItem[]>([]);
  const [actionFilter, setActionFilter] = React.useState<string>("all");
  const [searchEmail, setSearchEmail] = React.useState<string>("");
  const [selectedLog, setSelectedLog] = React.useState<AuditLogItem | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // 1. Initial Load: Fetch Session
  React.useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const orgId = me.organizations?.[0]?.id;
          if (orgId) setActiveOrgId(orgId);
        }
      } catch (err) {
        console.error("Failed to load audit session:", err);
      }
    }
    init();
  }, []);

  // 2. Load Audit Logs
  const loadAuditLogs = React.useCallback(async () => {
    if (!activeOrgId) return;
    setIsLoading(true);
    try {
      const url = new URL(`/api/v1/audit`, window.location.origin);
      url.searchParams.set("organizationId", activeOrgId);
      if (actionFilter && actionFilter !== "all") url.searchParams.set("action", actionFilter);
      if (searchEmail) url.searchParams.set("actorEmail", searchEmail);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.logs?.length > 0) setSelectedLog(data.logs[0]);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [activeOrgId, actionFilter, searchEmail]);

  React.useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  // Export CSV
  const handleExportCsv = () => {
    if (logs.length === 0) return;
    const headers = "id,action,actorEmail,resourceType,outcome,createdAt";
    const csvRows = logs
      .map(
        (l) =>
          `"${l.id}","${l.action}","${l.actorEmail || ""}","${l.resourceType}","${l.outcome}","${l.createdAt}"`
      )
      .join("\n");

    const blob = new Blob([`${headers}\n${csvRows}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `chronos-audit-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">Audit Center</h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              Append-Only Ledger
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Cryptographically sealed and tamper-evident audit records across all organization actions
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={logs.length === 0} className="h-8 text-xs cursor-pointer">
            <Download className="h-3 w-3 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={loadAuditLogs} isLoading={isLoading} className="h-8 text-xs cursor-pointer">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter strip */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span className="text-[11px] text-muted-foreground shrink-0">Action:</span>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-7 text-xs font-mono w-full sm:w-48">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="user:login">user:login</SelectItem>
                  <SelectItem value="user:register">user:register</SelectItem>
                  <SelectItem value="database:register">database:register</SelectItem>
                  <SelectItem value="sql:execute_modifying">sql:execute_modifying</SelectItem>
                  <SelectItem value="history:restore">history:restore</SelectItem>
                  <SelectItem value="members:invite">members:invite</SelectItem>
                  <SelectItem value="workspace:create">workspace:create</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-4 w-px bg-border hidden sm:block" />

            <div className="relative w-full sm:w-auto">
              <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2" />
              <Input
                placeholder="Filter by actor email..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                className="h-7 pl-7 text-[11px] w-full sm:w-[220px]"
              />
            </div>
          </div>

          <div className="text-[11px] font-mono text-muted-foreground">
            Displaying {logs.length} audit records
          </div>
        </CardContent>
      </Card>

      {/* Split view: Audit Table & Detail Drawer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Left 2 Cols: Table */}
        <Card className="md:col-span-2">
          <CardHeader className="py-2.5">
            <CardTitle className="text-xs">Audit Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                    <th className="p-2.5 font-medium">Outcome</th>
                    <th className="p-2.5 font-medium">Action</th>
                    <th className="p-2.5 font-medium">Actor</th>
                    <th className="p-2.5 font-medium">Resource</th>
                    <th className="p-2.5 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="p-2.5"><div className="h-4 w-14 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-28 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-24 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-20 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-24 bg-muted rounded" /></td>
                      </tr>
                    ))
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                        No audit records match the current criteria.
                      </td>
                    </tr>
                  ) : (
                    logs.map((l) => {
                      const isSelected = selectedLog?.id === l.id;
                      return (
                        <tr
                          key={l.id}
                          onClick={() => setSelectedLog(l)}
                          className={`hover:bg-elevated/60 cursor-pointer transition-colors ${
                            isSelected ? "bg-elevated text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          <td className="p-2.5">
                            <Badge
                              variant={
                                l.outcome === "success"
                                  ? "success"
                                  : l.outcome === "denied"
                                  ? "warning"
                                  : "destructive"
                              }
                              className="text-[9px]"
                            >
                              {l.outcome}
                            </Badge>
                          </td>
                          <td className="p-2.5 font-semibold text-foreground">{l.action}</td>
                          <td className="p-2.5 text-muted-foreground truncate max-w-[140px]">
                            {l.actorEmail || "system"}
                          </td>
                          <td className="p-2.5 text-primary">{l.resourceType}</td>
                          <td className="p-2.5 text-[11px] text-muted-foreground">
                            {formatDate(l.createdAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Right Col: Details */}
        <Card className="md:col-span-1 flex flex-col justify-between">
          <CardHeader className="py-2.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-primary" /> Event Payload
            </CardTitle>
            <CardDescription className="text-[11px]">
              {selectedLog ? `ID: ${selectedLog.id}` : "Select an audit record"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 flex-1 flex flex-col gap-3 text-xs">
            {selectedLog ? (
              <>
                <div className="p-2.5 rounded border border-border bg-sidebar space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Action:</span>
                    <span className="text-foreground font-semibold">{selectedLog.action}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Actor:</span>
                    <span className="text-foreground">{selectedLog.actorEmail || "system"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resource Type:</span>
                    <span className="text-primary">{selectedLog.resourceType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recorded At:</span>
                    <span className="text-muted-foreground">{formatDate(selectedLog.createdAt)}</span>
                  </div>
                  {selectedLog.ipAddress && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Client IP:</span>
                      <span className="text-muted-foreground">{selectedLog.ipAddress}</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col space-y-1">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground">
                    Event Metadata JSONB
                  </span>
                  <pre className="flex-1 p-2.5 rounded bg-sidebar border border-border text-[11px] font-mono text-foreground whitespace-pre-wrap overflow-auto max-h-56">
                    {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<ShieldCheck className="h-8 w-8 text-primary" />}
                title="No Record Selected"
                description="Select an audit event from the ledger to inspect parameters and execution metadata."
                className="m-auto"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
