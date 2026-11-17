"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

const registerDbSchema = z.object({
  name: z.string().min(1, "Database identifier is required"),
  connectionString: z.string().min(1, "PostgreSQL connection URI is required"),
});
type RegisterDbFormValues = z.infer<typeof registerDbSchema>;
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
import { DismissibleAlert, AlertMessage } from "@/components/shared/dismissible-alert";
import {
  Database,
  Table as TableIcon,
  Columns,
  Key,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUpDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  FileCode,
  X,
  Menu,
  Edit3,
  Trash2,
  Save,
  Lock,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

interface RegisteredDb {
  id: string;
  name: string;
  host: string;
  databaseName: string;
  environment: string;
  status: string;
}

interface TableColumn {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
  isPrimaryKey: boolean;
}

interface TableInfo {
  tableName: string;
  schemaName: string;
  estimatedRowCount: number;
  columns: TableColumn[];
  indexes: { indexName: string; indexDef: string; isUnique: boolean }[];
}

export default function ExplorerPage() {
  // Database & Schema state
  const [databases, setDatabases] = React.useState<RegisteredDb[]>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("");
  const [schemas, setSchemas] = React.useState<string[]>(["public"]);
  const [selectedSchema, setSelectedSchema] = React.useState<string>("public");
  const [tables, setTables] = React.useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = React.useState<TableInfo | null>(
    null,
  );
  const [isLoadingTables, setIsLoadingTables] = React.useState<boolean>(true);

  // Search & Filter
  const [tableSearch, setTableSearch] = React.useState("");
  const [isNavDrawerOpen, setIsNavDrawerOpen] = React.useState(false);

  // Data Grid state
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = React.useState<string[]>([]);
  const [limit, setLimit] = React.useState<number>(50);
  const [offset, setOffset] = React.useState<number>(0);
  const [totalRows, setTotalRows] = React.useState<number>(0);
  const [isLoadingRows, setIsLoadingRows] = React.useState<boolean>(false);
  const [selectedRow, setSelectedRow] = React.useState<Record<
    string,
    unknown
  > | null>(null);

  // Permissions State for active table
  const [tablePermissions, setTablePermissions] = React.useState<{
    canSelect: boolean;
    canInsert: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  }>({ canSelect: true, canInsert: false, canUpdate: false, canDelete: false });

  // Record Editing State
  const [isEditingRecord, setIsEditingRecord] = React.useState<boolean>(false);
  const [editedValues, setEditedValues] = React.useState<Record<string, any>>({});
  const [editErrors, setEditErrors] = React.useState<Record<string, string>>({});
  const [isSavingRecord, setIsSavingRecord] = React.useState<boolean>(false);
  const [showSaveConfirm, setShowSaveConfirm] = React.useState<boolean>(false);
  const [concurrencyConflict, setConcurrencyConflict] = React.useState<{
    message: string;
    liveRecord?: Record<string, any>;
  } | null>(null);

  // Record Insertion State
  const [showAddModal, setShowAddModal] = React.useState<boolean>(false);
  const [newRecordValues, setNewRecordValues] = React.useState<Record<string, any>>({});
  const [newRecordErrors, setNewRecordErrors] = React.useState<Record<string, string>>({});
  const [isInsertingRecord, setIsInsertingRecord] = React.useState<boolean>(false);

  // Record Deletion State
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState<boolean>(false);
  const [isDeletingRecord, setIsDeletingRecord] = React.useState<boolean>(false);

  // Notification State
  const [notification, setNotification] = React.useState<AlertMessage | null>(null);

  // Active view tab: "data" | "structure" | "indexes"
  const [activeView, setActiveView] = React.useState<
    "data" | "structure" | "indexes"
  >("data");

  // Registration Modal state
  const [showRegisterModal, setShowRegisterModal] = React.useState(false);
  const [newDbEnv, setNewDbEnv] = React.useState<
    "development" | "staging" | "production"
  >("development");
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [registerError, setRegisterError] = React.useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = React.useState<string>("");
  const [activeWsId, setActiveWsId] = React.useState<string>("");

  const {
    register: registerDbForm,
    handleSubmit: handleDbSubmit,
    watch: watchDbForm,
    reset: resetDbForm,
    formState: { errors: dbErrors },
  } = useForm<RegisterDbFormValues>({
    resolver: zodResolver(registerDbSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { name: "", connectionString: "" },
  });

  const watchedConn = watchDbForm("connectionString");

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

            const dbRes = await fetch(
              `/api/v1/databases?organizationId=${org.id}`,
            );
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
        console.error("Failed to load initial context:", err);
      }
    }
    init();
  }, []);

  // 2. Fetch Schemas & Tables when Database changes
  const loadTables = React.useCallback(async () => {
    if (!selectedDbId) return;
    setIsLoadingTables(true);
    try {
      const res = await fetch(
        `/api/v1/databases/${selectedDbId}/schema?schema=${selectedSchema}`,
      );
      if (res.ok) {
        const data = await res.json();
        setSchemas(data.schemas || ["public"]);
        setTables(data.tables || []);
        if (data.tables?.length > 0) {
          setSelectedTable((prev) => {
            if (!prev) return data.tables[0];
            const exists = data.tables.find(
              (t: TableInfo) => t.tableName === prev.tableName,
            );
            return exists || data.tables[0];
          });
        } else {
          setSelectedTable(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch schema metadata:", err);
    } finally {
      setIsLoadingTables(false);
    }
  }, [selectedDbId, selectedSchema]);

  React.useEffect(() => {
    loadTables();
  }, [loadTables]);

  // 3. Fetch Rows when Selected Table or Pagination changes
  const loadRows = React.useCallback(async () => {
    if (!selectedDbId || !selectedTable) return;
    setIsLoadingRows(true);
    try {
      const res = await fetch(
        `/api/v1/databases/${selectedDbId}/tables/${selectedTable.tableName}/rows?schema=${selectedSchema}&limit=${limit}&offset=${offset}`,
      );
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows || []);
        setColumns(data.columns || []);
        setTotalRows(data.rowCount ?? data.totalEstimated ?? 0);
        if (data.permissions) {
          setTablePermissions(data.permissions);
        }
      }
    } catch (err) {
      console.error("Failed to fetch rows:", err);
    } finally {
      setIsLoadingRows(false);
    }
  }, [selectedDbId, selectedTable, selectedSchema, limit, offset]);

  // Reset editing states whenever table or row selection changes
  React.useEffect(() => {
    setIsEditingRecord(false);
    setConcurrencyConflict(null);
    setEditErrors({});
  }, [selectedTable?.tableName, selectedRow?.id]);

  // Record Data Types & Helpers
  const isNumericType = (type: string) =>
    ["int", "integer", "smallint", "bigint", "numeric", "decimal", "real", "double precision", "float"].some(
      (t) => type.toLowerCase().includes(t)
    );
  const isBooleanType = (type: string) => type.toLowerCase().includes("bool");
  const isJsonType = (type: string) => type.toLowerCase().includes("json");
  const isDateTimeType = (type: string) =>
    type.toLowerCase().includes("date") || type.toLowerCase().includes("time");

  // Editing Handlers
  const startEdit = () => {
    if (!selectedRow || !tablePermissions.canUpdate) return;
    setIsEditingRecord(true);
    setConcurrencyConflict(null);
    setEditErrors({});
    const initial: Record<string, any> = {};
    if (selectedTable?.columns) {
      for (const col of selectedTable.columns) {
        initial[col.columnName] = selectedRow[col.columnName];
      }
    } else {
      Object.assign(initial, selectedRow);
    }
    setEditedValues(initial);
  };

  const cancelEdit = () => {
    setIsEditingRecord(false);
    setConcurrencyConflict(null);
    setEditErrors({});
  };

  const handleValidateAndConfirmSave = () => {
    const errors: Record<string, string> = {};
    if (!selectedTable) return;

    for (const col of selectedTable.columns) {
      const val = editedValues[col.columnName];
      if (val === null && !col.isNullable && !col.isPrimaryKey) {
        errors[col.columnName] = "Column does not allow NULL values";
      }
      if (isJsonType(col.dataType) && val !== null && typeof val === "string") {
        try {
          JSON.parse(val);
        } catch {
          errors[col.columnName] = "Invalid JSON syntax";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }
    setEditErrors({});
    setShowSaveConfirm(true);
  };

  const executeSaveRecord = async () => {
    if (!selectedDbId || !selectedTable || !selectedRow) return;
    setIsSavingRecord(true);
    try {
      const pkCols = selectedTable.columns.filter((c) => c.isPrimaryKey);
      const pk: Record<string, any> = {};
      if (pkCols.length > 0) {
        for (const c of pkCols) {
          pk[c.columnName] = selectedRow[c.columnName];
        }
      } else if (selectedRow.id !== undefined) {
        pk.id = selectedRow.id;
      } else {
        throw new Error("Unable to identify unique primary key for this record.");
      }

      // Compute changes only for modified columns
      const changes: Record<string, any> = {};
      for (const col of selectedTable.columns) {
        if (col.isPrimaryKey) continue;
        const oldVal = selectedRow[col.columnName];
        let newVal = editedValues[col.columnName];
        if (isJsonType(col.dataType) && typeof newVal === "string") {
          try {
            newVal = JSON.parse(newVal);
          } catch {}
        }
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes[col.columnName] = newVal;
        }
      }

      if (Object.keys(changes).length === 0) {
        setNotification({
          type: "info",
          text: "No changes detected. No field values were modified.",
        });
        setShowSaveConfirm(false);
        setIsEditingRecord(false);
        return;
      }

      const res = await fetch(
        `/api/v1/databases/${selectedDbId}/tables/${selectedTable.tableName}/rows`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: selectedSchema,
            primaryKey: pk,
            changes,
            originalRow: selectedRow,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setConcurrencyConflict({
            message: data.error || "Concurrent edit detected. The record was modified by another session.",
            liveRecord: data.currentRecord,
          });
          setShowSaveConfirm(false);
          return;
        }
        throw new Error(data.error || "Failed to update record");
      }

      setShowSaveConfirm(false);
      setIsEditingRecord(false);
      setNotification({
        type: "success",
        text: `Successfully updated ${data.changedColumns?.length || 1} column(s). Changes recorded in Time Travel history.`,
      });
      setSelectedRow(data.record);
      await loadRows();
    } catch (err: any) {
      setNotification({
        type: "error",
        text: err.message || "Failed to update record",
      });
    } finally {
      setIsSavingRecord(false);
    }
  };

  const reloadLatestConflictRecord = () => {
    if (concurrencyConflict?.liveRecord) {
      setSelectedRow(concurrencyConflict.liveRecord);
      setEditedValues({ ...concurrencyConflict.liveRecord });
    }
    setConcurrencyConflict(null);
    loadRows();
  };

  // Insertion Handlers
  const initNewRecord = () => {
    if (!selectedTable) return;
    const initial: Record<string, any> = {};
    for (const col of selectedTable.columns) {
      if (col.isPrimaryKey && col.columnDefault?.includes("nextval")) {
        continue;
      }
      initial[col.columnName] = "";
    }
    setNewRecordValues(initial);
    setNewRecordErrors({});
  };

  const executeInsertRecord = async () => {
    if (!selectedDbId || !selectedTable) return;
    setIsInsertingRecord(true);
    try {
      const errors: Record<string, string> = {};
      for (const col of selectedTable.columns) {
        const val = newRecordValues[col.columnName];
        if (val === undefined || val === "") {
          if (!col.isNullable && !col.columnDefault && !col.isPrimaryKey) {
            errors[col.columnName] = "Field is required (NOT NULL)";
          }
        }
        if (isJsonType(col.dataType) && val && typeof val === "string") {
          try {
            JSON.parse(val);
          } catch {
            errors[col.columnName] = "Invalid JSON syntax";
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        setNewRecordErrors(errors);
        setIsInsertingRecord(false);
        return;
      }

      const dataPayload: Record<string, any> = {};
      for (const [k, v] of Object.entries(newRecordValues)) {
        if (v === "" || v === undefined) continue;
        const col = selectedTable.columns.find((c) => c.columnName === k);
        if (col && isJsonType(col.dataType) && typeof v === "string") {
          try {
            dataPayload[k] = JSON.parse(v);
          } catch {
            dataPayload[k] = v;
          }
        } else {
          dataPayload[k] = v;
        }
      }

      const res = await fetch(
        `/api/v1/databases/${selectedDbId}/tables/${selectedTable.tableName}/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: selectedSchema,
            data: dataPayload,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to insert record");
      }

      setShowAddModal(false);
      setNewRecordValues({});
      setNotification({
        type: "success",
        text: "New record was inserted and recorded in Time Travel history.",
      });
      await loadRows();
      if (data.record) {
        setSelectedRow(data.record);
      }
    } catch (err: any) {
      setNotification({
        type: "error",
        text: err.message || "Failed to insert record",
      });
    } finally {
      setIsInsertingRecord(false);
    }
  };

  // Deletion Handlers
  const executeDeleteRecord = async () => {
    if (!selectedDbId || !selectedTable || !selectedRow) return;
    setIsDeletingRecord(true);
    try {
      const pkCols = selectedTable.columns.filter((c) => c.isPrimaryKey);
      const pk: Record<string, any> = {};
      if (pkCols.length > 0) {
        for (const c of pkCols) {
          pk[c.columnName] = selectedRow[c.columnName];
        }
      } else if (selectedRow.id !== undefined) {
        pk.id = selectedRow.id;
      } else {
        throw new Error("Unable to identify unique primary key for this record.");
      }

      const res = await fetch(
        `/api/v1/databases/${selectedDbId}/tables/${selectedTable.tableName}/rows`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: selectedSchema,
            primaryKey: pk,
            originalRow: selectedRow,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete record");
      }

      setShowDeleteConfirm(false);
      setSelectedRow(null);
      setNotification({
        type: "success",
        text: "Record has been deleted and archived in Time Travel history.",
      });
      await loadRows();
    } catch (err: any) {
      setNotification({
        type: "error",
        text: err.message || "Failed to delete record",
      });
    } finally {
      setIsDeletingRecord(false);
    }
  };

  // Render Column Input Field for Edit/Add
  const renderColumnEditor = (
    col: TableColumn,
    values: Record<string, any>,
    onChange: (colName: string, val: any) => void,
    errors: Record<string, string>,
    isEdit: boolean = true
  ) => {
    const isImmutable = isEdit && col.isPrimaryKey;
    const val = values[col.columnName];
    const isNull = val === null;
    const err = errors[col.columnName];

    return (
      <div key={col.columnName} className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono font-medium text-foreground flex items-center gap-1.5">
            {isImmutable && <Lock className="h-3 w-3 text-muted-foreground" />}
            {col.columnName}
            {col.isPrimaryKey && (
              <Badge variant="warning" className="text-[9px] py-0 px-1 font-mono">
                PK
              </Badge>
            )}
            {!col.isNullable && !col.isPrimaryKey && (
              <span className="text-destructive font-mono text-[10px]">*</span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground">
              {col.dataType}
            </span>
            {col.isNullable && !isImmutable && (
              <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isNull}
                  onChange={(e) => {
                    onChange(col.columnName, e.target.checked ? null : "");
                  }}
                  className="rounded border-border h-3 w-3 bg-panel"
                />
                NULL
              </label>
            )}
          </div>
        </div>

        {isImmutable ? (
          <Input
            value={val === null ? "NULL" : String(val ?? "")}
            disabled
            className="h-7 text-xs font-mono bg-panel/50 text-muted-foreground cursor-not-allowed"
          />
        ) : isNull ? (
          <div className="h-7 px-2 flex items-center text-xs font-mono text-muted-foreground italic bg-sidebar/50 rounded border border-border/60">
            NULL
          </div>
        ) : isBooleanType(col.dataType) ? (
          <select
            value={val === true ? "true" : val === false ? "false" : ""}
            onChange={(e) =>
              onChange(
                col.columnName,
                e.target.value === "true" ? true : e.target.value === "false" ? false : null
              )
            }
            className="w-full h-7 px-2 rounded border border-border bg-panel text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          >
            <option value="">Select boolean</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : isJsonType(col.dataType) ? (
          <textarea
            value={typeof val === "object" ? JSON.stringify(val, null, 2) : String(val ?? "")}
            onChange={(e) => onChange(col.columnName, e.target.value)}
            rows={3}
            placeholder='{"key": "value"}'
            className={`w-full p-1.5 rounded border ${
              err ? "border-destructive" : "border-border"
            } bg-panel text-xs font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary resize-y`}
          />
        ) : (
          <Input
            type={isNumericType(col.dataType) ? "number" : isDateTimeType(col.dataType) ? "text" : "text"}
            placeholder={
              isDateTimeType(col.dataType)
                ? "YYYY-MM-DDTHH:MM:SSZ"
                : col.columnDefault
                ? `Default: ${col.columnDefault}`
                : undefined
            }
            value={val === null || val === undefined ? "" : String(val)}
            onChange={(e) => {
              const text = e.target.value;
              if (isNumericType(col.dataType)) {
                onChange(col.columnName, text === "" ? null : Number(text));
              } else {
                onChange(col.columnName, text);
              }
            }}
            className={`h-7 text-xs font-mono ${err ? "border-destructive" : ""}`}
          />
        )}

        {err && (
          <div className="text-[10px] text-destructive flex items-center gap-1 font-mono">
            <AlertCircle className="h-2.5 w-2.5" />
            {err}
          </div>
        )}
      </div>
    );
  };

  React.useEffect(() => {
    if (activeView === "data") {
      loadRows();
    }
  }, [activeView, loadRows]);

  // Test Connection Handler
  const handleTestConnection = async () => {
    if (!watchedConn) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/databases/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: watchedConn }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTestResult({
          ok: false,
          error:
            data?.error ||
            data?.message ||
            `HTTP ${res.status}: Failed to test connection`,
        });
        return;
      }
      setTestResult(data || { ok: false, error: "Empty response from server" });
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Register Database Handler
  const handleRegister = async (values: RegisterDbFormValues) => {
    if (!activeOrgId) return;

    setIsRegistering(true);
    setRegisterError(null);
    try {
      const res = await fetch("/api/v1/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrgId,
          workspaceId: activeWsId,
          name: values.name,
          connectionString: values.connectionString,
          environment: newDbEnv,
          isTemporalEnabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      setShowRegisterModal(false);
      resetDbForm();
      setTestResult(null);
      setRegisterError(null);

      // Refresh databases list
      const dbRes = await fetch(
        `/api/v1/databases?organizationId=${activeOrgId}`,
      );
      if (dbRes.ok) {
        const dbData = await dbRes.json();
        setDatabases(dbData.databases || []);
        if (data.database?.id) setSelectedDbId(data.database.id);
      }
    } catch (err: unknown) {
      setRegisterError(
        err instanceof Error ? err.message : "Failed to register database",
      );
    } finally {
      setIsRegistering(false);
    }
  };

  const filteredTables = tables.filter((t) =>
    t.tableName.toLowerCase().includes(tableSearch.toLowerCase()),
  );

  const renderTableNav = (isDrawer: boolean = false) => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Database Selector Header */}
      <div className="p-2.5 border-b border-border space-y-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Target Cluster
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowRegisterModal(true);
                if (isDrawer) setIsNavDrawerOpen(false);
              }}
              className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3 w-3" /> Connect
            </button>
            {isDrawer && (
              <button
                onClick={() => setIsNavDrawerOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-panel cursor-pointer"
                aria-label="Close table browser"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <Select
          value={selectedDbId}
          onValueChange={(val) => {
            setSelectedDbId(val);
            setSelectedTable(null);
            setOffset(0);
          }}
        >
          <SelectTrigger className="h-8 text-xs font-mono w-full">
            <SelectValue placeholder="Select Database" />
          </SelectTrigger>
          <SelectContent>
            {databases.map((db) => (
              <SelectItem
                key={db.id}
                value={db.id}
                className="font-mono text-xs"
              >
                <span className="truncate">{db.name}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5 shrink-0 font-sans">
                  ({db.environment})
                </span>
              </SelectItem>
            ))}
            {databases.length === 0 && (
              <SelectItem value="none" disabled className="text-xs">
                No databases connected
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Schema Selector */}
      <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between text-xs gap-2 shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground uppercase shrink-0">
          Schema:
        </span>
        <Select
          value={selectedSchema}
          onValueChange={(val) => {
            setSelectedSchema(val);
            setSelectedTable(null);
            setOffset(0);
          }}
        >
          <SelectTrigger className="h-6 text-[11px] font-mono w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {schemas.map((s) => (
              <SelectItem key={s} value={s} className="font-mono text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table Search */}
      <div className="p-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2" />
          <Input
            placeholder="Filter tables..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            className="pl-7 h-7 text-[11px]"
          />
        </div>
      </div>

      {/* Table List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 pb-3 space-y-0.5 scrollbar-thin">
        <div className="px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground flex justify-between">
          <span>Tables</span>
          <span>{isLoadingTables ? "..." : filteredTables.length}</span>
        </div>

        {isLoadingTables ? (
          <div className="p-2 space-y-2 animate-pulse">
            <div className="h-6 w-full bg-muted/60 rounded" />
            <div className="h-6 w-full bg-muted/60 rounded" />
            <div className="h-6 w-full bg-muted/60 rounded" />
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground font-mono">
            No tables found
          </div>
        ) : (
          filteredTables.map((t) => {
            const isSelected = selectedTable?.tableName === t.tableName;
            return (
              <button
                key={t.tableName}
                onClick={() => {
                  setSelectedTable(t);
                  setOffset(0);
                  setSelectedRow(null);
                  if (isDrawer) setIsNavDrawerOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-elevated text-foreground font-medium border-l-2 border-primary"
                    : "text-muted-foreground hover:bg-panel hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <TableIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-[11px] truncate">
                    {t.tableName}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  ~{t.estimatedRowCount}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Refresh button footer */}
      <div className="p-2 border-t border-border bg-sidebar/50 flex justify-between items-center text-xs shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground">
          PostgreSQL 14+
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadTables}
          className="h-6 text-[10px]"
        >
          <RefreshCw className="h-2.5 w-2.5 mr-1" /> Refresh
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full gap-3 overflow-hidden">
      {/* Mobile / Tablet Drawer Modal */}
      {isNavDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in-0"
            onClick={() => setIsNavDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 w-75 max-w-[85vw] h-full bg-sidebar border-r border-border flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            {renderTableNav(true)}
          </div>
        </div>
      )}

      {/* DESKTOP LEFT PANEL: Databases, Schemas, and Tables Tree */}
      <div className="hidden lg:flex w-72 xl:w-80 shrink-0 border border-border bg-sidebar rounded-md flex-col justify-between overflow-hidden">
        {renderTableNav(false)}
      </div>

      {/* MAIN PANEL: Table Data, Columns, and Record Inspector */}
      <div className="flex-1 flex flex-col border border-border bg-panel rounded-md overflow-hidden min-w-0">
        {selectedTable ? (
          <>
            {/* Table Header Bar */}
            <div className="min-h-11 border-b border-border px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 bg-sidebar/60 shrink-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsNavDrawerOpen(true)}
                  className="lg:hidden h-7 text-xs font-mono gap-1 px-2 cursor-pointer"
                >
                  <TableIcon className="h-3 w-3 text-primary" /> Tables (
                  {filteredTables.length})
                </Button>
                <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground truncate">
                  <TableIcon className="h-4 w-4 text-primary shrink-0 hidden sm:inline" />
                  <span className="truncate">
                    {selectedSchema}.{selectedTable.tableName}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono shrink-0"
                >
                  ~{selectedTable.estimatedRowCount} rows
                </Badge>
              </div>

              {/* Actions & Sub-view switcher */}
              <div className="flex items-center gap-2">
                {tablePermissions.canInsert && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      initNewRecord();
                      setShowAddModal(true);
                    }}
                    className="h-7 text-xs font-mono gap-1 px-2.5 cursor-pointer border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <Plus className="h-3 w-3" /> Add Record
                  </Button>
                )}

                {/* Sub-view switcher: Data | Structure | Indexes */}
                <div className="flex items-center gap-1 border border-border rounded p-0.5 bg-sidebar shrink-0 overflow-x-auto">
                  <button
                    onClick={() => setActiveView("data")}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      activeView === "data"
                        ? "bg-elevated text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Records ({rows.length})
                  </button>
                  <button
                    onClick={() => setActiveView("structure")}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      activeView === "structure"
                        ? "bg-elevated text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Columns ({selectedTable.columns.length})
                  </button>
                  <button
                    onClick={() => setActiveView("indexes")}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      activeView === "indexes"
                        ? "bg-elevated text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Indexes ({selectedTable.indexes.length})
                  </button>
                </div>
              </div>
            </div>

            {/* View 1: Data Grid */}
            {activeView === "data" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {notification && (
                  <div className="p-2 border-b border-border shrink-0">
                    <DismissibleAlert
                      message={notification}
                      onDismiss={() => setNotification(null)}
                    />
                  </div>
                )}

                {/* Table Data View */}
                <div className="flex-1 overflow-auto scrollbar-thin">
                  {isLoadingRows ? (
                    <div className="p-8 text-center text-xs font-mono text-muted-foreground flex items-center justify-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                      Querying PostgreSQL...
                    </div>
                  ) : rows.length > 0 ? (
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead className="sticky top-0 bg-sidebar border-b border-border text-muted-foreground shadow-xs z-10">
                        <tr>
                          <th className="p-2 border-r border-border w-12 text-center text-[10px] text-muted-foreground">
                            #
                          </th>
                          {columns.map((c) => (
                            <th
                              key={c}
                              className="p-2 border-r border-border text-[11px] font-medium whitespace-nowrap"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{c}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60 text-[11px]">
                        {rows.map((r, idx) => (
                          <tr
                            key={idx}
                            onClick={() => setSelectedRow(r)}
                            className={`hover:bg-elevated/60 cursor-pointer transition-colors ${
                              selectedRow === r
                                ? "bg-elevated text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            <td className="p-2 text-center border-r border-border text-[10px] text-muted-foreground">
                              {offset + idx + 1}
                            </td>
                            {columns.map((c) => (
                              <td
                                key={c}
                                className="p-2 border-r border-border/40 truncate max-w-55"
                              >
                                {r[c] === null ? (
                                  <span className="text-muted-foreground italic">
                                    NULL
                                  </span>
                                ) : typeof r[c] === "object" ? (
                                  JSON.stringify(r[c])
                                ) : (
                                  String(r[c])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyState
                      title="No rows in table"
                      description={`Table "${selectedTable.tableName}" contains no records.`}
                      className="m-8"
                    />
                  )}
                </div>

                {/* Server-Side Pagination Bar */}
                <div className="h-10 border-t border-border px-3.5 flex items-center justify-between bg-sidebar/50 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-mono text-[11px]">
                      Showing {rows.length > 0 ? offset + 1 : 0}–
                      {offset + rows.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0 || isLoadingRows}
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                      className="h-6 px-2 text-[10px]"
                    >
                      <ChevronLeft className="h-3 w-3 mr-0.5" /> Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rows.length < limit || isLoadingRows}
                      onClick={() => setOffset(offset + limit)}
                      className="h-6 px-2 text-[10px]"
                    >
                      Next <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Button>
                  </div>
                </div>

                {/* Bottom Row Inspector if row selected */}
                {selectedRow && (
                  <div
                    className={`${
                      isEditingRecord ? "h-96 max-h-[50vh]" : "h-44"
                    } border-t border-border bg-sidebar/70 p-3 flex flex-col justify-between transition-all duration-150`}
                  >
                    <div className="flex items-center justify-between border-b border-border pb-1.5 shrink-0">
                      <div className="flex items-center gap-2">
                        {isEditingRecord ? (
                          <>
                            <Edit3 className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-semibold text-foreground">
                              Editing Record
                            </span>
                            <Badge variant="outline" className="text-[9px] font-mono">
                              PostgreSQL UPDATE
                            </Badge>
                          </>
                        ) : (
                          <>
                            <FileCode className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-semibold text-foreground">
                              Record Inspector
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditingRecord ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEdit}
                              disabled={isSavingRecord}
                              className="h-6 px-2 text-[10px]"
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleValidateAndConfirmSave}
                              isLoading={isSavingRecord}
                              className="h-6 px-2.5 text-[10px] font-mono"
                            >
                              <Save className="h-2.5 w-2.5 mr-1" /> Save Changes
                            </Button>
                          </>
                        ) : (
                          <>
                            {tablePermissions.canUpdate && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={startEdit}
                                className="h-6 px-2 text-[10px] font-mono"
                              >
                                <Edit3 className="h-2.5 w-2.5 mr-1 text-primary" /> Edit
                              </Button>
                            )}
                            {tablePermissions.canDelete && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="h-6 px-2 text-[10px] font-mono text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-2.5 w-2.5 mr-1" /> Delete
                              </Button>
                            )}
                            <Link
                              href={`/temporal?table=${selectedTable.tableName}&recordId=${selectedRow.id || ""}`}
                              className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1 ml-1"
                            >
                              <Clock className="h-3 w-3" /> Time Travel
                            </Link>
                            <button
                              onClick={() => setSelectedRow(null)}
                              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer ml-1"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Concurrency Conflict Alert */}
                    {concurrencyConflict && (
                      <div className="my-2 p-2 rounded border border-[#FBBF24]/30 bg-[#FBBF24]/10 text-foreground flex items-center justify-between text-xs shrink-0">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-[#FBBF24] shrink-0" />
                          <span className="text-[11px] font-mono">
                            {concurrencyConflict.message}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={reloadLatestConflictRecord}
                          className="h-6 text-[10px] font-mono shrink-0 ml-2"
                        >
                          <RefreshCw className="h-2.5 w-2.5 mr-1" /> Reload Latest Version
                        </Button>
                      </div>
                    )}

                    {isEditingRecord ? (
                      <div className="flex-1 overflow-y-auto mt-2 pr-1 scrollbar-thin">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-1">
                          {selectedTable.columns.map((col) =>
                            renderColumnEditor(
                              col,
                              editedValues,
                              (colName, val) =>
                                setEditedValues((prev) => ({ ...prev, [colName]: val })),
                              editErrors,
                              true
                            )
                          )}
                        </div>
                      </div>
                    ) : (
                      <pre className="flex-1 overflow-auto text-[11px] font-mono text-foreground bg-panel p-2 rounded border border-border mt-2 scrollbar-thin">
                        {JSON.stringify(selectedRow, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* View 2: Schema & Columns Structure */}
            {activeView === "structure" && (
              <div className="flex-1 overflow-auto p-3 scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-2.5 font-medium">Column</th>
                      <th className="p-2.5 font-medium">Data Type</th>
                      <th className="p-2.5 font-medium">Nullable</th>
                      <th className="p-2.5 font-medium">Default</th>
                      <th className="p-2.5 font-medium">Key</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedTable.columns.map((c) => (
                      <tr key={c.columnName} className="hover:bg-elevated/40">
                        <td className="p-2.5 font-semibold text-foreground">
                          {c.columnName}
                        </td>
                        <td className="p-2.5 text-primary">{c.dataType}</td>
                        <td className="p-2.5">
                          {c.isNullable ? (
                            <span className="text-muted-foreground">YES</span>
                          ) : (
                            <span className="text-[#FBBF24]">NO</span>
                          )}
                        </td>
                        <td className="p-2.5 text-muted-foreground truncate max-w-50">
                          {c.columnDefault || "—"}
                        </td>
                        <td className="p-2.5">
                          {c.isPrimaryKey && (
                            <Badge variant="warning" className="text-[9px]">
                              <Key className="h-2.5 w-2.5 mr-1" /> PRIMARY
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* View 3: Indexes */}
            {activeView === "indexes" && (
              <div className="flex-1 overflow-auto p-3 space-y-2 scrollbar-thin">
                {selectedTable.indexes.map((idx) => (
                  <div
                    key={idx.indexName}
                    className="p-3 rounded border border-border bg-sidebar/50 flex flex-col gap-1 text-xs font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {idx.indexName}
                      </span>
                      {idx.isUnique && (
                        <Badge variant="info" className="text-[9px]">
                          UNIQUE
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground break-all">
                      {idx.indexDef}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="m-auto flex flex-col items-center text-center p-6">
            <EmptyState
              icon={<Database className="h-8 w-8 text-primary" />}
              title="Select a table"
              description="Choose a database table to inspect columns, constraints, and live records."
              className="p-5"
            />
            <Button
              size="sm"
              onClick={() => setIsNavDrawerOpen(true)}
              className="lg:hidden mt-4 h-8 text-xs gap-1.5 cursor-pointer font-mono"
            >
              <TableIcon className="h-3.5 w-3.5" /> Browse Tables (
              {filteredTables.length})
            </Button>
          </div>
        )}
      </div>

      {/* SHADCN DIALOG: Register New PostgreSQL Database */}
      <Dialog
        open={showRegisterModal}
        onOpenChange={(open) => {
          setShowRegisterModal(open);
          if (!open) {
            setRegisterError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register PostgreSQL Database</DialogTitle>
            <DialogDescription>
              Credentials are encrypted with AES-256-GCM before storage in the
              control plane
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleDbSubmit(handleRegister)}
            noValidate
            className="space-y-3 pt-2"
          >
            <Field error={dbErrors.name?.message}>
              <FieldLabel htmlFor="dbName">Database Identifier</FieldLabel>
              <Input
                id="dbName"
                placeholder="production-neon-pg"
                {...registerDbForm("name")}
              />
              <FieldError />
            </Field>

            <Field error={dbErrors.connectionString?.message}>
              <FieldLabel htmlFor="dbConn">
                PostgreSQL Connection URI
              </FieldLabel>
              <PasswordInput
                id="dbConn"
                placeholder="postgres://user:pass@ep-name.us-east-2.aws.neon.tech/neondb?sslmode=require"
                {...registerDbForm("connectionString")}
              />
              {!dbErrors.connectionString && (
                <FieldDescription>
                  Contains host, port, user, and password
                </FieldDescription>
              )}
              <FieldError />
            </Field>

            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Select
                value={newDbEnv}
                onValueChange={(
                  val: "development" | "staging" | "production",
                ) => setNewDbEnv(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Test Connection Button & Result */}
            <div className="pt-2 flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                isLoading={isTesting}
                disabled={!watchedConn}
              >
                <Server className="h-3 w-3 mr-1" /> Test Connection
              </Button>

              {testResult && (
                <div
                  className={`rounded border p-2 text-xs flex items-start gap-1.5 ${
                    testResult.ok
                      ? "border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div className="font-semibold">
                      {testResult.ok
                        ? "Connection Successful"
                        : "Connection Failed"}
                    </div>
                    {testResult.ok && (
                      <div className="text-[10px] font-mono mt-0.5">
                        Latency: {testResult.latencyMs} ms
                      </div>
                    )}
                    {!testResult.ok && (
                      <div className="text-[10px] font-mono mt-0.5">
                        {testResult.error}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {registerError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2.5 animate-in fade-in-0">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-xs">Registration Failed</div>
                  <div className="text-[11px] leading-relaxed text-destructive/90">
                    {registerError}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowRegisterModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={isRegistering}>
                Save & Register
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: Save Changes Confirmation */}
      <Dialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-4 w-4 text-primary" /> Confirm Record Update
            </DialogTitle>
            <DialogDescription>
              Review the modified columns before applying the parameterized UPDATE statement to PostgreSQL.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-sidebar border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Column</th>
                    <th className="p-2 font-medium">Original Value</th>
                    <th className="p-2 font-medium text-primary">New Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedTable?.columns
                    .filter((c) => !c.isPrimaryKey)
                    .filter((c) => {
                      const oldVal = selectedRow?.[c.columnName];
                      const newVal = editedValues[c.columnName];
                      return JSON.stringify(oldVal) !== JSON.stringify(newVal);
                    })
                    .map((c) => (
                      <tr key={c.columnName} className="hover:bg-elevated/40">
                        <td className="p-2 font-semibold text-foreground">
                          {c.columnName}
                        </td>
                        <td className="p-2 text-muted-foreground truncate max-w-40">
                          {selectedRow?.[c.columnName] === null
                            ? "NULL"
                            : String(selectedRow?.[c.columnName] ?? "")}
                        </td>
                        <td className="p-2 text-primary font-medium truncate max-w-40">
                          {editedValues[c.columnName] === null
                            ? "NULL"
                            : String(editedValues[c.columnName] ?? "")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-muted-foreground font-mono bg-sidebar/50 p-2.5 rounded border border-border/60 space-y-1">
              <div className="flex items-center gap-1.5 text-foreground font-semibold">
                <Clock className="h-3 w-3 text-primary" /> Time Travel & Audit Active
              </div>
              <p>
                This operation will atomically snapshot the previous version in Chronos Time Travel and record the update in the compliance audit log.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowSaveConfirm(false)}
              disabled={isSavingRecord}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={executeSaveRecord}
              isLoading={isSavingRecord}
            >
              Apply Updates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: Delete Record Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" /> Delete Record
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this row from{" "}
              <span className="font-mono text-foreground font-semibold">
                {selectedTable?.tableName}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="p-3 bg-panel rounded border border-border text-xs font-mono text-muted-foreground overflow-auto max-h-40 scrollbar-thin">
              <pre>{JSON.stringify(selectedRow, null, 2)}</pre>
            </div>

            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                A deletion snapshot will be captured in Chronos Time Travel for recovery and compliance audit purposes.
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeletingRecord}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={executeDeleteRecord}
              isLoading={isDeletingRecord}
            >
              Delete Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: Add New Record */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Add Record to{" "}
              <span className="font-mono">{selectedTable?.tableName}</span>
            </DialogTitle>
            <DialogDescription>
              Enter column values to insert a new row into PostgreSQL.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1 scrollbar-thin">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedTable?.columns.map((col) =>
                renderColumnEditor(
                  col,
                  newRecordValues,
                  (colName, val) =>
                    setNewRecordValues((prev) => ({ ...prev, [colName]: val })),
                  newRecordErrors,
                  false
                )
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAddModal(false)}
              disabled={isInsertingRecord}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={executeInsertRecord}
              isLoading={isInsertingRecord}
            >
              Insert Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
