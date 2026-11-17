"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const restoreVersionSchema = z.object({
  reason: z.string().min(5, "Audit reason must be at least 5 characters"),
});
type RestoreVersionFormValues = z.infer<typeof restoreVersionSchema>;
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
import { StatusIndicator } from "@/components/shared/status-indicator";
import { EmptyState } from "@/components/shared/empty-state";
import { DismissibleAlert } from "@/components/shared/dismissible-alert";
import {
  Clock,
  RotateCcw,
  History,
  GitCommit,
  GitCompare,
  Database,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Calendar,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface RowVersionItem {
  id: string;
  tableName: string;
  recordId: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
  versionNumber: number;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  validFrom: string;
  validTo: string | null;
  transactionXmin?: string;
  performedBy?: string;
}

export default function TemporalPage() {
  // Query parameters
  const [databases, setDatabases] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("");
  const [tableName, setTableName] = React.useState<string>("users");
  const [recordId, setRecordId] = React.useState<string>("");

  const [activeOrgId, setActiveOrgId] = React.useState<string>("");
  const [activeWsId, setActiveWsId] = React.useState<string>("");

  // Time Travel states
  const [asOfTimestamp, setAsOfTimestamp] = React.useState<string>(
    new Date(Date.now() - 3600 * 1000).toISOString().slice(0, 16)
  );
  const [timeTravelResult, setTimeTravelResult] = React.useState<any>(null);
  const [isQueryingTimeTravel, setIsQueryingTimeTravel] = React.useState(false);

  // Timeline & Versions
  const [versions, setVersions] = React.useState<RowVersionItem[]>([]);
  const [selectedVersion, setSelectedVersion] = React.useState<RowVersionItem | null>(null);
  const [compareVersionB, setCompareVersionB] = React.useState<RowVersionItem | null>(null);
  const [diffResult, setDiffResult] = React.useState<any>(null);
  const [isLoadingTimeline, setIsLoadingTimeline] = React.useState(false);

  // Restore state
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
          const org = me.organizations?.[0];
          const ws = me.workspaces?.[0];
          if (org) {
            setActiveOrgId(org.id);
            if (ws) setActiveWsId(ws.id);

            const dbRes = await fetch(`/api/v1/databases?organizationId=${org.id}`);
            if (dbRes.ok) {
              const data = await dbRes.json();
              setDatabases(data.databases || []);
              if (data.databases?.length > 0) setSelectedDbId(data.databases[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Temporal init failed:", err);
      }
    }
    init();
  }, []);

  // 2. Fetch record timeline
  const fetchTimeline = async () => {
    if (!selectedDbId || !tableName || !recordId) return;
    setIsLoadingTimeline(true);
    setNotification(null);
    try {
      const res = await fetch(
        `/api/v1/history/${tableName}/${recordId}?databaseId=${selectedDbId}`
      );
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
        if (data.versions?.length > 0) {
          setSelectedVersion(data.versions[0]);
          if (data.versions.length > 1) setCompareVersionB(data.versions[1]);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  // 3. Time travel query "AS OF TIMESTAMP"
  const handleTimeTravelQuery = async () => {
    if (!selectedDbId || !activeOrgId || !activeWsId) return;
    setIsQueryingTimeTravel(true);
    setNotification(null);
    try {
      const url = new URL(`/api/v1/history/time-travel`, window.location.origin);
      url.searchParams.set("databaseId", selectedDbId);
      url.searchParams.set("tableName", tableName);
      url.searchParams.set("asOf", new Date(asOfTimestamp).toISOString());
      if (recordId) url.searchParams.set("recordId", recordId);

      const res = await fetch(url.toString());
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

  // 4. Compare two versions
  React.useEffect(() => {
    if (!selectedVersion || !compareVersionB) return;
    fetch("/api/v1/history/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        databaseId: selectedDbId,
        versionIdA: selectedVersion.id,
        versionIdB: compareVersionB.id,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.diff) setDiffResult(data.diff);
      })
      .catch(() => {});
  }, [selectedVersion, compareVersionB, selectedDbId]);

  // 5. Execute Compensating Restore
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
        text: `Compensating update executed! Record restored to Version ${selectedVersion.versionNumber}.`,
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

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">Temporal Investigation & Time Travel</h1>
            <Badge variant="info" className="font-mono text-[10px]">
              Point-In-Time
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Inspect historical record states, diff previous values, and execute audited compensating restorations
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
                <SelectValue placeholder="Cluster" />
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

          <div className="w-full sm:w-[160px] space-y-1.5">
            <Label htmlFor="targetTable">Target Table</Label>
            <Input
              id="targetTable"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="e.g. users, orders"
              className="h-8 font-mono text-xs w-full"
            />
          </div>

          <div className="w-full sm:w-[180px] space-y-1.5">
            <Label htmlFor="recordId">Record ID (Optional)</Label>
            <Input
              id="recordId"
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              placeholder="e.g. usr_123 or UUID"
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
              onClick={fetchTimeline}
              disabled={!recordId}
              isLoading={isLoadingTimeline}
              className="h-8 text-xs cursor-pointer"
            >
              <History className="h-3.5 w-3.5 mr-1" /> View Timeline
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTimeTravelQuery}
              isLoading={isQueryingTimeTravel}
              className="h-8 font-mono text-xs cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5 mr-1" /> Query Point-In-Time
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Point-In-Time Query Result (if run) */}
      {timeTravelResult && (
        <Card className="border-primary/40 bg-panel">
          <CardHeader className="py-2.5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-mono flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" /> State AS OF {timeTravelResult.asOf}
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px]">
                {timeTravelResult.recordId
                  ? `Record: ${timeTravelResult.recordId}`
                  : `${timeTravelResult.rowCount} rows active`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <pre className="p-2.5 rounded bg-sidebar border border-border text-[11px] font-mono text-primary overflow-auto max-h-60">
              {JSON.stringify(timeTravelResult.historicalData || timeTravelResult.rows, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Main Split Layout: Version Timeline (Left) & Diff / Restore Viewer (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* LEFT COLUMN: Version Timeline (Horizontally scrollable on mobile) */}
        <Card className="md:col-span-1">
          <CardHeader className="py-2.5">
            <CardTitle className="text-xs">Version History ({versions.length})</CardTitle>
            <CardDescription className="text-[11px]">
              Chronological versions captured by temporal triggers
            </CardDescription>
          </CardHeader>
          <CardContent className="p-2 flex md:flex-col overflow-x-auto md:overflow-y-auto max-h-[500px] gap-2 md:gap-1 pb-3 md:pb-2">
            {versions.map((ver) => {
              const isSelected = selectedVersion?.id === ver.id;
              const isB = compareVersionB?.id === ver.id;
              return (
                <div
                  key={ver.id}
                  onClick={() => setSelectedVersion(ver)}
                  className={`p-2 rounded border text-xs cursor-pointer transition-colors shrink-0 w-[210px] md:w-auto ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : isB
                      ? "border-warning/50 bg-warning/10 text-foreground"
                      : "border-border bg-sidebar hover:bg-elevated text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between font-mono">
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
                      className="text-[9px]"
                    >
                      {ver.operation}
                    </Badge>
                  </div>

                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between font-mono">
                    <span>{formatDate(ver.validFrom)}</span>
                    {ver.transactionXmin && <span>tx:{ver.transactionXmin}</span>}
                  </div>

                  <div className="mt-1 pt-1 border-t border-border/50 flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground">Compare:</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompareVersionB(ver);
                      }}
                      className="text-primary hover:underline font-mono"
                    >
                      {isB ? "Base Diff ✓" : "Set Base"}
                    </button>
                  </div>
                </div>
              );
            })}

            {versions.length === 0 && (
              <EmptyState
                icon={<History className="h-6 w-6 text-muted-foreground" />}
                title="No versions captured"
                description="Enter a record ID to query historical row mutations."
                className="py-6"
              />
            )}
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Diff Inspector & Restore Action */}
        <Card className="md:col-span-2 flex flex-col justify-between">
          <CardHeader className="py-2.5 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs flex items-center gap-1.5">
                <GitCompare className="h-3.5 w-3.5 text-primary" /> State & Diff Inspector
              </CardTitle>
              {selectedVersion && (
                <CardDescription className="text-[11px] font-mono">
                  Inspecting Version {selectedVersion.versionNumber} (Valid from {formatDate(selectedVersion.validFrom)})
                </CardDescription>
              )}
            </div>

            {selectedVersion && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRestoreModal(true)}
                className="h-7 text-xs border-warning/40 text-warning hover:bg-warning/10"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Restore Version
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-3 flex-1 flex flex-col space-y-3">
            {selectedVersion ? (
              <>
                {/* Visual Field Diff (if comparison exists) */}
                {diffResult?.modified && Object.keys(diffResult.modified).length > 0 && (
                  <div className="p-2.5 rounded border border-border bg-sidebar overflow-x-auto">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">
                      Modified Attributes
                    </div>
                    <table className="w-full text-left text-xs font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground text-[10px]">
                          <th className="p-1">Field</th>
                          <th className="p-1">Base (v{compareVersionB?.versionNumber})</th>
                          <th className="p-1">Target (v{selectedVersion.versionNumber})</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60 text-[11px]">
                        {Object.entries(diffResult.modified).map(([key, val]: any) => (
                          <tr key={key}>
                            <td className="p-1 font-semibold text-foreground">{key}</td>
                            <td className="p-1 text-destructive line-through">
                              {JSON.stringify(val.old)}
                            </td>
                            <td className="p-1 text-[#34D399]">{JSON.stringify(val.new)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Full Snapshot State */}
                <div className="flex-1 flex flex-col space-y-1">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground">
                    Complete Snapshot Data (v{selectedVersion.versionNumber})
                  </span>
                  <pre className="flex-1 p-3 rounded border border-border bg-sidebar text-[11px] font-mono text-foreground overflow-auto max-h-64">
                    {JSON.stringify(selectedVersion.newData || selectedVersion.oldData, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<Clock className="h-8 w-8 text-primary" />}
                title="No Version Selected"
                description="Select a historical snapshot from the left timeline to inspect attributes."
                className="m-auto"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* RESTORE CONFIRMATION DIALOG */}
      <Dialog open={showRestoreModal} onOpenChange={setShowRestoreModal}>
        {selectedVersion && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xs flex items-center gap-1.5 text-warning">
                <RotateCcw className="h-4 w-4" /> Confirm Compensating Restore
              </DialogTitle>
              <DialogDescription>
                Restoring executes a compensating update in a NEW transaction. Previous versions
                are strictly preserved in the append-only history.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRestoreVersionSubmit(handleRestore)} noValidate className="space-y-3 pt-2">
              <div className="p-2.5 rounded bg-sidebar border border-border space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Version:</span>
                  <span className="text-foreground">v{selectedVersion.versionNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Table:</span>
                  <span className="text-foreground">{tableName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Record ID:</span>
                  <span className="text-foreground">{recordId}</span>
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

              <DialogFooter className="pt-4">
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
