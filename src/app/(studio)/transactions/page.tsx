"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Activity,
  Database,
  Clock,
  User,
  Search,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Layers,
} from "lucide-react";
import { formatDate, formatDuration } from "@/lib/utils";

interface TransactionItem {
  id: string;
  databaseId: string;
  transactionId: string;
  actorEmail?: string;
  status: string;
  queryText?: string;
  durationMs: number;
  startedAt: string;
  endedAt?: string;
  metadata?: Record<string, unknown>;
}

export default function TransactionsPage() {
  const [databases, setDatabases] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [transactions, setTransactions] = React.useState<TransactionItem[]>([]);
  const [selectedTx, setSelectedTx] = React.useState<TransactionItem | null>(null);
  const [txDetails, setTxDetails] = React.useState<any>(null);
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

  // 2. Load Transactions
  const loadTransactions = React.useCallback(async () => {
    if (!selectedDbId) return;
    setIsLoading(true);
    try {
      const url = statusFilter && statusFilter !== "all"
        ? `/api/v1/transactions?databaseId=${selectedDbId}&status=${statusFilter}`
        : `/api/v1/transactions?databaseId=${selectedDbId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        if (data.transactions?.length > 0) setSelectedTx(data.transactions[0]);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [selectedDbId, statusFilter]);

  React.useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // 3. Fetch Transaction Details
  React.useEffect(() => {
    if (!selectedTx) return;
    fetch(`/api/v1/transactions/${selectedTx.transactionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setTxDetails(data);
      })
      .catch(() => {});
  }, [selectedTx]);

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">Transaction Inspector</h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              Lifecycle Tracing
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Inspect transaction execution duration, commit/rollback statuses, and associated mutations
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={loadTransactions} isLoading={isLoading}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Filter strip */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Database className="h-3.5 w-3.5 text-primary shrink-0" />
              <Select value={selectedDbId} onValueChange={setSelectedDbId}>
                <SelectTrigger className="h-7 text-xs font-mono w-full sm:w-44">
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

            <div className="h-4 w-px bg-border hidden sm:block" />

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span className="text-[11px] text-muted-foreground shrink-0">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-7 text-xs font-mono w-full sm:w-36">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="committed">Committed</SelectItem>
                  <SelectItem value="rolled_back">Rolled Back</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="started">Active / Started</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-[11px] font-mono text-muted-foreground">
            Displaying {transactions.length} recorded transactions
          </div>
        </CardContent>
      </Card>

      {/* Split view: Transactions Table & Inspector Detail */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Left 2 Cols: Transactions Table */}
        <Card className="md:col-span-2">
          <CardHeader className="py-2.5">
            <CardTitle className="text-xs">Transaction Lifecycle Events</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                    <th className="p-2.5 font-medium">Status</th>
                    <th className="p-2.5 font-medium">Tx ID</th>
                    <th className="p-2.5 font-medium">Actor</th>
                    <th className="p-2.5 font-medium">Duration</th>
                    <th className="p-2.5 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="p-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-28 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-24 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-16 bg-muted rounded" /></td>
                        <td className="p-2.5"><div className="h-4 w-24 bg-muted rounded" /></td>
                      </tr>
                    ))
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                        No transaction events recorded. Execute queries in the SQL Gateway to generate traces.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => {
                      const isSelected = selectedTx?.transactionId === tx.transactionId;
                      return (
                        <tr
                          key={tx.id}
                          onClick={() => setSelectedTx(tx)}
                          className={`hover:bg-elevated/60 cursor-pointer transition-colors ${
                            isSelected ? "bg-elevated text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          <td className="p-2.5">
                            <Badge
                              variant={
                                tx.status === "committed"
                                  ? "success"
                                  : tx.status === "rolled_back"
                                  ? "warning"
                                  : "destructive"
                              }
                              className="text-[9px]"
                            >
                              {tx.status}
                            </Badge>
                          </td>
                          <td className="p-2.5 font-semibold text-foreground">{tx.transactionId}</td>
                          <td className="p-2.5 truncate max-w-[120px] text-muted-foreground">
                            {tx.actorEmail || "system"}
                          </td>
                          <td className="p-2.5 text-primary">{formatDuration(tx.durationMs)}</td>
                          <td className="p-2.5 text-[11px] text-muted-foreground">
                            {formatDate(tx.startedAt)}
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

        {/* Right Col: Selected Transaction Trace Drawer */}
        <Card className="md:col-span-1 flex flex-col justify-between">
          <CardHeader className="py-2.5">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-primary" /> Trace Details
            </CardTitle>
            <CardDescription className="text-[11px]">
              {selectedTx ? `ID: ${selectedTx.transactionId}` : "Select a transaction"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 flex-1 flex flex-col gap-3 text-xs">
            {selectedTx ? (
              <>
                <div className="p-2.5 rounded border border-border bg-sidebar space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="uppercase text-[#34D399] font-bold">{selectedTx.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Execution Duration:</span>
                    <span className="text-foreground">{formatDuration(selectedTx.durationMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Started:</span>
                    <span className="text-muted-foreground">{formatDate(selectedTx.startedAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Actor:</span>
                    <span className="text-muted-foreground">{selectedTx.actorEmail || "control-plane"}</span>
                  </div>
                </div>

                {selectedTx.queryText && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground">
                      Executed Statement
                    </span>
                    <pre className="p-2.5 rounded bg-sidebar border border-border text-[11px] font-mono text-primary whitespace-pre-wrap overflow-auto max-h-40">
                      {selectedTx.queryText}
                    </pre>
                  </div>
                )}

                {txDetails?.associatedChanges && txDetails.associatedChanges.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-muted-foreground">
                      Associated Mutations ({txDetails.associatedChanges.length})
                    </span>
                    <div className="p-2 rounded bg-sidebar border border-border space-y-1 text-[10px] font-mono">
                      {txDetails.associatedChanges.map((c: any) => (
                        <div key={c.id} className="flex justify-between">
                          <span className="text-foreground">{c.tableName}</span>
                          <span className="text-[#34D399]">{c.eventType}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Activity className="h-8 w-8 text-primary" />}
                title="No Transaction Selected"
                description="Select a transaction event from the list to inspect timeline and mutations."
                className="m-auto"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
