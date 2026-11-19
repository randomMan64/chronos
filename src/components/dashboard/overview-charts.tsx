"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LatencyDataPoint,
  SlowQueryDataPoint,
  StorageDataPoint,
  VolumeDataPoint,
} from "@/modules/overview/overview-service";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Layers,
  ShieldAlert,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

// Palette: Restrained CHRONOS design
// Primary Blue: #3b82f6 | Success Green: #10b981 | Warning Amber: #f59e0b | Failure Red: #ef4444 | Neutral: #64748b
const CHART_COLORS = {
  blue: "#3b82f6",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  slate: "#64748b",
  purple: "#8b5cf6",
};

/**
 * 1. Query Execution Volume (Area Chart)
 */
const volumeConfig = {
  success: {
    label: "Successful Queries",
    color: CHART_COLORS.green,
  },
  failed: {
    label: "Failed Queries",
    color: CHART_COLORS.red,
  },
} satisfies ChartConfig;

export function QueryVolumeChart({ data }: { data: VolumeDataPoint[] }) {
  const totalVolume = data.reduce((acc, d) => acc + d.total, 0);
  const totalSuccess = data.reduce((acc, d) => acc + d.success, 0);
  const totalFailed = data.reduce((acc, d) => acc + d.failed, 0);

  return (
    <Card className="col-span-1 lg:col-span-2 border-border/80">
      <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold truncate">
            <Activity className="h-4 w-4 text-primary shrink-0" /> Query
            Execution Volume
          </CardTitle>
          <CardDescription className="text-xs truncate">
            Query traffic over time distinguishing successful executions from
            errors
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0 whitespace-nowrap">
          <Badge
            variant="outline"
            className="text-emerald-400 border-emerald-900/50 bg-emerald-950/20 shrink-0"
          >
            {totalSuccess.toLocaleString()} OK
          </Badge>
          {totalFailed > 0 && (
            <Badge
              variant="outline"
              className="text-red-400 border-red-900/50 bg-red-950/20 shrink-0"
            >
              {totalFailed.toLocaleString()} ERR
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {data.length === 0 || totalVolume === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 text-muted-foreground text-xs font-mono">
            <span>No query execution volume recorded in this time range.</span>
            <span className="text-[10px] text-muted-foreground/60 mt-1">
              Execute SQL via SQL Gateway or enable pg_stat_statements
              telemetry.
            </span>
          </div>
        ) : (
          <ChartContainer
            config={volumeConfig}
            className="h-56 w-full aspect-auto"
          >
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="timeLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                type="monotone"
                dataKey="success"
                stackId="1"
                stroke={CHART_COLORS.green}
                fill={CHART_COLORS.green}
                fillOpacity={0.25}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="failed"
                stackId="1"
                stroke={CHART_COLORS.red}
                fill={CHART_COLORS.red}
                fillOpacity={0.4}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 2. Query Latency (Line Chart: Avg, P95, P99)
 */
const latencyConfig = {
  avgMs: {
    label: "Avg Latency (ms)",
    color: CHART_COLORS.blue,
  },
  p95Ms: {
    label: "P95 Latency (ms)",
    color: CHART_COLORS.amber,
  },
  p99Ms: {
    label: "P99 Latency (ms)",
    color: CHART_COLORS.red,
  },
} satisfies ChartConfig;

export function QueryLatencyChart({ data }: { data: LatencyDataPoint[] }) {
  const hasData = data.some((d) => d.avgMs > 0 || d.p95Ms > 0 || d.p99Ms > 0);

  return (
    <Card className="col-span-1 lg:col-span-2 border-border/80">
      <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold truncate">
            <Clock className="h-4 w-4 text-amber-500 shrink-0" /> Query Latency
            Percentiles
          </CardTitle>
          <CardDescription className="text-xs truncate">
            Average, P95, and P99 latency distributions across sampled query
            executions
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-52 text-muted-foreground text-xs font-mono">
            <span>
              No query latency samples recorded in selected time window.
            </span>
          </div>
        ) : (
          <ChartContainer
            config={latencyConfig}
            className="h-56 w-full aspect-auto"
          >
            <LineChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="timeLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
                unit="ms"
              />
              <ChartTooltip
                content={<ChartTooltipContent indicator="line" />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="avgMs"
                stroke={CHART_COLORS.blue}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="p95Ms"
                stroke={CHART_COLORS.amber}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="p99Ms"
                stroke={CHART_COLORS.red}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 3. Transaction Outcomes (Donut Chart)
 */
const txConfig = {
  committed: {
    label: "Committed",
    color: CHART_COLORS.green,
  },
  rolledBack: {
    label: "Rolled Back",
    color: CHART_COLORS.amber,
  },
  failed: {
    label: "Failed / Aborted",
    color: CHART_COLORS.red,
  },
} satisfies ChartConfig;

export function TransactionOutcomesChart({
  data,
}: {
  data: {
    committed: number;
    rolledBack: number;
    failed: number;
    total: number;
  };
}) {
  const chartData = [
    {
      name: "committed",
      label: "Committed",
      value: data.committed,
      fill: CHART_COLORS.green,
    },
    {
      name: "rolledBack",
      label: "Rolled Back",
      value: data.rolledBack,
      fill: CHART_COLORS.amber,
    },
    {
      name: "failed",
      label: "Failed / Aborted",
      value: data.failed,
      fill: CHART_COLORS.red,
    },
  ].filter((d) => d.value > 0);

  const commitRate =
    data.total > 0 ? Math.round((data.committed / data.total) * 100) : 100;

  return (
    <Card className="col-span-1 border-border/80 flex flex-col justify-between">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold truncate min-w-0">
            <Cpu className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Transaction Outcomes</span>
          </CardTitle>
          <Badge
            variant="outline"
            className="font-mono text-[10px] shrink-0 whitespace-nowrap"
          >
            {commitRate}% Commit
          </Badge>
        </div>
        <CardDescription className="text-xs truncate">
          Lifecycle outcomes for tracked transactions
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 flex-1 flex flex-col justify-center">
        {data.total === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs font-mono text-center px-2">
            <Cpu className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <span>No transaction lifecycles logged</span>
            <span className="text-[10px] text-muted-foreground/60 mt-0.5">
              Zero events in selected period
            </span>
          </div>
        ) : (
          <ChartContainer config={txConfig} className="h-48 w-full aspect-auto">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.fill}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent />} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 4. Connection Utilization (Area Chart / Gauge)
 */
const connConfig = {
  active: {
    label: "Active Clients",
    color: CHART_COLORS.blue,
  },
  idle: {
    label: "Idle / Idle in Tx",
    color: CHART_COLORS.slate,
  },
} satisfies ChartConfig;

export function ConnectionUtilizationChart({
  active,
  idle,
  max,
  utilizationPct,
}: {
  active: number;
  idle: number;
  max: number;
  utilizationPct: number;
}) {
  return (
    <Card className="col-span-1 border-border/80 flex flex-col justify-between">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold truncate min-w-0">
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Connection Utilization</span>
          </CardTitle>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] shrink-0 whitespace-nowrap ${
              utilizationPct >= 80
                ? "text-amber-400 border-amber-900"
                : "text-foreground"
            }`}
          >
            {utilizationPct}% Utilized
          </Badge>
        </div>
        <CardDescription className="text-xs truncate">
          Client backends against max_connections ({max})
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 flex-1 flex flex-col justify-center">
        <div className="space-y-3 font-mono py-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Active Sessions:</span>
            <span className="text-primary font-medium">{active}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Idle Connections:</span>
            <span className="text-slate-400">{idle}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">
              Server Max Connections:
            </span>
            <span>{max}</span>
          </div>

          {/* Linear Progress Bar */}
          <div className="w-full bg-secondary/50 rounded-full h-2.5 overflow-hidden flex border border-border/50">
            <div
              className="bg-primary h-full transition-all"
              style={{
                width: `${Math.max(active > 0 ? 1 : 0, Math.min(100, (active / max) * 100))}%`,
              }}
              title={`Active: ${active}`}
            />
            <div
              className="bg-slate-500 h-full transition-all"
              style={{
                width: `${Math.max(idle > 0 ? 1 : 0, Math.min(100, (idle / max) * 100))}%`,
              }}
              title={`Idle: ${idle}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
            <span>0</span>
            <span>50%</span>
            <span>{max} Max</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * 5. Query Type Distribution (Bar Chart)
 */
const queryTypeConfig = {
  count: {
    label: "Statement Count",
    color: CHART_COLORS.blue,
  },
} satisfies ChartConfig;

export function QueryTypeDistributionChart({
  data,
}: {
  data: Array<{ type: string; count: number }>;
}) {
  const total = data.reduce((acc, d) => acc + d.count, 0);

  return (
    <Card className="col-span-1 border-border/80 flex flex-col justify-between">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold truncate min-w-0">
            <BarChart3 className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Query Breakdown</span>
          </CardTitle>
          <Badge
            variant="outline"
            className="font-mono text-[10px] shrink-0 whitespace-nowrap"
          >
            {total} Total
          </Badge>
        </div>
        <CardDescription className="text-xs truncate">
          Distribution of executed SQL commands
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 flex-1 flex flex-col justify-center">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs font-mono text-center px-2">
            <BarChart3 className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <span>No query operations captured</span>
            <span className="text-[10px] text-muted-foreground/60 mt-0.5">
              Zero queries in selected period
            </span>
          </div>
        ) : (
          <ChartContainer
            config={queryTypeConfig}
            className="h-48 w-full aspect-auto"
          >
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="type"
                tickLine={false}
                axisLine={false}
                fontSize={10}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={10} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill={CHART_COLORS.blue}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 6. Slow Query Trends (Line Chart with Threshold)
 */
const slowQueryConfig = {
  slowCount: {
    label: "Slow Queries (>=200ms)",
    color: CHART_COLORS.amber,
  },
} satisfies ChartConfig;

export function SlowQueryTrendChart({ data }: { data: SlowQueryDataPoint[] }) {
  const totalSlow = data.reduce((acc, d) => acc + d.slowCount, 0);

  return (
    <Card className="col-span-1 border-border/80 flex flex-col justify-between">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold truncate min-w-0">
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="truncate">Slow Query Trends</span>
          </CardTitle>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] shrink-0 whitespace-nowrap ${
              totalSlow > 0
                ? "text-amber-400 border-amber-900"
                : "text-emerald-400 border-emerald-900"
            }`}
          >
            {totalSlow} Slow
          </Badge>
        </div>
        <CardDescription className="text-xs truncate">
          Queries exceeding 200ms latency threshold
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 flex-1 flex flex-col justify-center">
        {totalSlow === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-xs font-mono text-center px-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-400/80 mb-2" />
            <span className="text-emerald-400 font-medium">
              Zero Slow Queries
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              All queries executed &lt; 200ms threshold
            </span>
          </div>
        ) : (
          <ChartContainer
            config={slowQueryConfig}
            className="h-48 w-full aspect-auto"
          >
            <LineChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="timeLabel"
                tickLine={false}
                axisLine={false}
                fontSize={10}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={10} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Line
                type="stepAfter"
                dataKey="slowCount"
                stroke={CHART_COLORS.amber}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS.amber }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 7. Database Storage Growth (Area Chart)
 */
const storageConfig = {
  sizeBytes: {
    label: "Storage Size",
    color: CHART_COLORS.purple,
  },
} satisfies ChartConfig;

export function DatabaseStorageChart({
  storage,
}: {
  storage: {
    isHistoricalAvailable: boolean;
    data: StorageDataPoint[];
    currentFormatted: string;
    note?: string;
  };
}) {
  return (
    <Card className="col-span-1 border-border/80 flex flex-col justify-between">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold truncate min-w-0">
            <HardDrive className="h-4 w-4 text-purple-400 shrink-0" />
            <span className="truncate">Database Storage</span>
          </CardTitle>
          <Badge
            variant="outline"
            className="font-mono text-[10px] shrink-0 whitespace-nowrap text-purple-400 border-purple-900/60"
          >
            {storage.currentFormatted}
          </Badge>
        </div>
        <CardDescription className="text-xs truncate">
          Physical disk space occupied via pg_database_size
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 flex-1 flex flex-col justify-center">
        {storage.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs font-mono">
            <span>Storage metrics unavailable</span>
          </div>
        ) : (
          <div className="space-y-2">
            <ChartContainer
              config={storageConfig}
              className="h-40 w-full aspect-auto"
            >
              <AreaChart
                data={storage.data}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  tickFormatter={(val) => {
                    if (val >= 1073741824)
                      return `${(val / 1073741824).toFixed(1)}GB`;
                    if (val >= 1048576)
                      return `${(val / 1048576).toFixed(0)}MB`;
                    return `${(val / 1024).toFixed(0)}KB`;
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(val, name, item) => (
                        <span className="font-mono">
                          {item.payload.sizeFormatted}
                        </span>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="sizeBytes"
                  stroke={CHART_COLORS.purple}
                  fill={CHART_COLORS.purple}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
            {storage.note && (
              <p className="text-[10px] text-muted-foreground/70 font-mono italic">
                * {storage.note}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 8. Database Resource Summary & Relation Breakdown
 */
export function DatabaseResourceSummaryCard({
  resource,
}: {
  resource: {
    cacheHitRatio: number | null;
    activeConnections: number;
    maxConnections: number;
    connectionUtilizationPct: number;
    databaseSizeFormatted: string;
    topRelations: Array<{ name: string; sizeFormatted: string; bytes: number }>;
    pgStatStatementsActive: boolean;
  };
}) {
  return (
    <Card className="col-span-1 border-border/80 flex flex-col justify-between">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <CardTitle className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold truncate min-w-0">
            <Database className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Resource & Table Distribution</span>
          </CardTitle>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] shrink-0 whitespace-nowrap ${
              resource.cacheHitRatio !== null && resource.cacheHitRatio >= 99
                ? "text-emerald-400 border-emerald-900"
                : "text-foreground"
            }`}
          >
            {resource.cacheHitRatio !== null
              ? `${resource.cacheHitRatio}% Cache`
              : "Cache: N/A"}
          </Badge>
        </div>
        <CardDescription className="text-xs truncate">
          Buffer cache efficiency and largest physical tables
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 flex-1 flex flex-col justify-center">
        <div className="space-y-3 font-mono text-xs">
          {/* Top relations */}
          <div>
            <span className="text-muted-foreground text-[11px] block mb-1 font-sans">
              Top Relations (pg_total_relation_size):
            </span>
            {resource.topRelations.length === 0 ? (
              <div className="text-muted-foreground text-[11px] italic py-2">
                No user relation statistics available.
              </div>
            ) : (
              <div className="space-y-1.5">
                {resource.topRelations.map((rel) => (
                  <div
                    key={rel.name}
                    className="flex justify-between items-center text-xs"
                  >
                    <span className="truncate max-w-45 text-foreground">
                      {rel.name}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      {rel.sizeFormatted}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border/50 flex justify-between items-center text-[11px]">
            <span className="text-muted-foreground">pg_stat_statements:</span>
            <span
              className={
                resource.pgStatStatementsActive
                  ? "text-emerald-400 font-medium"
                  : "text-amber-400 font-medium"
              }
            >
              {resource.pgStatStatementsActive ? "ACTIVE" : "NOT INSTALLED"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
