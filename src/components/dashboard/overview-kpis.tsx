"use client";

import * as React from "react";
import { MetricComparison } from "@/modules/overview/overview-service";
import {
  Activity,
  Clock,
  Gauge,
  AlertOctagon,
  Users,
  Cpu,
  ShieldAlert,
  HardDrive,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  comparison: MetricComparison;
  icon: React.ReactNode;
  unit?: string;
  subValue?: string;
  lowerIsBetter?: boolean;
}

function CompactKpiCard({
  label,
  value,
  comparison,
  icon,
  unit,
  subValue,
  lowerIsBetter = false,
}: KpiCardProps) {
  const { changePct, previous } = comparison;

  // Determine trend color semantics
  let trendColor = "text-muted-foreground";
  let TrendIcon = Minus;

  if (changePct !== null && changePct !== 0) {
    if (changePct > 0) {
      TrendIcon = TrendingUp;
      trendColor = lowerIsBetter ? "text-red-400" : "text-emerald-400";
    } else {
      TrendIcon = TrendingDown;
      trendColor = lowerIsBetter ? "text-emerald-400" : "text-muted-foreground";
    }
  }

  return (
    <div className="rounded-lg border border-border/80 bg-card/60 p-3 flex flex-col justify-between hover:border-border transition-colors">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80 truncate">{label}</span>
        <div className="p-1 rounded bg-secondary/60 text-foreground/70 shrink-0">
          {icon}
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-1.5 font-mono">
        <span className="text-xl font-bold tracking-tight text-foreground">
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono border-t border-border/40 pt-1.5">
        {changePct !== null ? (
          <div className={`flex items-center gap-1 ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            <span>
              {changePct > 0 ? `+${changePct}%` : `${changePct}%`}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground/70">
            {previous !== null ? "0% change" : "No prior baseline"}
          </span>
        )}

        {subValue ? (
          <span className="text-muted-foreground text-[10px] truncate max-w-[120px]">
            {subValue}
          </span>
        ) : previous !== null ? (
          <span className="text-muted-foreground/60 text-[10px]">
            prev: {previous}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function OverviewKpiGrid({
  kpis,
}: {
  kpis: {
    totalQueries: MetricComparison;
    avgLatency: MetricComparison;
    p95Latency: MetricComparison;
    failedQueries: MetricComparison;
    activeConnections: MetricComparison;
    activeTransactions: MetricComparison;
    slowQueries: MetricComparison;
    databaseSize: MetricComparison & { sizeFormatted: string };
  };
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
      {/* 1. Total Queries */}
      <CompactKpiCard
        label="Total Queries"
        value={kpis.totalQueries.current.toLocaleString()}
        comparison={kpis.totalQueries}
        icon={<Activity className="h-3.5 w-3.5 text-primary" />}
      />

      {/* 2. Avg Latency */}
      <CompactKpiCard
        label="Avg Latency"
        value={kpis.avgLatency.current}
        unit="ms"
        comparison={kpis.avgLatency}
        icon={<Clock className="h-3.5 w-3.5 text-blue-400" />}
        lowerIsBetter
      />

      {/* 3. P95 Latency */}
      <CompactKpiCard
        label="P95 Latency"
        value={kpis.p95Latency.current}
        unit="ms"
        comparison={kpis.p95Latency}
        icon={<Gauge className="h-3.5 w-3.5 text-amber-400" />}
        lowerIsBetter
      />

      {/* 4. Failed Queries */}
      <CompactKpiCard
        label="Failed Queries"
        value={kpis.failedQueries.current}
        comparison={kpis.failedQueries}
        icon={<AlertOctagon className="h-3.5 w-3.5 text-red-400" />}
        lowerIsBetter
      />

      {/* 5. Active Connections */}
      <CompactKpiCard
        label="Active Conns"
        value={kpis.activeConnections.current}
        comparison={kpis.activeConnections}
        icon={<Users className="h-3.5 w-3.5 text-primary" />}
        subValue="Live client pool"
      />

      {/* 6. Active Transactions */}
      <CompactKpiCard
        label="Active Tx"
        value={kpis.activeTransactions.current}
        comparison={kpis.activeTransactions}
        icon={<Cpu className="h-3.5 w-3.5 text-purple-400" />}
        subValue="In-flight"
      />

      {/* 7. Slow Queries */}
      <CompactKpiCard
        label="Slow Queries"
        value={kpis.slowQueries.current}
        comparison={kpis.slowQueries}
        icon={<ShieldAlert className="h-3.5 w-3.5 text-amber-500" />}
        subValue=">= 200ms"
        lowerIsBetter
      />

      {/* 8. Database Size */}
      <CompactKpiCard
        label="Database Size"
        value={kpis.databaseSize.sizeFormatted}
        comparison={kpis.databaseSize}
        icon={<HardDrive className="h-3.5 w-3.5 text-purple-400" />}
        subValue="pg_database_size"
      />
    </div>
  );
}
