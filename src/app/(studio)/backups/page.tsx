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

const createSnapshotSchema = z.object({
  name: z.string().min(1, "Snapshot identifier is required"),
});
type CreateSnapshotFormValues = z.infer<typeof createSnapshotSchema>;

interface RestoreSnapshotFormValues {
  confirmationPhrase: string;
}

const restoreSnapshotSchema = z.object({
  confirmationPhrase: z.string().refine((val): val is string => val === "RESTORE_SNAPSHOT", {
    message: 'Type "RESTORE_SNAPSHOT" to confirm',
  }),
});
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
import { StatusIndicator } from "@/components/shared/status-indicator";
import { EmptyState } from "@/components/shared/empty-state";
import { DismissibleAlert } from "@/components/shared/dismissible-alert";
import {
  Archive,
  Database,
  RotateCcw,
  Clock,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Server,
  Layers,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface SnapshotItem {
  id: string;
  databaseId: string;
  name: string;
  snapshotType: string;
  status: string;
  recoveryPoint?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export default function BackupsPage() {
  const [databases, setDatabases] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("");
  const [activeOrgId, setActiveOrgId] = React.useState<string>("");
  const [activeWsId, setActiveWsId] = React.useState<string>("");

  const [snapshots, setSnapshots] = React.useState<SnapshotItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Create Snapshot Modal
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [snapshotType, setSnapshotType] = React.useState<"manual" | "daily" | "pitr_point">("manual");
  const [isCreating, setIsCreating] = React.useState(false);

  const {
    register: registerCreateSnapshot,
    handleSubmit: handleCreateSnapshotSubmit,
    reset: resetCreateSnapshot,
    formState: { errors: createSnapshotErrors },
  } = useForm<CreateSnapshotFormValues>({
    resolver: zodResolver(createSnapshotSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { name: "" },
  });

  // Recovery Modal
  const [showRestoreModal, setShowRestoreModal] = React.useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<SnapshotItem | null>(null);
  const [isRestoring, setIsRestoring] = React.useState(false);

  const {
    register: registerRestore,
    handleSubmit: handleRestoreSubmit,
    reset: resetRestore,
    formState: { errors: restoreErrors },
  } = useForm<RestoreSnapshotFormValues>({
    resolver: zodResolver(restoreSnapshotSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { confirmationPhrase: "" },
  });

  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  // 1. Initial Load: Fetch Session & Databases
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
              if (data.databases?.length > 0) {
                setSelectedDbId(data.databases[0].id);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch context:", err);
      }
    }
    init();
  }, []);

  // 2. Fetch Snapshots
  const loadSnapshots = React.useCallback(async () => {
    if (!selectedDbId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/backups?databaseId=${selectedDbId}`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots || []);
      }
    } catch (err) {
      console.error("Failed to load snapshots:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDbId]);

  React.useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  // Create Snapshot
  const handleCreateSnapshot = async (values: CreateSnapshotFormValues) => {
    if (!selectedDbId || !activeOrgId || !activeWsId) return;
    setIsCreating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/v1/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrgId,
          workspaceId: activeWsId,
          databaseId: selectedDbId,
          name: values.name,
          snapshotType,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create snapshot");

      setMessage({ type: "success", text: `Snapshot '${values.name}' created successfully!` });
      setShowCreateModal(false);
      resetCreateSnapshot();
      loadSnapshots();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Creation failed" });
    } finally {
      setIsCreating(false);
    }
  };

  // Execute Restore
  const handleRestore = async (values: RestoreSnapshotFormValues) => {
    if (!selectedSnapshot || !selectedDbId || !activeOrgId || !activeWsId) return;
    setIsRestoring(true);
    setMessage(null);

    try {
      const res = await fetch("/api/v1/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrgId,
          workspaceId: activeWsId,
          databaseId: selectedDbId,
          snapshotId: selectedSnapshot.id,
          confirmationPhrase: values.confirmationPhrase,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recovery failed");

      setMessage({ type: "success", text: data.message || "Recovery workflow initiated" });
      setShowRestoreModal(false);
      resetRestore();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Recovery failed" });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">Backup & Recovery Center</h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              Neon PITR & Snapshots
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Point-in-time recovery points, cluster snapshots, and recovery authorization
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setShowCreateModal(true)} className="h-8 text-xs cursor-pointer">
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Snapshot
          </Button>
          <Button variant="outline" size="sm" onClick={loadSnapshots} isLoading={isLoading} className="h-8 text-xs cursor-pointer">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Target Database Selection */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 rounded-lg border border-border bg-panel text-xs">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-foreground">Active Database:</span>
        </div>
        <div className="w-full sm:w-64">
          <Select value={selectedDbId} onValueChange={setSelectedDbId}>
            <SelectTrigger className="h-7 text-xs font-mono">
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
      </div>

      {/* Feedback banner */}
      <DismissibleAlert
        message={message}
        onDismiss={() => setMessage(null)}
        autoDismissMs={5000}
      />

      {/* Snapshots Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Cluster Recovery Points & Snapshots</CardTitle>
            <span className="text-[11px] font-mono text-muted-foreground">
              Total Points: {snapshots.length}
            </span>
          </div>
          <CardDescription>
            Chronos preserves cryptographic PITR checkpoints to safely restore or branch production databases.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                  <th className="p-3 font-medium">Snapshot Identifier</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Recovery Point (UTC)</th>
                  <th className="p-3 font-medium">Recorded At</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snapshots.map((s) => (
                  <tr key={s.id} className="hover:bg-elevated/40">
                    <td className="p-3 font-semibold text-foreground">{s.name}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {s.snapshotType.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <StatusIndicator status="active" label={s.status} />
                    </td>
                    <td className="p-3 text-[11px] text-primary">
                      {formatDate(s.recoveryPoint)}
                    </td>
                    <td className="p-3 text-[11px] text-muted-foreground">{formatDate(s.createdAt)}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedSnapshot(s);
                          setShowRestoreModal(true);
                        }}
                        className="h-6 text-[10px]"
                      >
                        <RotateCcw className="h-2.5 w-2.5 mr-1" /> Recover Point
                      </Button>
                    </td>
                  </tr>
                ))}
                {snapshots.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-muted-foreground">
                      No cluster snapshots recorded yet. Create one with &quot;Create Snapshot&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* CREATE SNAPSHOT DIALOG */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Cluster Snapshot Point</DialogTitle>
            <DialogDescription>
              Records an authenticated recovery point reference for this database
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSnapshotSubmit(handleCreateSnapshot)} noValidate className="space-y-3 pt-2">
            <Field error={createSnapshotErrors.name?.message}>
              <FieldLabel htmlFor="snapshotName">Snapshot Identifier</FieldLabel>
              <Input
                id="snapshotName"
                placeholder="pre-migration-checkpoint"
                {...registerCreateSnapshot("name")}
              />
              <FieldError />
            </Field>

            <div className="space-y-1.5">
              <Label>Snapshot Type</Label>
              <Select
                value={snapshotType}
                onValueChange={(val: "manual" | "daily" | "pitr_point") => setSnapshotType(val)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Checkpoint</SelectItem>
                  <SelectItem value="daily">Daily Scheduled</SelectItem>
                  <SelectItem value="pitr_point">Point-in-Time Milestone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={isCreating}>
                Create Snapshot
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* RECOVERY CONFIRMATION DIALOG */}
      <Dialog open={showRestoreModal} onOpenChange={setShowRestoreModal}>
        {selectedSnapshot && (
          <DialogContent className="sm:max-w-md border-destructive/40">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Confirm Full Database Recovery
              </DialogTitle>
              <DialogDescription>
                Full recovery initiates a branch or roll-forward to the snapshot point. This is a destructive operation.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleRestoreSubmit(handleRestore)} noValidate className="space-y-3 pt-2">
              <div className="p-2.5 rounded bg-sidebar border border-border space-y-1 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Snapshot:</span>
                  <span className="text-foreground font-semibold">{selectedSnapshot.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recovery Timestamp:</span>
                  <span className="text-primary">
                    {formatDate(selectedSnapshot.recoveryPoint)}
                  </span>
                </div>
              </div>

              <Field error={restoreErrors.confirmationPhrase?.message}>
                <FieldLabel htmlFor="confirmationPhrase" className="text-destructive font-medium">
                  Type &quot;RESTORE_SNAPSHOT&quot; to authorize this recovery
                </FieldLabel>
                <Input
                  id="confirmationPhrase"
                  placeholder="RESTORE_SNAPSHOT"
                  {...registerRestore("confirmationPhrase")}
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
                  variant="destructive"
                  isLoading={isRestoring}
                >
                  Authorize Full Recovery
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
