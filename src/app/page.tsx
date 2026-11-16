import { BrandLogo } from "@/components/shared/brand-logo";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ArrowRight,
  Clock,
  Database,
  GitBranch,
  Lock,
  Shield,
  Terminal,
} from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between selection:bg-primary/20">
      {/* Top Navigation */}
      <header className="h-14 border-b border-border px-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <BrandLogo
            width={40}
            height={40}
            className="h-10 w-10 drop-shadow-xs"
            priority
          />
          <span className="font-mono text-sm font-semibold tracking-wider text-foreground">
            CHRONOS
          </span>
          <Badge variant="outline" className="text-[10px]">
            PostgreSQL Studio
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 px-3.5 py-1.5 rounded-md transition-colors shadow"
          >
            Launch Studio
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-panel text-[11px] font-mono text-muted-foreground mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
          <span>PostgreSQL Temporal Investigation & Control Plane</span>
        </div>

        <div className="flex flex-col items-center mb-6">
          <BrandLogo
            width={112}
            height={112}
            className="h-28 w-28 rounded-2xl drop-shadow-md mb-4"
            priority
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground max-w-3xl leading-tight">
            Database Management with <br />
            <span className="text-primary font-mono">
              Row-Level Time Travel
            </span>
          </h1>
        </div>

        <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
          CHRONOS gives engineering and operations teams deep visibility into
          PostgreSQL databases: granular RBAC, schema exploration, Monaco SQL
          gateway, transaction tracing, and deterministic historical state
          comparison.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-colors shadow"
          >
            Get Started Free <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-panel text-foreground text-xs font-medium hover:bg-elevated transition-colors"
          >
            Access Existing Cluster
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 w-full text-left">
          <div className="rounded-md border border-border bg-panel p-4 flex flex-col justify-between">
            <div>
              <div className="h-7 w-7 rounded bg-elevated border border-border flex items-center justify-center text-primary mb-3">
                <Clock className="h-4 w-4" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                Temporal Row History
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-normal">
                Inspect historical row versions, diff previous values, and
                execute compensating record restoration without erasing audit
                logs.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border text-[10px] font-mono text-muted-foreground">
              AS OF TIMESTAMP • BEFORE / AFTER DIFF
            </div>
          </div>

          <div className="rounded-md border border-border bg-panel p-4 flex flex-col justify-between">
            <div>
              <div className="h-7 w-7 rounded bg-elevated border border-border flex items-center justify-center text-[#34D399] mb-3">
                <Terminal className="h-4 w-4" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                Restricted SQL Gateway
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-normal">
                Execute queries in Monaco Editor with automatic statement
                timeouts, read-only enforcement for analysts, and live EXPLAIN
                analysis.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border text-[10px] font-mono text-muted-foreground">
              STATEMENT_TIMEOUT • EXPLAIN ANALYZE
            </div>
          </div>

          <div className="rounded-md border border-border bg-panel p-4 flex flex-col justify-between">
            <div>
              <div className="h-7 w-7 rounded bg-elevated border border-border flex items-center justify-center text-warning mb-3">
                <Shield className="h-4 w-4" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">
                Six-Tier IAM & Auditing
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-normal">
                Multi-tenant organization isolation, workspace environments
                (dev/stage/prod), append-only audit logs, and granular database
                grants.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border text-[10px] font-mono text-muted-foreground">
              ZERO CLIENT TRUST • APPEND-ONLY AUDIT
            </div>
          </div>
        </div>

        {/* Technical specs strip */}
        <div className="mt-10 rounded border border-border bg-panel/60 px-4 py-3 flex flex-wrap items-center justify-center gap-6 text-[11px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Database className="h-3 w-3 text-primary" /> Neon PostgreSQL
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-[#34D399]" /> AES-256 Encrypted
            Credentials
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-warning" /> Live Transaction
            Tracing
          </span>
          <span className="flex items-center gap-1.5">
            <GitBranch className="h-3 w-3 text-[#60A5FA]" /> Drizzle ORM
            Type-Safety
          </span>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-12 border-t border-border px-6 flex items-center justify-between text-[11px] text-muted-foreground font-mono max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <BrandLogo width={24} height={24} className="h-6 w-6" />
          <span>CHRONOS Database Architecture</span>
        </div>
        <span>PostgreSQL 14+ • Neon Serverless</span>
      </footer>
    </div>
  );
}
