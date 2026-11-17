"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { useTheme } from "@/components/shared/theme-provider";
import {
  Play,
  RotateCcw,
  Download,
  Copy,
  Clock,
  Bookmark,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Database,
  FileCode,
  Terminal,
} from "lucide-react";
import { formatDuration, formatDate } from "@/lib/utils";

// Lazy load Monaco Editor to optimize bundle size
const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sidebar text-xs font-mono text-muted-foreground">
      Initializing Monaco SQL Engine...
    </div>
  ),
});

export default function SqlEditorPage() {
  const { resolvedTheme } = useTheme();
  const [databases, setDatabases] = React.useState<Array<{ id: string; name: string; environment: string }>>([]);
  const [selectedDbId, setSelectedDbId] = React.useState<string>("");
  const [activeOrgId, setActiveOrgId] = React.useState<string>("");
  const [activeWsId, setActiveWsId] = React.useState<string>("");

  // Editor state
  const [sql, setSql] = React.useState<string>(
    `-- CHRONOS SQL Gateway\n-- Press Ctrl+Enter (or Cmd+Enter) to execute\nSELECT \n  table_schema,\n  table_name,\n  table_type\nFROM information_schema.tables\nWHERE table_schema = 'public'\nLIMIT 50;`
  );
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [isExplaining, setIsExplaining] = React.useState(false);

  // Result state
  const [results, setResults] = React.useState<{
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    durationMs: number;
    command: string;
  } | null>(null);

  const [explainPlan, setExplainPlan] = React.useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // History & Saved state
  const [activeTab, setActiveTab] = React.useState<"results" | "explain" | "history" | "saved">("results");
  const [mobileView, setMobileView] = React.useState<"editor" | "results">("editor");
  const [history, setHistory] = React.useState<Array<{
    id: string;
    queryText: string;
    durationMs: number;
    rowCount: number;
    status: string;
    errorMessage?: string;
    executedAt: string;
  }>>([]);

  const [savedQueries, setSavedQueries] = React.useState<Array<{
    id: string;
    title: string;
    queryText: string;
    description?: string;
  }>>([]);

  // Monaco SQL Editor user preferences
  const [editorSettings, setEditorSettings] = React.useState({
    fontSize: 13,
    wordWrap: true,
    lineNumbers: true,
    minimap: false,
  });

  React.useEffect(() => {
    async function loadEditorPreferences() {
      try {
        const res = await fetch("/api/v1/account/preferences");
        if (res.ok) {
          const json = await res.json();
          const pref = json.preferences || json;
          setEditorSettings({
            fontSize: pref.sqlFontSize ?? 13,
            wordWrap: pref.editorWordWrap ?? true,
            lineNumbers: pref.editorLineNumbers ?? true,
            minimap: pref.editorMinimap ?? false,
          });
        }
      } catch {
        // Fallback to defaults
      }
    }
    loadEditorPreferences();
  }, []);

  // 1. Initial Load: Fetch User Session & Databases
  React.useEffect(() => {
    async function loadSession() {
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
              const dbs = await dbRes.json();
              setDatabases(dbs.databases || []);
              if (dbs.databases?.length > 0) {
                setSelectedDbId(dbs.databases[0].id);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load session:", err);
      }
    }
    loadSession();
  }, []);

  // 2. Fetch History when database changes
  const loadHistory = React.useCallback(async () => {
    if (!selectedDbId) return;
    try {
      const res = await fetch(`/api/v1/sql/history?databaseId=${selectedDbId}`);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        setHistory(data?.history || []);
      }
    } catch {
      // ignore
    }
  }, [selectedDbId]);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Execute Query
  const handleExecute = async () => {
    if (!selectedDbId || !sql.trim() || isExecuting) return;
    setIsExecuting(true);
    setError(null);
    setResults(null);
    setExplainPlan(null);

    try {
      const res = await fetch("/api/v1/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: selectedDbId,
          workspaceId: activeWsId || undefined,
          organizationId: activeOrgId || undefined,
          sql,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Execution failed (HTTP ${res.status})`);
      }
      if (!data) {
        throw new Error("Invalid response received from server");
      }

      setResults({
        columns: data.columns || [],
        rows: data.rows || [],
        rowCount: data.rowCount ?? 0,
        durationMs: data.durationMs ?? 0,
        command: data.command || "SELECT",
      });
      setActiveTab("results");
      setMobileView("results");
      loadHistory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Execution failed");
      setActiveTab("results");
      setMobileView("results");
    } finally {
      setIsExecuting(false);
    }
  };

  // Run EXPLAIN ANALYZE
  const handleExplain = async (analyze: boolean = false) => {
    if (!selectedDbId || !sql.trim() || isExplaining) return;
    setIsExplaining(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/sql/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: selectedDbId,
          workspaceId: activeWsId || undefined,
          organizationId: activeOrgId || undefined,
          sql,
          analyze,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Explain failed (HTTP ${res.status})`);
      }
      if (!data) {
        throw new Error("Invalid response received from server");
      }

      const plan = data.plan ?? data.rows?.[0]?.["QUERY PLAN"] ?? data.rows ?? [];
      setExplainPlan(Array.isArray(plan) ? plan : [plan]);
      setActiveTab("explain");
      setMobileView("results");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Explain failed");
      setActiveTab("explain");
      setMobileView("results");
    } finally {
      setIsExplaining(false);
    }
  };

  // Export Results as CSV
  const handleExportCsv = () => {
    if (!results || results.rows.length === 0) return;
    const headers = results.columns.join(",");
    const rows = results.rows.map((r) =>
      results.columns
        .map((c) => {
          const val = r[c];
          if (val === null || val === undefined) return "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `chronos_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter
  const handleExecuteRef = React.useRef(handleExecute);
  React.useEffect(() => {
    handleExecuteRef.current = handleExecute;
  }, [handleExecute]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleExecuteRef.current?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <div className="flex h-full w-full flex-col gap-2 overflow-hidden">
      {/* Top Action Ribbon */}
      <div className="flex flex-wrap items-center justify-between border border-border bg-panel px-3 py-2 rounded-md shrink-0 gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Target Cluster selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <Database className="h-3.5 w-3.5 text-primary shrink-0" />
            <Select value={selectedDbId} onValueChange={setSelectedDbId}>
              <SelectTrigger className="h-7 text-xs font-mono w-44 sm:w-60">
                <SelectValue placeholder="Select Database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id} className="text-xs font-mono">
                    <span className="truncate">{db.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5 shrink-0 font-sans">
                      ({db.environment})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleExecute}
              isLoading={isExecuting}
              disabled={!selectedDbId}
              className="h-7 text-xs font-semibold"
            >
              <Play className="h-3 w-3 mr-1 fill-current" /> Run (Ctrl+↵)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExplain(false)}
              isLoading={isExplaining}
              disabled={!selectedDbId}
              className="h-7 text-xs font-mono"
            >
              <Layers className="h-3 w-3 mr-1" /> EXPLAIN
            </Button>
          </div>
        </div>

        {/* Right metrics / duration */}
        <div className="flex items-center gap-2">
          {results && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary" />
                {formatDuration(results.durationMs)}
              </span>
              <span>•</span>
              <span>{results.rowCount} rows</span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Dedicated View Selector (Tabs) */}
      <div className="flex md:hidden border border-border bg-sidebar/80 p-1 rounded-md gap-1 text-xs shrink-0">
        <button
          type="button"
          onClick={() => setMobileView("editor")}
          className={`flex-1 py-1.5 px-3 rounded font-medium transition-colors text-center cursor-pointer ${
            mobileView === "editor"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          SQL Editor
        </button>
        <button
          type="button"
          onClick={() => setMobileView("results")}
          className={`flex-1 py-1.5 px-3 rounded font-medium transition-colors text-center cursor-pointer ${
            mobileView === "results"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Results {results ? `(${results.rowCount})` : ""}
        </button>
      </div>

      {/* Editor & Output Splitter */}
      <div className="flex-1 flex flex-col min-h-0 border border-border bg-panel rounded-md overflow-hidden">
        {/* UPPER HALF: Monaco Code Editor */}
        <div
          className={
            mobileView === "editor"
              ? "flex-1 flex flex-col overflow-hidden bg-sidebar md:flex-none md:h-[45%] md:border-b md:border-border"
              : "hidden md:flex md:h-[45%] md:border-b md:border-border flex-col overflow-hidden bg-sidebar"
          }
        >
          <div className="h-7 border-b border-border px-3 flex items-center justify-between text-[11px] font-mono text-muted-foreground bg-sidebar/50 shrink-0">
            <span>SQL QUERY EDITOR</span>
            <span>POSTGRESQL DIALECT</span>
          </div>
          <div className="flex-1 w-full overflow-hidden">
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
              value={sql}
              onChange={(val) => setSql(val || "")}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                  handleExecuteRef.current?.();
                });
              }}
              options={{
                minimap: { enabled: editorSettings.minimap },
                fontSize: editorSettings.fontSize,
                fontFamily: "'JetBrains Mono', monospace",
                lineNumbers: editorSettings.lineNumbers ? "on" : "off",
                wordWrap: editorSettings.wordWrap ? "on" : "off",
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 8, bottom: 8 },
                renderLineHighlight: "all",
              }}
            />
          </div>
        </div>

        {/* LOWER HALF: Results, EXPLAIN, History Tabs */}
        <div
          className={
            mobileView === "results"
              ? "flex-1 flex flex-col overflow-hidden bg-panel"
              : "hidden md:flex md:flex-1 flex-col overflow-hidden bg-panel"
          }
        >
          {/* Tabs bar */}
          <div className="h-9 border-b border-border px-2 sm:px-3 flex items-center justify-between bg-sidebar/60 shrink-0 text-xs overflow-x-auto">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setActiveTab("results")}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === "results"
                    ? "bg-elevated text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Results Grid {results && `(${results.rows.length})`}
              </button>
              <button
                onClick={() => setActiveTab("explain")}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === "explain"
                    ? "bg-elevated text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Execution Plan
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                  activeTab === "history"
                    ? "bg-elevated text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Query History
              </button>
            </div>

            {activeTab === "results" && results && results.rows.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="h-6 px-2 text-[10px] font-mono"
                >
                  <Download className="h-3 w-3 mr-1" /> Export CSV
                </Button>
              </div>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            {error && (
              <div className="m-3 rounded border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-mono flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Query Execution Error</div>
                  <div className="mt-1 whitespace-pre-wrap">{error}</div>
                </div>
              </div>
            )}

            {/* View 1: Results Grid */}
            {activeTab === "results" && !error && (
              results && results.rows.length > 0 ? (
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="sticky top-0 bg-sidebar border-b border-border text-muted-foreground shadow-xs z-10">
                    <tr>
                      <th className="p-2 border-r border-border w-12 text-center text-[10px] text-muted-foreground">
                        #
                      </th>
                      {results.columns.map((c) => (
                        <th
                          key={c}
                          className="p-2 border-r border-border text-[11px] font-medium whitespace-nowrap"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-[11px]">
                    {results.rows.map((r, idx) => (
                      <tr key={idx} className="hover:bg-elevated/60 transition-colors">
                        <td className="p-2 text-center border-r border-border text-[10px] text-muted-foreground">
                          {idx + 1}
                        </td>
                        {results.columns.map((c) => (
                          <td
                            key={c}
                            className="p-2 border-r border-border/40 truncate max-w-[260px] text-foreground"
                          >
                            {r[c] === null ? (
                              <span className="text-muted-foreground italic">NULL</span>
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
              ) : !results && !error ? (
                <div className="flex h-full items-center justify-center p-8 text-center text-xs font-mono text-muted-foreground">
                  Press &quot;Run Query&quot; or Ctrl+Enter to execute SQL against the selected database.
                </div>
              ) : (
                <div className="p-8 text-center text-xs font-mono text-muted-foreground">
                  Statement completed. Zero rows returned.
                </div>
              )
            )}

            {/* View 2: EXPLAIN output */}
            {activeTab === "explain" && (
              <div className="p-3">
                {explainPlan ? (
                  <pre className="p-3 rounded border border-border bg-sidebar text-[11px] font-mono text-primary overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(explainPlan, null, 2)}
                  </pre>
                ) : (
                  <div className="p-8 text-center text-xs font-mono text-muted-foreground">
                    Click &quot;EXPLAIN&quot; to inspect PostgreSQL query optimizer tree and cost estimates.
                  </div>
                )}
              </div>
            )}

            {/* View 3: Query History */}
            {activeTab === "history" && (
              <div className="p-0">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-2.5 font-medium">Status</th>
                      <th className="p-2.5 font-medium">Statement</th>
                      <th className="p-2.5 font-medium">Duration</th>
                      <th className="p-2.5 font-medium">Rows</th>
                      <th className="p-2.5 font-medium">Executed</th>
                      <th className="p-2.5 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((h) => (
                      <tr key={h.id} className="hover:bg-elevated/40">
                        <td className="p-2.5">
                          <StatusIndicator
                            status={h.status === "success" ? "success" : "failed"}
                            label={h.status}
                          />
                        </td>
                        <td className="p-2.5 text-foreground truncate max-w-[300px]">
                          {h.queryText}
                        </td>
                        <td className="p-2.5 text-muted-foreground">{formatDuration(h.durationMs)}</td>
                        <td className="p-2.5 text-muted-foreground">{h.rowCount}</td>
                        <td className="p-2.5 text-muted-foreground text-[11px]">
                          {formatDate(h.executedAt)}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            onClick={() => {
                              setSql(h.queryText);
                              setActiveTab("results");
                            }}
                            className="text-primary hover:underline cursor-pointer text-[11px]"
                          >
                            Use Query
                          </button>
                        </td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">
                          No query execution history found for this database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
