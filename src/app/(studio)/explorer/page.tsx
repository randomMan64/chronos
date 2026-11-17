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
        if (data.tables?.length > 0 && !selectedTable) {
          setSelectedTable(data.tables[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch schema metadata:", err);
    } finally {
      setIsLoadingTables(false);
    }
  }, [selectedDbId, selectedSchema, selectedTable]);

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
        setTotalRows(data.totalEstimated || 0);
      }
    } catch (err) {
      console.error("Failed to fetch rows:", err);
    } finally {
      setIsLoadingRows(false);
    }
  }, [selectedDbId, selectedTable, selectedSchema, limit, offset]);

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
    <div className="flex flex-col justify-between h-full overflow-hidden">
      <div>
        {/* Database Selector Header */}
        <div className="p-2.5 border-b border-border space-y-1.5">
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
        <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between text-xs gap-2">
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
        <div className="p-2 border-b border-border">
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
        <div className="overflow-y-auto max-h-[calc(100vh-280px)] p-1.5 space-y-0.5">
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
      </div>

      {/* Refresh button footer */}
      <div className="p-2 border-t border-border bg-sidebar/50 flex justify-between items-center text-xs">
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

            {/* View 1: Data Grid */}
            {activeView === "data" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Table Data View */}
                <div className="flex-1 overflow-auto">
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
                  <div className="h-44 border-t border-border bg-sidebar/70 p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b border-border pb-1.5">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">
                          Record Inspector
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/temporal?table=${selectedTable.tableName}&recordId=${selectedRow.id || ""}`}
                          className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" /> Time Travel Record
                        </Link>
                        <button
                          onClick={() => setSelectedRow(null)}
                          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <pre className="flex-1 overflow-auto text-[11px] font-mono text-foreground bg-panel p-2 rounded border border-border mt-2">
                      {JSON.stringify(selectedRow, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* View 2: Schema & Columns Structure */}
            {activeView === "structure" && (
              <div className="flex-1 overflow-auto p-3">
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
              <div className="flex-1 overflow-auto p-3 space-y-2">
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
    </div>
  );
}
