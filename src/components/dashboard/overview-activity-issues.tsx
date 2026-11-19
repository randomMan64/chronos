"use client";

import * as React from "react";
import Link from "next/link";
import { IssueAlert, RecentActivityItem } from "@/modules/overview/overview-service";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  ExternalLink,
  History,
  Activity,
  Terminal,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

/**
 * Issues & Alerts Section
 */
export function OverviewIssuesSection({ issues }: { issues: IssueAlert[] }) {
  const getSeverityBadge = (severity: IssueAlert["severity"]) => {
    switch (severity) {
      case "critical":
        return (
          <Badge variant="outline" className="text-red-400 border-red-800 bg-red-950/30 uppercase text-[10px]">
            <AlertOctagon className="h-3 w-3 mr-1 text-red-400" /> Critical
          </Badge>
        );
      case "high":
        return (
          <Badge variant="outline" className="text-amber-400 border-amber-800 bg-amber-950/30 uppercase text-[10px]">
            <AlertTriangle className="h-3 w-3 mr-1 text-amber-400" /> High
          </Badge>
        );
      case "medium":
        return (
          <Badge variant="outline" className="text-yellow-400 border-yellow-800 bg-yellow-950/30 uppercase text-[10px]">
            <Info className="h-3 w-3 mr-1 text-yellow-400" /> Medium
          </Badge>
        );
      case "low":
      default:
        return (
          <Badge variant="outline" className="text-blue-400 border-blue-800 bg-blue-950/30 uppercase text-[10px]">
            <Info className="h-3 w-3 mr-1 text-blue-400" /> Low
          </Badge>
        );
    }
  };

  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Operational Issues & Alerts
          </CardTitle>
          <CardDescription className="text-xs">
            Detected database anomalies, performance threshold breaches, and configuration warnings
          </CardDescription>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {issues.length} {issues.length === 1 ? "Issue" : "Issues"}
        </Badge>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-900/40 bg-emerald-950/10 text-emerald-400 text-xs font-mono">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>
              All monitored metrics within baseline thresholds. No active query failures, connection exhaustion, or lock contention detected.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/70 bg-card/40 hover:bg-card/70 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getSeverityBadge(issue.severity)}
                    <span className="text-xs font-medium text-foreground">
                      {issue.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {issue.description}
                  </p>
                </div>
                <Link
                  href={issue.modulePath}
                  className="shrink-0 p-1.5 rounded hover:bg-secondary text-primary transition-colors text-xs flex items-center gap-1 font-mono"
                  title="Inspect module"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Recent Activity Table
 */
export function OverviewRecentActivityTable({
  activity,
}: {
  activity: RecentActivityItem[];
}) {
  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" /> Recent Database & SQL Activity
          </CardTitle>
          <CardDescription className="text-xs">
            Latest executions, temporal mutations, and audit records with direct module tracing
          </CardDescription>
        </div>
        <Link
          href="/analytics"
          className="text-xs font-mono text-primary hover:underline inline-flex items-center gap-1"
        >
          View All Telemetry <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr className="border-b border-border bg-sidebar/50 text-muted-foreground text-[11px]">
                <th className="p-3 font-medium">Actor</th>
                <th className="p-3 font-medium">Operation</th>
                <th className="p-3 font-medium">Database</th>
                <th className="p-3 font-medium">Target Table</th>
                <th className="p-3 font-medium">Timestamp</th>
                <th className="p-3 font-medium">Result</th>
                <th className="p-3 font-medium text-right">Module Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {activity.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">
                    No recent database activity logged in the selected window.
                  </td>
                </tr>
              ) : (
                activity.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3 text-foreground font-medium truncate max-w-[140px]">
                      {item.actor}
                    </td>
                    <td className="p-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary border border-border/50 text-foreground font-semibold">
                        {item.operation}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{item.database}</td>
                    <td className="p-3 text-muted-foreground">{item.table}</td>
                    <td className="p-3 text-muted-foreground text-[11px]">
                      {formatDate(item.timestamp)}
                    </td>
                    <td className="p-3">
                      {item.result === "success" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                          <CheckCircle2 className="h-3 w-3" /> Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-400 text-[11px]">
                          <AlertOctagon className="h-3 w-3" /> Error
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={item.linkUrl}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        {item.targetModule === "temporal"
                          ? "Time Travel"
                          : item.targetModule === "transactions"
                          ? "Transaction"
                          : "Analyzer"}{" "}
                        &rarr;
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
