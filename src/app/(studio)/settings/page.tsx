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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inviteSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
});
type InviteFormValues = z.infer<typeof inviteSchema>;

const workspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
});
type WorkspaceFormValues = z.infer<typeof workspaceSchema>;

interface TransferFormValues {
  newOwnerMemberId: string;
  confirmationPhrase: string;
  previousOwnerNewRole?: "admin" | "member";
}

const transferSchema = z.object({
  newOwnerMemberId: z.string().min(1, "Select an eligible member"),
  confirmationPhrase: z.string().refine((val): val is string => val === "TRANSFER_OWNERSHIP", {
    message: 'Type "TRANSFER_OWNERSHIP" to confirm',
  }),
  previousOwnerNewRole: z.enum(["admin", "member"]).default("admin"),
});
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, getInitials } from "@/lib/utils";
import { DismissibleAlert } from "@/components/shared/dismissible-alert";
import {
  Users,
  Shield,
  Layers,
  Mail,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Crown,
  Lock,
  ArrowRightLeft,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<string>("members");

  // Organization & Session state
  const [currentUser, setCurrentUser] = React.useState<{ id: string; email: string; fullName: string } | null>(null);
  const [org, setOrg] = React.useState<{ id: string; name: string; slug: string; role?: string } | null>(null);
  const [members, setMembers] = React.useState<Array<{
    id: string;
    userId: string;
    email: string;
    fullName: string;
    role: string;
    joinedAt: string;
  }>>([]);
  const [invitations, setInvitations] = React.useState<Array<{
    id: string;
    email: string;
    role: string;
    token: string;
    status: string;
    expiresAt: string;
  }>>([]);
  const [workspaces, setWorkspaces] = React.useState<Array<{
    id: string;
    name: string;
    slug: string;
    environment: string;
    createdAt: string;
  }>>([]);

  // Form states
  const [inviteRole, setInviteRole] = React.useState("member");
  const [isInviting, setIsInviting] = React.useState(false);

  const [wsEnv, setWsEnv] = React.useState<"development" | "staging" | "production">("development");
  const [isCreatingWs, setIsCreatingWs] = React.useState(false);

  // Transfer Ownership state
  const [showTransferModal, setShowTransferModal] = React.useState(false);
  const [isTransferring, setIsTransferring] = React.useState(false);

  const {
    register: registerInvite,
    handleSubmit: handleInviteSubmit,
    reset: resetInvite,
    formState: { errors: inviteErrors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "" },
  });

  const {
    register: registerWs,
    handleSubmit: handleWsSubmit,
    reset: resetWs,
    formState: { errors: wsErrors },
  } = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { name: "" },
  });

  const {
    register: registerTransfer,
    handleSubmit: handleTransferSubmit,
    setValue: setTransferValue,
    watch: watchTransfer,
    reset: resetTransfer,
    formState: { errors: transferErrors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      newOwnerMemberId: "",
      confirmationPhrase: "",
      previousOwnerNewRole: "admin",
    },
  });

  const [isLoading, setIsLoading] = React.useState(true);
  const [pendingRoles, setPendingRoles] = React.useState<Record<string, string>>({});
  const [updatingRoleId, setUpdatingRoleId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load active organization data
  const loadData = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const meRes = await fetch("/api/v1/auth/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.user) {
          setCurrentUser(meData.user);
        }
        const activeOrg = meData.organizations?.[0];
        if (activeOrg) {
          setOrg(activeOrg);

          // Fetch members, invitations, and workspaces in parallel
          const [membersRes, invitesRes, wsRes] = await Promise.all([
            fetch(`/api/v1/organizations/${activeOrg.id}/members`),
            fetch(`/api/v1/organizations/${activeOrg.id}/invitations`),
            fetch(`/api/v1/workspaces?organizationId=${activeOrg.id}`),
          ]);

          if (membersRes.ok) {
            const mData = await membersRes.json();
            setMembers(mData.members || []);
          }
          if (invitesRes.ok) {
            const iData = await invitesRes.json();
            setInvitations(iData.invitations || []);
          }
          if (wsRes.ok) {
            const wData = await wsRes.json();
            setWorkspaces(wData.workspaces || []);
          }
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSendInvite = async (values: InviteFormValues) => {
    if (!org) return;
    setIsInviting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/v1/organizations/${org.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invitation");

      setMessage({ type: "success", text: `Invitation sent to ${values.email}` });
      resetInvite();
      loadData();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to invite" });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!org) return;
    try {
      const res = await fetch(`/api/v1/organizations/${org.id}/invitations/${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Invitation revoked" });
        loadData();
      }
    } catch {
      setMessage({ type: "error", text: "Failed to revoke invitation" });
    }
  };

  const handleUpdateMemberRole = async (memberId: string, targetRole?: string) => {
    const roleToApply = targetRole || pendingRoles[memberId];
    if (!org || !roleToApply) return;
    setUpdatingRoleId(memberId);
    try {
      const res = await fetch(`/api/v1/organizations/${org.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleToApply }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: `Member role updated to ${roleToApply}` });
        setPendingRoles((prev) => {
          const next = { ...prev };
          delete next[memberId];
          return next;
        });
        loadData();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to update member role" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update member role" });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!org || !confirm("Are you sure you want to remove this member?")) return;
    try {
      const res = await fetch(`/api/v1/organizations/${org.id}/members/${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Member removed from organization" });
        loadData();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to remove member" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to remove member" });
    }
  };

  const handleTransferOwnership = async (values: TransferFormValues) => {
    if (!org) return;
    setIsTransferring(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/v1/organizations/${org.id}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to transfer ownership");
      }

      setMessage({
        type: "success",
        text: "Organization ownership successfully transferred.",
      });
      setShowTransferModal(false);
      resetTransfer();
      loadData();
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to transfer ownership",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCreateWorkspace = async (values: WorkspaceFormValues) => {
    if (!org) return;
    setIsCreatingWs(true);
    setMessage(null);

    try {
      const res = await fetch("/api/v1/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org.id,
          name: values.name,
          environment: wsEnv,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create workspace");

      setMessage({ type: "success", text: `Workspace '${values.name}' created` });
      resetWs();
      loadData();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to create workspace" });
    } finally {
      setIsCreatingWs(false);
    }
  };

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-foreground">Settings & Access Management</h1>
          <p className="text-xs text-muted-foreground">
            Manage organization members, workspace environments, and granular RBAC policies
          </p>
        </div>
        {org && (
          <Badge variant="outline" className="font-mono text-xs">
            {org.name} ({org.slug})
          </Badge>
        )}
      </div>

      {/* Alert message */}
      <DismissibleAlert
        message={message}
        onDismiss={() => setMessage(null)}
        autoDismissMs={5000}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-panel border border-border p-1 h-auto flex flex-wrap gap-1">
          <TabsTrigger value="members" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>Members ({isLoading ? "..." : members.length})</span>
          </TabsTrigger>
          <TabsTrigger value="invites" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            <span>Invitations ({isLoading ? "..." : invitations.filter((i) => i.status === "pending").length})</span>
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            <span>Workspaces ({isLoading ? "..." : workspaces.length})</span>
          </TabsTrigger>
          <TabsTrigger value="rbac" className="text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span>Roles & Permissions Matrix</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Members */}
        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Organization Members</CardTitle>
              <CardDescription>
                Assign organization-level roles. Changes take effect on subsequent authorization checks.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-3 font-medium">User</th>
                      <th className="p-3 font-medium">Email</th>
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium">Joined</th>
                      <th className="p-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-muted" />
                              <div className="h-4 w-28 bg-muted rounded" />
                            </div>
                          </td>
                          <td className="p-3"><div className="h-4 w-36 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-6 w-24 bg-muted rounded" /></td>
                          <td className="p-3"><div className="h-4 w-20 bg-muted rounded" /></td>
                          <td className="p-3 text-right"><div className="h-6 w-8 bg-muted rounded ml-auto" /></td>
                        </tr>
                      ))
                    ) : members.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-xs text-muted-foreground font-mono">
                          No organization members found
                        </td>
                      </tr>
                    ) : (
                      members.map((m) => {
                        const isSelf = currentUser?.id === m.userId;
                        const isOwner = m.role === "owner";
                        const isCurrentOwner = org?.role === "owner";

                        return (
                          <tr key={m.id} className="hover:bg-elevated/40 transition-colors">
                            <td className="p-3 font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-elevated border border-border flex items-center justify-center font-mono text-[9px] font-semibold tracking-tighter">
                                  {getInitials(m.fullName)}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span>{m.fullName}</span>
                                  {isSelf && (
                                    <span className="text-[10px] text-muted-foreground font-mono">(You)</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-muted-foreground">{m.email}</td>
                            <td className="p-3">
                              {/* Requirement 1 & 2: The currently authenticated Organization Owner must not be able to modify their own role. Replace their role dropdown and Apply button with a non-interactive Owner badge or locked role indicator. */}
                              {isSelf && isOwner ? (
                                <div className="flex items-center gap-1.5 py-0.5">
                                  <Badge variant="warning" className="font-mono text-[10px] capitalize flex items-center gap-1">
                                    <Crown className="h-3 w-3 text-warning" /> Owner
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title="Owner role cannot be self-modified directly">
                                    <Lock className="h-3 w-3" /> Locked
                                  </span>
                                </div>
                              ) : isCurrentOwner && !isOwner ? (
                                /* Requirement 5: Allow Owners to manage the roles of other members */
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={pendingRoles[m.id] ?? m.role}
                                    onValueChange={(val) =>
                                      setPendingRoles((prev) => ({ ...prev, [m.id]: val }))
                                    }
                                  >
                                    <SelectTrigger className="h-7 w-28 text-xs font-mono">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin" className="text-xs font-mono">Admin</SelectItem>
                                      <SelectItem value="member" className="text-xs font-mono">Member</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    variant={pendingRoles[m.id] && pendingRoles[m.id] !== m.role ? "default" : "outline"}
                                    disabled={!pendingRoles[m.id] || pendingRoles[m.id] === m.role || updatingRoleId === m.id}
                                    isLoading={updatingRoleId === m.id}
                                    onClick={() => handleUpdateMemberRole(m.id)}
                                    className="h-7 px-2.5 text-[11px] font-mono cursor-pointer"
                                  >
                                    Apply
                                  </Button>
                                </div>
                              ) : (
                                <Badge
                                  variant={m.role === "owner" ? "warning" : m.role === "admin" ? "info" : "outline"}
                                  className="font-mono text-[10px] capitalize"
                                >
                                  {m.role === "owner" && <Crown className="h-3 w-3 mr-1 inline text-warning" />}
                                  {m.role}
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground font-mono text-[11px]">
                              {formatDate(m.joinedAt)}
                            </td>
                            <td className="p-3 text-right">
                              {/* Requirement 6 & 7: Transfer Ownership workflow trigger for Owner */}
                              {isSelf && isOwner ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const otherMembers = members.filter((other) => other.userId !== currentUser?.id);
                                    if (otherMembers.length > 0) {
                                      setTransferValue("newOwnerMemberId", otherMembers[0].id);
                                    }
                                    setShowTransferModal(true);
                                  }}
                                  className="h-7 px-2.5 text-xs font-medium gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 hover:border-amber-500/50 rounded-md transition-all shadow-2xs cursor-pointer font-sans"
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                  <span>Transfer Ownership</span>
                                </Button>
                              ) : !isSelf && isCurrentOwner && !isOwner ? (
                                /* Requirement 3: Hide self-removal */
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveMember(m.id)}
                                  className="text-destructive hover:text-destructive/80 h-7 w-7"
                                  title="Remove member"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Invitations */}
        <TabsContent value="invites" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Invite New Member</CardTitle>
              <CardDescription>
                Send an invitation token allowing a teammate to join this organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteSubmit(handleSendInvite)} noValidate className="flex flex-col sm:flex-row items-start gap-2.5">
                <Field error={inviteErrors.email?.message} className="relative flex-1 w-full space-y-1">
                  <div className="relative w-full">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="inviteEmail"
                      type="email"
                      placeholder="Colleague email (e.g. name@company.com)"
                      className="pl-9 h-9 text-xs w-full bg-input"
                      {...registerInvite("email")}
                    />
                  </div>
                  <FieldError />
                </Field>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="h-9 w-full sm:w-40 text-xs shrink-0 font-sans">
                    <span className="text-xs truncate leading-none">
                      <span className="text-muted-foreground">Role:</span>{" "}
                      <span className="capitalize font-medium text-foreground">{inviteRole}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member" className="text-xs font-mono">Member</SelectItem>
                    <SelectItem value="admin" className="text-xs font-mono">Admin</SelectItem>
                    <SelectItem value="owner" className="text-xs font-mono">Owner</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="submit"
                  isLoading={isInviting}
                  className="h-9 px-4 text-xs font-medium shrink-0 w-full sm:w-auto cursor-pointer"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Send Invite
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Invitations</CardTitle>
              <CardDescription>Invitations valid for 7 days from generation</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                    <th className="p-3 font-medium">Invited Email</th>
                    <th className="p-3 font-medium">Role</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Expires</th>
                    <th className="p-3 font-medium text-right">Invite Link / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="p-3"><div className="h-4 w-36 bg-muted rounded" /></td>
                        <td className="p-3"><div className="h-5 w-16 bg-muted rounded" /></td>
                        <td className="p-3"><div className="h-5 w-16 bg-muted rounded" /></td>
                        <td className="p-3"><div className="h-4 w-24 bg-muted rounded" /></td>
                        <td className="p-3 text-right"><div className="h-4 w-20 bg-muted rounded ml-auto" /></td>
                      </tr>
                    ))
                  ) : invitations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground font-mono text-xs">
                        No pending invitations
                      </td>
                    </tr>
                  ) : (
                    invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-elevated/40">
                        <td className="p-3 font-mono text-foreground">{inv.email}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="capitalize">
                            {inv.role}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              inv.status === "accepted"
                                ? "success"
                                : inv.status === "pending"
                                ? "warning"
                                : "destructive"
                            }
                            className="capitalize"
                          >
                            {inv.status}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-muted-foreground">
                          {formatDate(inv.expiresAt)}
                        </td>
                        <td className="p-3 text-right">
                          {inv.status === "pending" && (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const url = `${window.location.origin}/invite/${inv.token}`;
                                  navigator.clipboard.writeText(url);
                                  setMessage({ type: "success", text: "Invitation link copied to clipboard!" });
                                }}
                                className="text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                                title="Copy invite URL"
                              >
                                <Copy className="h-3 w-3" /> Copy Link
                              </button>
                              <button
                                onClick={() => handleRevokeInvite(inv.id)}
                                className="text-destructive hover:underline cursor-pointer ml-2"
                              >
                                Revoke
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Workspaces */}
        <TabsContent value="workspaces" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create New Workspace</CardTitle>
              <CardDescription>
                Isolate database connections into development, staging, or production boundaries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleWsSubmit(handleCreateWorkspace)} noValidate className="flex flex-col sm:flex-row items-start gap-2.5">
                <Field error={wsErrors.name?.message} className="relative flex-1 w-full space-y-1">
                  <div className="relative w-full">
                    <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="wsName"
                      type="text"
                      placeholder="Workspace Name (e.g. Analytics Staging)"
                      className="pl-9 h-9 text-xs w-full bg-input"
                      {...registerWs("name")}
                    />
                  </div>
                  <FieldError />
                </Field>
                <Select
                  value={wsEnv}
                  onValueChange={(val: "development" | "staging" | "production") => setWsEnv(val)}
                >
                  <SelectTrigger className="h-9 w-full sm:w-44 text-xs shrink-0 font-sans">
                    <span className="text-xs truncate leading-none">
                      <span className="text-muted-foreground">Env:</span>{" "}
                      <span className="capitalize font-medium text-foreground">{wsEnv}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development" className="text-xs font-mono">Development</SelectItem>
                    <SelectItem value="staging" className="text-xs font-mono">Staging</SelectItem>
                    <SelectItem value="production" className="text-xs font-mono">Production</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="submit"
                  isLoading={isCreatingWs}
                  className="h-9 px-4 text-xs font-medium shrink-0 w-full sm:w-auto cursor-pointer"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Workspace
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Existing Workspaces</CardTitle>
              <CardDescription>Registered workspaces under this organization</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Slug</th>
                    <th className="p-3 font-medium">Environment</th>
                    <th className="p-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="p-3"><div className="h-4 w-32 bg-muted rounded" /></td>
                        <td className="p-3"><div className="h-4 w-24 bg-muted rounded" /></td>
                        <td className="p-3"><div className="h-5 w-16 bg-muted rounded" /></td>
                        <td className="p-3"><div className="h-4 w-24 bg-muted rounded" /></td>
                      </tr>
                    ))
                  ) : workspaces.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground font-mono text-xs">
                        No registered workspaces found
                      </td>
                    </tr>
                  ) : (
                    workspaces.map((ws) => (
                      <tr key={ws.id} className="hover:bg-elevated/40">
                        <td className="p-3 font-medium text-foreground">{ws.name}</td>
                        <td className="p-3 font-mono text-muted-foreground">{ws.slug}</td>
                        <td className="p-3">
                          <Badge
                            variant={
                              ws.environment === "production"
                                ? "destructive"
                                : ws.environment === "staging"
                                ? "warning"
                                : "info"
                            }
                            className="capitalize"
                          >
                            {ws.environment}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-muted-foreground">
                          {formatDate(ws.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: RBAC Permissions Matrix */}
        <TabsContent value="rbac" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Role-Based Access Control (RBAC) Matrix</CardTitle>
              <CardDescription>
                Backend-enforced permission mappings for each of the six primary user roles
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-3 font-medium">Capability / Permission</th>
                      <th className="p-3 font-medium text-center">Owner</th>
                      <th className="p-3 font-medium text-center">DBA</th>
                      <th className="p-3 font-medium text-center">Developer</th>
                      <th className="p-3 font-medium text-center text-primary">Data Analyst</th>
                      <th className="p-3 font-medium text-center">DB Engineer</th>
                      <th className="p-3 font-medium text-center">Auditor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[11px]">
                    <tr>
                      <td className="p-2.5 text-foreground">organization:manage</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-foreground">database:manage / register</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-foreground">query:read (SELECT)</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-[#34D399] font-bold">YES</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-foreground">query:write (INSERT, UPDATE, DELETE)</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-destructive font-bold">STRICT NO</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-destructive font-bold">STRICT NO</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-foreground">schema:write (ALTER, CREATE TABLE)</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-destructive">NO</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-destructive">NO</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-foreground">history:restore (Compensating tx)</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-destructive">NO</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-destructive">NO</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-foreground">performance:inspect (EXPLAIN ANALYZE)</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-primary font-bold">YES</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 text-foreground">audit:read (Append-only logs)</td>
                      <td className="p-2.5 text-center text-[#34D399]">YES</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-muted-foreground">—</td>
                      <td className="p-2.5 text-center text-primary font-bold">YES</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* SHADCN DIALOG: Transfer Ownership */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-md border-border/80 shadow-lg">
          <DialogHeader className="space-y-1.5 pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Crown className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Transfer Organization Ownership
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Transfer primary ownership of <span className="font-medium text-foreground">&quot;{org?.name}&quot;</span> to another active member. You will relinquish Owner authority.
            </DialogDescription>
          </DialogHeader>

          {members.filter((m) => m.userId !== currentUser?.id).length === 0 ? (
            <div className="py-6 px-4 flex flex-col items-center text-center rounded-lg border border-border/70 bg-muted/30 my-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-3 ring-8 ring-amber-500/5">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">
                No Eligible Members Found
              </h4>
              <p className="text-xs text-muted-foreground max-w-[300px] mt-1.5 leading-relaxed">
                You must have at least one other active member in this organization before transferring ownership. Invite a teammate first.
              </p>
              <div className="flex items-center gap-2.5 mt-5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTransferModal(false)}
                  className="h-8 px-3.5 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setShowTransferModal(false);
                    setActiveTab("invites");
                  }}
                  className="h-8 px-3.5 text-xs gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Mail className="h-3.5 w-3.5" /> Go to Invitations
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleTransferSubmit(handleTransferOwnership)} noValidate className="space-y-4 pt-1">
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/25 bg-amber-500/5 text-xs text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-semibold text-foreground">Warning: </span>
                  <span className="text-muted-foreground text-[11px]">
                    This action permanently transfers primary organization ownership and administrative root privileges.
                  </span>
                </div>
              </div>

              <Field error={transferErrors.newOwnerMemberId?.message}>
                <FieldLabel htmlFor="newOwnerMemberId">Select New Owner</FieldLabel>
                <Select
                  value={watchTransfer("newOwnerMemberId")}
                  onValueChange={(val) => setTransferValue("newOwnerMemberId", val, { shouldValidate: true })}
                >
                  <SelectTrigger id="newOwnerMemberId" className="h-9 text-xs font-sans">
                    <SelectValue placeholder="Choose an active member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {members
                      .filter((m) => m.userId !== currentUser?.id)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          <span className="font-medium text-foreground">{m.fullName}</span>{" "}
                          <span className="text-muted-foreground font-mono">({m.email})</span>{" "}
                          <Badge variant="outline" className="ml-1.5 font-mono text-[9px] uppercase">
                            {m.role}
                          </Badge>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FieldError />
              </Field>

              <div className="space-y-1.5">
                <Label htmlFor="previousOwnerNewRole">Your New Role After Transfer</Label>
                <Select
                  value={watchTransfer("previousOwnerNewRole")}
                  onValueChange={(val: "admin" | "member") =>
                    setTransferValue("previousOwnerNewRole", val, { shouldValidate: true })
                  }
                >
                  <SelectTrigger id="previousOwnerNewRole" className="h-9 text-xs font-sans">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin" className="text-xs">
                      Admin (Recommended - Retains workspace & member management)
                    </SelectItem>
                    <SelectItem value="member" className="text-xs">
                      Member (Standard query & exploration access)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Field error={transferErrors.confirmationPhrase?.message}>
                <FieldLabel htmlFor="transferConfirmation" className="text-destructive font-medium">
                  Type &quot;TRANSFER_OWNERSHIP&quot; to authorize
                </FieldLabel>
                <Input
                  id="transferConfirmation"
                  placeholder="TRANSFER_OWNERSHIP"
                  className="h-9 font-mono text-xs tracking-wider"
                  {...registerTransfer("confirmationPhrase")}
                />
                <FieldError />
              </Field>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTransferModal(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  isLoading={isTransferring}
                  className="h-8 text-xs gap-1.5 cursor-pointer"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" /> Authorize Transfer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
