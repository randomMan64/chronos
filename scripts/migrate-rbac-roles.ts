import fs from "fs";
import path from "path";

// Auto-load .env.local or .env
const envLocal = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocal) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(envLocal);
} else {
  const envDefault = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envDefault) && typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(envDefault);
  }
}

import { db } from "../src/db/connections/control-plane";
import { organizationMembers, workspaceMembers, invitations, users } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { ChronosRole, normalizeRole, isChronosRole } from "../src/lib/permissions/roles";

interface MigrationDecision {
  recordType: "organization_member" | "workspace_member" | "invitation";
  id: string;
  userOrEmail: string;
  currentRole: string;
  targetRole: ChronosRole;
  rationale: string;
}

async function runMigration() {
  console.log("===============================================================");
  console.log("  CHRONOS — RBAC Authoritative Role Migration Script           ");
  console.log("===============================================================");

  const isDryRun = process.argv.includes("--dry-run");
  console.log(`Execution Mode: ${isDryRun ? "DRY RUN (no changes applied)" : "LIVE EXECUTION"}`);

  // 1. Audit Organization Members
  const orgMems = await db
    .select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      userEmail: users.email,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId));

  // 2. Audit Workspace Members
  const wsMems = await db
    .select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      userEmail: users.email,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId));

  // 3. Audit Invitations
  const invites = await db.select().from(invitations);

  const decisions: MigrationDecision[] = [];

  // Evaluate Organization Members
  for (const om of orgMems) {
    if (!isChronosRole(om.role)) {
      // Find corresponding workspace membership for context
      const matchingWs = wsMems.find((wm) => wm.userId === om.userId);
      let targetRole: ChronosRole = "developer";
      let rationale = "Standard fallback to developer";

      if (om.role === "admin") {
        targetRole = "dba";
        rationale = "Legacy admin mapped to DBA database administrator";
      } else if (om.role === "member") {
        if (matchingWs?.role === "dba") {
          targetRole = "dba";
          rationale = "User active as DBA in workspace, aligning organization role with operational DBA status";
        } else {
          targetRole = "developer";
          rationale = "Legacy member mapped to standard Developer";
        }
      }

      decisions.push({
        recordType: "organization_member",
        id: om.id,
        userOrEmail: om.userEmail || om.userId,
        currentRole: om.role,
        targetRole,
        rationale,
      });
    }
  }

  // Evaluate Workspace Members
  for (const wm of wsMems) {
    if (!isChronosRole(wm.role)) {
      const canonical = normalizeRole(wm.role);
      decisions.push({
        recordType: "workspace_member",
        id: wm.id,
        userOrEmail: wm.userEmail || wm.userId,
        currentRole: wm.role,
        targetRole: canonical,
        rationale: `Normalized workspace role variant '${wm.role}' to canonical '${canonical}'`,
      });
    }
  }

  // Evaluate Invitations
  for (const inv of invites) {
    if (!isChronosRole(inv.role)) {
      let canonical = normalizeRole(inv.role);
      // If user was already accepted and promoted, align invitation record with their effective role
      const matchingOrgMem = orgMems.find((om) => om.userEmail === inv.email);
      if (matchingOrgMem && matchingOrgMem.role === "dba") {
        canonical = "dba";
      }

      decisions.push({
        recordType: "invitation",
        id: inv.id,
        userOrEmail: inv.email,
        currentRole: inv.role,
        targetRole: canonical,
        rationale: `Migrated legacy invitation role '${inv.role}' to canonical '${canonical}' (Status: ${inv.status})`,
      });
    }
  }

  console.log(`\nIdentified ${decisions.length} records requiring migration:\n`);
  for (const d of decisions) {
    console.log(`- [${d.recordType}] ${d.userOrEmail}: '${d.currentRole}' -> '${d.targetRole}' (${d.rationale})`);
  }

  if (decisions.length === 0) {
    console.log("\nAll records already adhere to the authoritative 6-role CHRONOS schema. No action needed.");
    process.exit(0);
  }

  if (isDryRun) {
    console.log("\n[DRY RUN] Completed analysis without modifying the database.");
    process.exit(0);
  }

  // Execute database updates inside transaction
  await db.transaction(async (tx) => {
    for (const d of decisions) {
      if (d.recordType === "organization_member") {
        await tx
          .update(organizationMembers)
          .set({ role: d.targetRole, updatedAt: new Date() })
          .where(eq(organizationMembers.id, d.id));
      } else if (d.recordType === "workspace_member") {
        await tx
          .update(workspaceMembers)
          .set({ role: d.targetRole, updatedAt: new Date() })
          .where(eq(workspaceMembers.id, d.id));
      } else if (d.recordType === "invitation") {
        await tx
          .update(invitations)
          .set({ role: d.targetRole })
          .where(eq(invitations.id, d.id));
      }
    }
  });

  console.log(`\nSuccessfully migrated ${decisions.length} records to authoritative CHRONOS roles.`);
  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
