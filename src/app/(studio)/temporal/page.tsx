"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { DismissibleAlert } from "@/components/shared/dismissible-alert";
import {
  Clock,
  RotateCcw,
  History,
  GitCompare,
  FileCode,
  Copy,
  Check,
  Download,
  Filter,
  Search,
  Sparkles,
  Layers,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

const restoreVersionSchema = z.object({
  reason: z.string().min(5, "Audit reason must be at least 5 characters"),
});
type RestoreVersionFormValues = z.infer<typeof restoreVersionSchema>;

interface RowVersionItem {
  id: string;
  tableName: string;
  recordId: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
  versionNumber: number;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  diff?: {
    added?: Record<string, unknown>;
    removed?: Record<string, unknown>;
    modified?: Record<string, { old: unknown; new: unknown }>;
  };
  changeSummary?: string;
  modifiedCount?: number;
  addedCount?: number;
  removedCount?: number;
  validFrom: string;
  validTo: string | null;
  transactionXmin?: string;
  performedBy?: string;
}

interface PointInTimeResult {
  asOf: string;
  tableName: string;
  recordId?: string;
  status?: "ACTIVE" | "DELETED" | "NOT_YET_CREATED" | "NOT_FOUND";
  versionNumber?: number | null;
  operation?: string;
  changedAt?: string | null;
  changedBy?: string;
  historicalData?: Record<string, unknown> | null;
  lastKnownState?: Record<string, unknown> | null;
  message?: string;
  rowCount?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  rows?: Array<Record<string, unknown>>;
}

// Client-side diff computation utility
function calculateDiff(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null
) {
  const added: Record<string, unknown> = {};
  const removed: Record<string, unknown> = {};
  const modified: Record<string, { old: unknown; new: unknown }> = {};

  const oldKeys = Object.keys(oldData || {});
  const newKeys = Object.keys(newData || {});

  for (const k of newKeys) {
    if (!oldData || !(k in oldData)) {
      added[k] = newData![k];
    } else if (JSON.stringify(oldData[k]) !== JSON.stringify(newData![k])) {
      modified[k] = { old: oldData[k], new: newData![k] };
    }
  }

  for (const k of oldKeys) {
    if (!newData || !(k in newData)) {
      removed[k] = oldData![k];
    }
  }

  return { added, removed, modified };
}

function JsonSyntaxHighlighter({ data }: { data: unknown }) {
  const formatted = JSON.stringify(data, null, 2);

  return (
    <pre className="p-3 rounded-md bg-sidebar/80 border border-border/80 text-[11px] font-mono overflow-auto max-h-[460px] leading-relaxed select-text text-foreground">
      {formatted}
    </pre>
  );
}

function TemporalInvestigationView() {
  const searchParams = useSearchParams();
  const urlTable = searchParams.get("table") || searchParams.get("tableName") || "";
  const urlRecordId = searchParams.get("recordId") || "";
  const urlDbId = searchParams.get("db") || searchParams.get("databaseId") || "";

  // Query parameters
  const [databases, setDatabases] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>(urlDbId || "");
  const [tableName, setTableName] = React.useState<string>(urlTable || "");
  const [recordId, setRecordId] = React.useState<string>(urlRecordId || "");

  // Table options in active database
  const [availableTables, setAvailableTables] = React.useState<string[]>([]);
  const [temporalTablesSet, setTemporalTablesSet] = React.useState<Set<string>>(new Set());

  const [activeOrgId, setActiveOrgId] = React.useState<string>("");
  const [activeWsId, setActiveWsId] = React.useState<string>("");

  // Point-In-Time states
  const [asOfTimestamp, setAsOfTimestamp] = React.useState<string>(
    new Date(Date.now() - 3600 * 1000).toISOString().slice(0, 16)
  );
  const [timeTravelResult, setTimeTravelResult] = React.useState<PointInTimeResult | null>(null);
  const [isQueryingTimeTravel, setIsQueryingTimeTravel] = React.useState(false);

  // Timeline & Versions
  const [versions, setVersions] = React.useState<RowVersionItem[]>([]);
  const [selectedVersion, setSelectedVersion] = React.useState<RowVersionItem | null>(null);
  const [isLoadingTimeline, setIsLoadingTimeline] = React.useState(false);

  // Timeline Filters
  const [operationFilter, setOperationFilter] = React.useState<string>("ALL");
  const [dateRangeFilter, setDateRangeFilter] = React.useState<string>("all");
  const [timelineSearch, setTimelineSearch] = React.useState<string>("");

  // Inspector Mode: "diff" | "json"
  const [inspectorMode, setInspectorMode] = React.useState<"diff" | "json">("diff");
  // Comparison modes: "mutation" (exact change in this version) | "current" (vs Live DB state) | "custom" (vs custom base)
  const [compareTarget, setCompareTarget] = React.useState<"mutation" | "current" | "custom">("mutation");
  const [customBaseVersion, setCustomBaseVersion] = React.useState<RowVersionItem | null>(null);
  const [liveCurrentRecord, setLiveCurrentRecord] = React.useState<Record<string, unknown> | null>(null);
  const [isLoadingLiveRecord, setIsLoadingLiveRecord] = React.useState(false);
  const [copiedJson, setCopiedJson] = React.useState(false);

  // Restore Modal State
  const [showRestoreModal, setShowRestoreModal] = React.useState(false);
  const [isRestoring, setIsRestoring] = React.useState(false);
  const [notification, setNotification] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const {
    register: registerRestoreVersion,
    handleSubmit: handleRestoreVersionSubmit,
    reset: resetRestoreVersion,
    formState: { errors: restoreVersionErrors },
  } = useForm<RestoreVersionFormValues>({
    resolver: zodResolver(restoreVersionSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { reason: "" },
  });

  // 1. Load session & databases
  React.useEffect(() => {
    async function init() {
      try {
        const meRes = await fetch("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const org = me.currentOrg || me.organizations?.[0];
          const ws = me.currentWorkspace || me.workspaces?.[0];

          if (org) {
            setActiveOrgId(org.id);
            if (ws) setActiveWsId(ws.id);

            let dbs: Array<{ id: string; name: string }> = me.databases || [];
            if (dbs.length === 0) {
              const wsQuery = ws ? `&workspaceId=${ws.id}` : "";
              const dbRes = await fetch(`/api/v1/databases?organizationId=${org.id}${wsQuery}`);
              if (dbRes.ok) {
                const data = await dbRes.json();
                dbs = data.databases || [];
              }
            }

            setDatabases(dbs);

            // Default database selection
            if (urlDbId && dbs.some((d) => d.id === urlDbId)) {
              setSelectedDbId(urlDbId);
            } else if (me.currentDatabase?.id && dbs.some((d) => d.id === me.currentDatabase.id)) {
              setSelectedDbId(me.currentDatabase.id);
            } else if (dbs.length > 0) {
              setSelectedDbId(dbs[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Temporal init failed:", err);
      }
    }
    init();

    // Listen for workspace switch to reset timeline & diffs to prevent cross-workspace data leakage
    const handleWorkspaceChanged = async (e: Event) => {
      const customEvent = e as CustomEvent<{
        workspace?: { id: string; name: string; environment: string };
        database?: { id: string; name: string; status?: string } | null;
      }>;
      const ws = customEvent.detail?.workspace;
      const initialDb = customEvent.detail?.database;

      // Invalidate current state to prevent cross-workspace leakage
      setVersions([]);
      setSelectedVersion(null);
      setCustomBaseVersion(null);
      setTimeTravelResult(null);
      setLiveCurrentRecord(null);

      if (ws) {
        setActiveWsId(ws.id);
        const meRes = await fetch("/api/v1/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const dbs: Array<{ id: string; name: string }> = me.databases || [];
          setDatabases(dbs);

          if (initialDb && dbs.some((d) => d.id === initialDb.id)) {
            setSelectedDbId(initialDb.id);
          } else if (me.currentDatabase?.id && dbs.some((d) => d.id === me.currentDatabase.id)) {
            setSelectedDbId(me.currentDatabase.id);
          } else if (dbs.length > 0) {
            setSelectedDbId(dbs[0].id);
          } else {
            setSelectedDbId("");
          }
        }
      }
    };

    window.addEventListener("chronos:workspace-changed", handleWorkspaceChanged);
    return () => {
      window.removeEventListener("chronos:workspace-changed", handleWorkspaceChanged);
    };
  }, [urlDbId]);

  // 2. Load tables and temporal configuration when database changes
  React.useEffect(() => {
    if (!selectedDbId) {
      setAvailableTables([]);
      setTemporalTablesSet(new Set());
      return;
    }

    async function loadDatabaseTables() {
      try {
        // Fetch temporal tables
        const temporalRes = await fetch(`/api/v1/history/tables?databaseId=${selectedDbId}`);
        const temporalNames = new Set<string>();
        if (temporalRes.ok) {
          const data = await temporalRes.json();
          (data.temporalTables || []).forEach((t: { tableName: string }) => {
            if (t.tableName) temporalNames.add(t.tableName);
          });
        }
        setTemporalTablesSet(temporalNames);

        // Fetch database schema tables
        const schemaRes = await fetch(`/api/v1/databases/${selectedDbId}/schema?schema=public`);
        let schemaTableNames: string[] = [];
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json();
          schemaTableNames = (schemaData.tables || []).map((t: { tableName: string }) => t.tableName);
        }

        // Combine unique tables
        const combined = Array.from(new Set([...Array.from(temporalNames), ...schemaTableNames]));
        setAvailableTables(combined);

        // Set initial table name prioritizing captured tables
        setTableName((prev) => {
          if (urlTable) return urlTable;
          if (prev && combined.includes(prev)) return prev;
          if (temporalNames.size > 0) return Array.from(temporalNames)[0];
          if (combined.length > 0) return combined[0];
          return "snapshots";
        });
      } catch (err) {
        console.warn("Failed to load tables for temporal selector:", err);
      }
    }

    loadDatabaseTables();
  }, [selectedDbId, urlTable]);

  // 3. Fetch record or table timeline
  const fetchSeqRef = React.useRef(0);

  const fetchTimeline = React.useCallback(
    async (override?: {
      table?: string;
      record?: string;
    }) => {
      const activeDb = selectedDbId;
      const activeTable = (override?.table !== undefined ? override.table : tableName).trim();
      const activeRecord = (override?.record !== undefined ? override.record : recordId).trim();

      if (!activeDb || !activeTable) return;
      const seq = ++fetchSeqRef.current;
      setIsLoadingTimeline(true);
      setNotification(null);
      try {
        const params = new URLSearchParams();
        params.set("databaseId", activeDb);
        if (activeRecord) params.set("recordId", activeRecord);
        params.set("limit", "100");

        const endpoint = activeRecord
          ? `/api/v1/history/${activeTable}/${activeRecord}?${params.toString()}`
          : `/api/v1/history/${activeTable}?${params.toString()}`;

        const res = await fetch(endpoint);
        if (seq !== fetchSeqRef.current) return; // Ignore stale out-of-order responses

        if (res.ok) {
          const data = await res.json();
          const list: RowVersionItem[] = data.versions || [];
          setVersions(list);

          if (list.length > 0) {
            setSelectedVersion((prev) => (prev && list.some((v) => v.id === prev.id) ? prev : list[0]));
            setCompareTarget("mutation");
            setCustomBaseVersion(null);
          } else {
            setSelectedVersion(null);
            setCustomBaseVersion(null);
          }
        } else {
          const errData = await res.json().catch(() => null);
          setVersions([]);
          setSelectedVersion(null);
          setCustomBaseVersion(null);
          if (res.status !== 404) {
            setNotification({
              type: "error",
              text: errData?.error || `Failed to fetch versions for ${activeTable}`,
            });
          }
        }
      } catch {
        if (seq === fetchSeqRef.current) {
          setVersions([]);
          setSelectedVersion(null);
          setCustomBaseVersion(null);
        }
      } finally {
        if (seq === fetchSeqRef.current) {
          setIsLoadingTimeline(false);
        }
      }
    },
    [selectedDbId, tableName, recordId]
  );

  // Auto-fetch when cluster or target table changes
  React.useEffect(() => {
    if (selectedDbId && tableName) {
      fetchTimeline({ table: tableName });
    }
  }, [selectedDbId, tableName]);

  // Pure in-memory filter handlers — instant (0ms), deterministic, no vanishing data!
  const handleOperationFilterChange = (op: string) => {
    setOperationFilter(op);
  };

  const handleDateRangeFilterChange = (range: string) => {
    setDateRangeFilter(range);
  };

  const handleTableChange = (newTable: string) => {
    setTableName(newTable);
    setRecordId("");
    fetchTimeline({ table: newTable, record: "" });
  };

  // 4. Fetch Live Record when selectedVersion changes
  React.useEffect(() => {
    if (!selectedVersion || !selectedDbId || !tableName) {
      setLiveCurrentRecord(null);
      return;
    }

    const recId = selectedVersion.recordId || recordId;
    if (!recId) return;

    let isMounted = true;
    setIsLoadingLiveRecord(true);

    fetch(
      `/api/v1/history/current?databaseId=${selectedDbId}&tableName=${encodeURIComponent(
        tableName
      )}&recordId=${encodeURIComponent(recId)}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted) {
          setLiveCurrentRecord(data?.currentRecord || null);
        }
      })
      .catch(() => {
        if (isMounted) setLiveCurrentRecord(null);
      })
      .finally(() => {
        if (isMounted) setIsLoadingLiveRecord(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedVersion, selectedDbId, tableName, recordId]);

  // 5. Point-In-Time Query ("AS OF TIMESTAMP")
  const handleTimeTravelQuery = async () => {
    if (!selectedDbId || !tableName.trim()) return;
    setIsQueryingTimeTravel(true);
    setNotification(null);
    try {
      const res = await fetch("/api/v1/history/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrgId,
          workspaceId: activeWsId,
          databaseId: selectedDbId,
          schemaName: "public",
          tableName: tableName.trim(),
          asOfTimestamp: new Date(asOfTimestamp).toISOString(),
          recordId: recordId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Time travel query failed");

      setTimeTravelResult(data);
    } catch (err: unknown) {
      setNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Time travel query failed",
      });
    } finally {
      setIsQueryingTimeTravel(false);
    }
  };

  // 6. Execute Compensating Restore
  const handleRestore = async (values: RestoreVersionFormValues) => {
    if (!selectedVersion || !selectedDbId || !activeOrgId || !activeWsId) return;
    setIsRestoring(true);
    try {
      const res = await fetch("/api/v1/history/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrgId,
          workspaceId: activeWsId,
          databaseId: selectedDbId,
          versionId: selectedVersion.id,
          reason: values.reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restoration failed");

      setNotification({
        type: "success",
        text: `Compensating update executed! Record restored to Version v${selectedVersion.versionNumber}.`,
      });
      setShowRestoreModal(false);
      resetRestoreVersion();
      fetchTimeline();
    } catch (err: unknown) {
      setNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to execute restore",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  // Filter versions by operation, date range, and in-memory search
  const filteredVersions = React.useMemo(() => {
    let list = versions;

    // Filter by operation
    if (operationFilter !== "ALL") {
      list = list.filter((v) => v.operation.toUpperCase() === operationFilter.toUpperCase());
    }

    // Filter by date range
    if (dateRangeFilter !== "all") {
      const now = Date.now();
      const cutoff =
        dateRangeFilter === "24h"
          ? now - 24 * 3600 * 1000
          : dateRangeFilter === "7d"
          ? now - 7 * 24 * 3600 * 1000
          : dateRangeFilter === "30d"
          ? now - 30 * 24 * 3600 * 1000
          : 0;

      list = list.filter((v) => new Date(v.validFrom).getTime() >= cutoff);
    }

    // Filter by keyword search
    if (timelineSearch.trim()) {
      const term = timelineSearch.toLowerCase();
      list = list.filter(
        (v) =>
          v.recordId.toLowerCase().includes(term) ||
          (v.performedBy && v.performedBy.toLowerCase().includes(term)) ||
          (v.changeSummary && v.changeSummary.toLowerCase().includes(term)) ||
          v.operation.toLowerCase().includes(term)
      );
    }

    return list;
  }, [versions, operationFilter, dateRangeFilter, timelineSearch]);

  // Synchronize selectedVersion when filtered list changes
  React.useEffect(() => {
    if (filteredVersions.length > 0) {
      if (!selectedVersion || !filteredVersions.some((v) => v.id === selectedVersion.id)) {
        setSelectedVersion(filteredVersions[0]);
      }
    } else {
      setSelectedVersion(null);
    }
  }, [filteredVersions, selectedVersion]);

  // Compute Active Diff based on selected inspector target
  const activeDiff = React.useMemo(() => {
    if (!selectedVersion) return null;

    if (compareTarget === "current") {
      const targetState = selectedVersion.newData || selectedVersion.oldData || {};
      return calculateDiff(liveCurrentRecord, targetState);
    }

    if (compareTarget === "custom" && customBaseVersion) {
      const baseState = customBaseVersion.newData || customBaseVersion.oldData || {};
      const targetState = selectedVersion.newData || selectedVersion.oldData || {};
      return calculateDiff(baseState, targetState);
    }

    // Default: "mutation" (exact diff of this version)
    // For UPDATE: diff between oldData and newData (shows the exact modified attribute!)
    // For INSERT: diff between null and newData (shows added attributes)
    // For DELETE: diff between oldData and null (shows deleted attributes)
    // For RESTORE: diff between oldData and newData (shows restored attributes)
    if (selectedVersion.diff) {
      return selectedVersion.diff;
    }
    return calculateDiff(selectedVersion.oldData, selectedVersion.newData);
  }, [selectedVersion, compareTarget, customBaseVersion, liveCurrentRecord]);

  const activeClusterName = databases.find((d) => d.id === selectedDbId)?.name || "Cluster";

  const handleCopyJson = () => {
    if (!selectedVersion) return;
    const data = selectedVersion.newData || selectedVersion.oldData;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleExportJson = () => {
    if (!selectedVersion) return;
    const data = {
      _metadata: {
        versionId: selectedVersion.id,
        versionNumber: selectedVersion.versionNumber,
        operation: selectedVersion.operation,
        tableName: selectedVersion.tableName,
        recordId: selectedVersion.recordId,
        validFrom: selectedVersion.validFrom,
        performedBy: selectedVersion.performedBy,
        transactionId: selectedVersion.transactionXmin,
      },
      snapshot: selectedVersion.newData || selectedVersion.oldData,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedVersion.tableName}-${selectedVersion.recordId}-v${selectedVersion.versionNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">Temporal Investigation & Time Travel</h1>
            <Badge variant="info" className="font-mono text-[10px]">
              POINT-IN-TIME
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Inspect historical record mutations, audit diffs, reconstruct point-in-time states, and execute audited compensating restorations
          </p>
        </div>
      </div>

      <DismissibleAlert
        message={notification}
        onDismiss={() => setNotification(null)}
        autoDismissMs={5000}
      />

      {/* Control Strip: Database, Table, Record Identifier & Timestamp */}
      <Card>
        <CardContent className="p-3.5 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-[180px] space-y-1.5">
            <Label>Cluster</Label>
            <Select value={selectedDbId} onValueChange={setSelectedDbId}>
              <SelectTrigger className="h-8 font-mono text-xs w-full">
                <SelectValue placeholder="Select Cluster">
                  {activeClusterName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id} className="font-mono text-xs">
                    {db.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[190px] space-y-1.5">
            <Label htmlFor="targetTable">Target Table</Label>
            <Select
              value={tableName}
              onValueChange={handleTableChange}
            >
              <SelectTrigger id="targetTable" className="h-8 font-mono text-xs w-full">
                <SelectValue placeholder="Select Table">
                  {tableName || "Select Table"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {temporalTablesSet.size > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold text-primary uppercase font-mono tracking-wider flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> Captured History
                    </div>
                    {Array.from(temporalTablesSet).map((tbl) => (
                      <SelectItem key={tbl} value={tbl} className="font-mono text-xs font-medium">
                        {tbl}
                      </SelectItem>
                    ))}
                    <div className="my-1 border-t border-border" />
                  </>
                )}
                {availableTables.filter((t) => !temporalTablesSet.has(t)).length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase font-mono tracking-wider">
                      Other Tables
                    </div>
                    {availableTables
                      .filter((t) => !temporalTablesSet.has(t))
                      .map((tbl) => (
                        <SelectItem key={tbl} value={tbl} className="font-mono text-xs text-muted-foreground">
                          {tbl}
                        </SelectItem>
                      ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[210px] space-y-1.5">
            <Label htmlFor="recordId">Record ID (Optional)</Label>
            <Input
              id="recordId"
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  fetchTimeline({ record: e.currentTarget.value });
                }
              }}
              placeholder="e.g. UUID (leave empty for table)"
              className="h-8 font-mono text-xs w-full"
            />
          </div>

          <div className="w-full sm:w-[220px] space-y-1.5">
            <Label htmlFor="asOfTimestamp">AS OF Timestamp</Label>
            <DateTimePicker
              id="asOfTimestamp"
              value={asOfTimestamp}
              onChange={setAsOfTimestamp}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1 sm:pt-0">
            <Button
              size="sm"
              onClick={() => fetchTimeline()}
              disabled={!selectedDbId || !tableName.trim()}
              isLoading={isLoadingTimeline}
              className="h-8 text-xs cursor-pointer"
            >
              <History className="h-3.5 w-3.5 mr-1" /> View Timeline
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTimeTravelQuery}
              disabled={!selectedDbId || !tableName.trim()}
              isLoading={isQueryingTimeTravel}
              className="h-8 font-mono text-xs cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5 mr-1" /> Query Point-In-Time
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tables With Captured Mutations Banner (Placed Above) */}
      {temporalTablesSet.size > 0 && (
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg border border-border/80 bg-sidebar/50 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 font-medium text-foreground text-[11px] shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Tables with captured mutations:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {Array.from(temporalTablesSet).map((tbl) => {
              const isActive = tableName === tbl;
              return (
                <button
                  key={tbl}
                  onClick={() => handleTableChange(tbl)}
                  className={`px-2.5 py-1 rounded text-xs font-mono border cursor-pointer transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "border-border bg-panel hover:bg-elevated text-foreground"
                  }`}
                >
                  <span>{tbl}</span>
                  {isActive && <Check className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Point-In-Time Query Result (Historical Reconstruction) */}
      {timeTravelResult && (
        <Card className="border-primary/40 bg-panel">
          <CardHeader className="py-2.5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-mono flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" /> State AS OF {timeTravelResult.asOf}
              </CardTitle>
              <div className="flex items-center gap-2">
                {timeTravelResult.status && (
                  <Badge
                    variant={
                      timeTravelResult.status === "ACTIVE"
                        ? "success"
                        : timeTravelResult.status === "DELETED"
                        ? "destructive"
                        : "warning"
                    }
                    className="font-mono text-[10px]"
                  >
                    {timeTravelResult.status}
                  </Badge>
                )}
                <Badge variant="outline" className="font-mono text-[10px]">
                  {timeTravelResult.recordId
                    ? `Record: ${timeTravelResult.recordId}`
                    : `${timeTravelResult.rowCount ?? (timeTravelResult.rows?.length || 0)} active rows`}
                </Badge>
              </div>
            </div>
            {timeTravelResult.message && (
              <CardDescription className="text-[11px] font-mono text-muted-foreground mt-0.5">
                {timeTravelResult.message}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="p-3">
            {timeTravelResult.rows ? (
              <div className="space-y-2">
                <div className="overflow-x-auto max-h-60 rounded border border-border/70">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead className="bg-sidebar sticky top-0 border-b border-border text-[10px] text-muted-foreground uppercase">
                      <tr>
                        <th className="p-2">Record ID</th>
                        <th className="p-2">Version</th>
                        <th className="p-2">Effective At</th>
                        <th className="p-2">Snapshot Attributes</th>
                        <th className="p-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 text-[11px]">
                      {timeTravelResult.rows.map((row: any, i) => (
                        <tr key={i} className="hover:bg-elevated/40">
                          <td className="p-2 font-medium text-foreground">{row._recordId || row.id || "—"}</td>
                          <td className="p-2 text-muted-foreground">v{row._versionNumber || 1}</td>
                          <td className="p-2 text-muted-foreground">{row._validFrom ? formatDate(row._validFrom) : "—"}</td>
                          <td className="p-2 text-muted-foreground truncate max-w-[280px]">
                            {JSON.stringify(row)}
                          </td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => {
                                setRecordId(row._recordId || row.id || "");
                                fetchTimeline();
                              }}
                              className="text-primary hover:underline text-[10px] cursor-pointer"
                            >
                              Inspect Timeline
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <JsonSyntaxHighlighter
                data={timeTravelResult.historicalData || timeTravelResult.lastKnownState || {}}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Split Layout: Version Timeline (Left 35%) & Diff / Restore Viewer (Right 65%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* LEFT COLUMN: Version History Timeline (~35%) */}
        <Card className="lg:col-span-4 flex flex-col">
          <CardHeader className="py-2.5 border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-primary" /> Version Timeline ({filteredVersions.length})
              </CardTitle>
              {tableName && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {tableName}
                </Badge>
              )}
            </div>

            {/* Quick Search & Filters */}
            <div className="pt-2 space-y-2">
              <div className="relative">
                <Search className="h-3 w-3 text-muted-foreground absolute left-2.5 top-2.5" />
                <Input
                  value={timelineSearch}
                  onChange={(e) => setTimelineSearch(e.target.value)}
                  placeholder="Filter by record ID, actor, or keyword..."
                  className="h-7 text-[11px] pl-7 pr-2 font-mono w-full"
                />
              </div>

              <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                <div className="flex items-center gap-1">
                  {(["ALL", "INSERT", "UPDATE", "DELETE", "RESTORE"] as const).map((op) => {
                    const count =
                      op === "ALL"
                        ? versions.length
                        : versions.filter((v) => v.operation.toUpperCase() === op).length;

                    return (
                      <button
                        key={op}
                        onClick={() => handleOperationFilterChange(op)}
                        className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1 ${
                          operationFilter === op
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:bg-elevated"
                        }`}
                      >
                        <span>{op}</span>
                        {count > 0 && (
                          <span
                            className={`text-[9px] px-1 rounded-full ${
                              operationFilter === op
                                ? "bg-primary-foreground/20 text-primary-foreground font-bold"
                                : "bg-elevated text-muted-foreground"
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <Select value={dateRangeFilter} onValueChange={handleDateRangeFilterChange}>
                  <SelectTrigger className="h-6 text-[10px] font-mono w-[85px] border-none bg-transparent hover:bg-elevated p-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="24h">Last 24h</SelectItem>
                    <SelectItem value="7d">Last 7d</SelectItem>
                    <SelectItem value="30d">Last 30d</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-2 overflow-y-auto max-h-[620px] space-y-2">
            {filteredVersions.map((ver) => {
              const isSelected = selectedVersion?.id === ver.id;
              const isCustomBase = customBaseVersion?.id === ver.id;

              return (
                <div
                  key={ver.id}
                  onClick={() => setSelectedVersion(ver)}
                  className={`p-2.5 rounded border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40 text-foreground"
                      : isCustomBase
                      ? "border-warning/60 bg-warning/10 text-foreground"
                      : "border-border bg-sidebar hover:bg-elevated/70 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground">v{ver.versionNumber}</span>
                      <Badge
                        variant={
                          ver.operation === "INSERT"
                            ? "success"
                            : ver.operation === "UPDATE"
                            ? "info"
                            : ver.operation === "RESTORE"
                            ? "warning"
                            : "destructive"
                        }
                        className="text-[9px] px-1 py-0 h-4"
                      >
                        {ver.operation}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1 text-[10px]">
                      {ver.modifiedCount !== undefined && ver.modifiedCount > 0 && (
                        <span className="text-warning font-mono">~{ver.modifiedCount}</span>
                      )}
                      {ver.addedCount !== undefined && ver.addedCount > 0 && (
                        <span className="text-[#34D399] font-mono">+{ver.addedCount}</span>
                      )}
                      {ver.removedCount !== undefined && ver.removedCount > 0 && (
                        <span className="text-destructive font-mono">-{ver.removedCount}</span>
                      )}
                    </div>
                  </div>

                  {/* Change summary */}
                  {ver.changeSummary && (
                    <div className="text-[11px] text-foreground font-medium mt-1 truncate">
                      {ver.changeSummary}
                    </div>
                  )}

                  {/* Record ID identifier */}
                  {ver.recordId && (
                    <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                      record: <span className="text-foreground">{ver.recordId}</span>
                    </div>
                  )}

                  {/* Metadata: actor & date */}
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between font-mono">
                    <span>{formatDate(ver.validFrom)}</span>
                    {ver.performedBy && <span className="truncate max-w-[110px]">{ver.performedBy}</span>}
                  </div>

                  <div className="mt-1.5 pt-1.5 border-t border-border/50 flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground">Compare Base:</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomBaseVersion(ver);
                        setCompareTarget("custom");
                      }}
                      className="text-primary hover:underline font-mono cursor-pointer"
                    >
                      {isCustomBase ? "Selected Base ✓" : "Set As Base"}
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredVersions.length === 0 && (
              <div className="py-6 px-2 space-y-3">
                <EmptyState
                  icon={<History className="h-6 w-6 text-muted-foreground" />}
                  title="No versions captured"
                  description={
                    operationFilter !== "ALL"
                      ? `No historical ${operationFilter} mutations captured for table "${tableName}".`
                      : tableName
                      ? recordId
                        ? `No historical mutations recorded for record "${recordId}" in table "${tableName}".`
                        : `No historical mutations captured yet for table "${tableName}" in cluster "${activeClusterName}".`
                      : "Select a target table above to inspect historical record versions."
                  }
                  className="py-4"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: State & Diff Inspector (~65%) */}
        <Card className="lg:col-span-8 flex flex-col min-h-[500px]">
          <CardHeader className="py-2.5 border-b border-border/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <GitCompare className="h-3.5 w-3.5 text-primary" /> State & Diff Inspector
              </CardTitle>

              {/* View Switcher: Diff vs JSON */}
              <div className="flex items-center bg-sidebar rounded border border-border p-0.5 text-[11px] font-mono">
                <button
                  onClick={() => setInspectorMode("diff")}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    inspectorMode === "diff"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Diff View
                </button>
                <button
                  onClick={() => setInspectorMode("json")}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    inspectorMode === "json"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  JSON View
                </button>
              </div>
            </div>

            {selectedVersion && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyJson}
                  className="h-7 text-xs font-mono cursor-pointer"
                  title="Copy Snapshot JSON"
                >
                  {copiedJson ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-[#34D399]" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" /> Copy JSON
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJson}
                  className="h-7 text-xs font-mono cursor-pointer"
                  title="Export Version JSON File"
                >
                  <Download className="h-3 w-3 mr-1" /> Export
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRestoreModal(true)}
                  className="h-7 text-xs border-warning/40 text-warning hover:bg-warning/10 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Restore Version
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-3 flex-1 flex flex-col space-y-3">
            {selectedVersion ? (
              <>
                {/* Metadata Strip */}
                <div className="p-2 rounded bg-sidebar border border-border flex flex-wrap items-center justify-between text-[11px] font-mono gap-2 text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span>
                      Version: <strong className="text-foreground">v{selectedVersion.versionNumber}</strong>
                    </span>
                    <span>
                      Operation: <strong className="text-foreground">{selectedVersion.operation}</strong>
                    </span>
                    <span>
                      Record: <strong className="text-foreground">{selectedVersion.recordId}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>Valid from: <strong className="text-foreground">{formatDate(selectedVersion.validFrom)}</strong></span>
                    {selectedVersion.transactionXmin && (
                      <span>tx: <strong className="text-foreground">{selectedVersion.transactionXmin}</strong></span>
                    )}
                  </div>
                </div>

                {/* Diff View Mode */}
                {inspectorMode === "diff" && (
                  <div className="space-y-3">
                    {/* Compare Target Selector */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Compare against:</span>
                        <div className="flex items-center bg-sidebar rounded border border-border p-0.5 text-[11px] font-mono">
                          <button
                            onClick={() => setCompareTarget("mutation")}
                            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                              compareTarget === "mutation"
                                ? "bg-panel text-foreground font-semibold shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            This Mutation
                          </button>
                          <button
                            onClick={() => setCompareTarget("current")}
                            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                              compareTarget === "current"
                                ? "bg-panel text-foreground font-semibold shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            title="Preview what changes if this version is restored to the live database"
                          >
                            Preview Restore vs Live DB
                          </button>
                          {customBaseVersion && (
                            <button
                              onClick={() => setCompareTarget("custom")}
                              className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                                compareTarget === "custom"
                                  ? "bg-panel text-foreground font-semibold shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Custom Base (v{customBaseVersion.versionNumber})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Diff summary badges */}
                      {activeDiff && (
                        <div className="flex items-center gap-1 text-[11px] font-mono">
                          <Badge variant="outline" className="text-warning">
                            {Object.keys(activeDiff.modified || {}).length} modified
                          </Badge>
                          <Badge variant="outline" className="text-[#34D399]">
                            {Object.keys(activeDiff.added || {}).length} added
                          </Badge>
                          <Badge variant="outline" className="text-destructive">
                            {Object.keys(activeDiff.removed || {}).length} removed
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Informational banner when Previewing Restore vs Live DB */}
                    {compareTarget === "current" && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar/90 border border-border text-[11px] font-mono">
                        {liveCurrentRecord ? (
                          <>
                            <span className="flex h-2 w-2 rounded-full bg-[#34D399] shrink-0" />
                            <span className="text-foreground font-semibold">Live DB Record Present</span>
                            <span className="text-muted-foreground">
                              — Comparing Version v{selectedVersion.versionNumber} against the live database row.
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                            <span className="text-warning font-semibold">Not Restored / Deleted in Live DB</span>
                            <span className="text-muted-foreground">
                              — This record is currently not present in the live database. Diff shows attributes that would be recreated upon restore.
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Diff Tables */}
                    {activeDiff && (
                      <div className="space-y-3">
                        {/* Modified Attributes */}
                        {Object.keys(activeDiff.modified || {}).length > 0 && (
                          <div className="rounded border border-border bg-sidebar overflow-x-auto">
                            <div className="px-3 py-1.5 bg-sidebar/80 border-b border-border text-[10px] font-mono uppercase text-muted-foreground font-semibold">
                              {compareTarget === "current"
                                ? `Modified Attributes if Restored (${Object.keys(activeDiff.modified || {}).length})`
                                : `Modified Attributes (${Object.keys(activeDiff.modified || {}).length})`}
                            </div>
                            <table className="w-full text-left text-xs font-mono border-collapse">
                              <thead>
                                <tr className="border-b border-border/80 text-muted-foreground text-[10px]">
                                  <th className="p-2 w-1/4">Field</th>
                                  <th className="p-2 w-3/8">
                                    {compareTarget === "current" ? "Current Live DB Value" : "Previous Value"}
                                  </th>
                                  <th className="p-2 w-3/8">
                                    {compareTarget === "current"
                                      ? `Value if Restored (v${selectedVersion.versionNumber})`
                                      : "New / Restored Value"}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60 text-[11px]">
                                {Object.entries(activeDiff.modified || {}).map(([key, val]: any) => (
                                  <tr key={key} className="hover:bg-elevated/30">
                                    <td className="p-2 font-semibold text-foreground">{key}</td>
                                    <td className="p-2 text-destructive line-through bg-destructive/5 font-mono">
                                      {JSON.stringify(val.old)}
                                    </td>
                                    <td className="p-2 text-[#34D399] bg-[#34D399]/5 font-mono">
                                      {JSON.stringify(val.new)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Deleted / Removed Attributes */}
                        {Object.keys(activeDiff.removed || {}).length > 0 && (
                          <div className="rounded border border-destructive/30 bg-sidebar overflow-x-auto">
                            <div className="px-3 py-1.5 bg-destructive/10 border-b border-destructive/20 text-[10px] font-mono uppercase text-destructive font-semibold flex items-center gap-1.5">
                              <AlertTriangle className="h-3 w-3" />
                              <span>
                                {compareTarget === "current"
                                  ? `Attributes Removed if Restored (${Object.keys(activeDiff.removed || {}).length})`
                                  : selectedVersion.operation === "DELETE"
                                  ? `Deleted Record Snapshot Attributes (${Object.keys(activeDiff.removed || {}).length})`
                                  : `Removed Attributes (${Object.keys(activeDiff.removed || {}).length})`}
                              </span>
                            </div>
                            <table className="w-full text-left text-xs font-mono border-collapse">
                              <thead>
                                <tr className="border-b border-border/80 text-muted-foreground text-[10px]">
                                  <th className="p-2 w-1/4">Field</th>
                                  <th className="p-2">
                                    {compareTarget === "current" ? "Attribute Removed from Live DB" : "Deleted Value"}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60 text-[11px]">
                                {Object.entries(activeDiff.removed || {}).map(([key, val]: any) => (
                                  <tr key={key} className="hover:bg-elevated/30">
                                    <td className="p-2 w-1/4 font-semibold text-foreground">{key}</td>
                                    <td className="p-2 text-destructive font-mono">
                                      -{JSON.stringify(val)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Added Attributes */}
                        {Object.keys(activeDiff.added || {}).length > 0 && (
                          <div className="rounded border border-[#34D399]/30 bg-sidebar overflow-x-auto">
                            <div className="px-3 py-1.5 bg-[#34D399]/10 border-b border-[#34D399]/20 text-[10px] font-mono uppercase text-[#34D399] font-semibold">
                              {compareTarget === "current"
                                ? liveCurrentRecord
                                  ? `Added Attributes if Restored (${Object.keys(activeDiff.added || {}).length})`
                                  : `Attributes to Recreate on Restore (${Object.keys(activeDiff.added || {}).length})`
                                : `Added Attributes (${Object.keys(activeDiff.added || {}).length})`}
                            </div>
                            <table className="w-full text-left text-xs font-mono border-collapse">
                              <thead>
                                <tr className="border-b border-border/80 text-muted-foreground text-[10px]">
                                  <th className="p-2 w-1/4">Field</th>
                                  <th className="p-2">
                                    {compareTarget === "current" && !liveCurrentRecord ? "Value to Recreate" : "Value"}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60 text-[11px]">
                                {Object.entries(activeDiff.added || {}).map(([key, val]: any) => (
                                  <tr key={key} className="hover:bg-elevated/30">
                                    <td className="p-2 w-1/4 font-semibold text-foreground">{key}</td>
                                    <td className="p-2 text-[#34D399] font-mono">+{JSON.stringify(val)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {Object.keys(activeDiff.modified || {}).length === 0 &&
                          Object.keys(activeDiff.added || {}).length === 0 &&
                          Object.keys(activeDiff.removed || {}).length === 0 && (
                            <div className="p-8 text-center space-y-2 border rounded-lg bg-sidebar/40 border-border">
                              {compareTarget === "current" ? (
                                liveCurrentRecord ? (
                                  <>
                                    <CheckCircle2 className="h-6 w-6 text-[#34D399] mx-auto" />
                                    <div className="text-xs font-semibold text-foreground font-mono">
                                      Live Database Already In Sync with Version v{selectedVersion.versionNumber}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                                      All attributes in this historical snapshot are already identical to the current row in cluster &quot;{activeClusterName}&quot;. No compensating restoration is required.
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="h-6 w-6 text-warning mx-auto" />
                                    <div className="text-xs font-semibold text-warning font-mono">
                                      Record Deleted in Live Database
                                    </div>
                                    <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                                      This record is deleted in the live database. No live data was found to compare against.
                                    </p>
                                  </>
                                )
                              ) : (
                                <div className="text-xs text-muted-foreground">
                                  No attribute differences detected in this comparison.
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}

                {/* JSON View Mode */}
                {inspectorMode === "json" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase text-muted-foreground">
                      <span>Full Snapshot Data (v{selectedVersion.versionNumber})</span>
                      <span>{Object.keys(selectedVersion.newData || selectedVersion.oldData || {}).length} attributes</span>
                    </div>
                    <JsonSyntaxHighlighter
                      data={selectedVersion.newData || selectedVersion.oldData || {}}
                    />
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Clock className="h-8 w-8 text-primary" />}
                title="No Version Selected"
                description="Select a historical snapshot from the left timeline to inspect diffs and attribute mutations."
                className="m-auto"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* RESTORE CONFIRMATION DIALOG */}
      <Dialog open={showRestoreModal} onOpenChange={setShowRestoreModal}>
        {selectedVersion && (
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-xs flex items-center gap-1.5 text-warning">
                <RotateCcw className="h-4 w-4" /> Confirm Compensating Restore
              </DialogTitle>
              <DialogDescription>
                Restoration executes a compensating operation in a NEW transaction. All previous versions are preserved in the append-only history.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRestoreVersionSubmit(handleRestore)} noValidate className="space-y-3 pt-2">
              <div className="p-3 rounded bg-sidebar border border-border space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Table:</span>
                  <span className="text-foreground">{tableName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Record Identifier:</span>
                  <span className="text-foreground">{selectedVersion.recordId || recordId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Restore From Version:</span>
                  <span className="text-foreground font-bold text-primary">v{selectedVersion.versionNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Mutation Time:</span>
                  <span className="text-foreground">{formatDate(selectedVersion.validFrom)}</span>
                </div>
              </div>

              {/* Side-by-side Current vs Restore Preview */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded border border-border bg-sidebar/50 space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase">Current Live Database State</div>
                  <pre className="text-[10px] max-h-32 overflow-auto text-muted-foreground">
                    {liveCurrentRecord ? JSON.stringify(liveCurrentRecord, null, 2) : "Record currently deleted or not found"}
                  </pre>
                </div>
                <div className="p-2 rounded border border-primary/40 bg-primary/5 space-y-1">
                  <div className="text-[10px] text-primary uppercase">State Being Restored (v{selectedVersion.versionNumber})</div>
                  <pre className="text-[10px] max-h-32 overflow-auto text-foreground">
                    {JSON.stringify(selectedVersion.newData || selectedVersion.oldData, null, 2)}
                  </pre>
                </div>
              </div>

              <Field error={restoreVersionErrors.reason?.message}>
                <FieldLabel htmlFor="restoreReason">
                  Audit Reason for Restoration (Required)
                </FieldLabel>
                <Input
                  id="restoreReason"
                  placeholder="e.g. Rollback accidental customer balance overwrite"
                  {...registerRestoreVersion("reason")}
                />
                <FieldError />
              </Field>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowRestoreModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isLoading={isRestoring}
                >
                  Execute Compensating Restore
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export default function TemporalPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 text-xs font-mono text-muted-foreground">
          Loading Temporal Investigation...
        </div>
      }
    >
      <TemporalInvestigationView />
    </React.Suspense>
  );
}
