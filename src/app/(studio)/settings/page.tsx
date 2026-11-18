"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hasPermission } from "@/lib/permissions/resolver";

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
  previousOwnerNewRole?: string;
}

const transferSchema = z.object({
  newOwnerMemberId: z.string().min(1, "Select an eligible member"),
  confirmationPhrase: z
    .string()
    .refine((val): val is string => val === "TRANSFER_OWNERSHIP", {
      message: 'Type "TRANSFER_OWNERSHIP" to confirm',
    }),
  previousOwnerNewRole: z.string().default("dba"),
});
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, getInitials, cn } from "@/lib/utils";
import { DismissibleAlert } from "@/components/shared/dismissible-alert";
import {
  CHRONOS_ROLES,
  CHRONOS_ROLE_KEYS,
  ChronosRole,
  ROLE_HIERARCHY,
  canAssignRole,
  getAssignableRoles,
  normalizeRole,
} from "@/lib/permissions/roles";
import { getPermissionsMatrix } from "@/lib/permissions/resolver";
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
  ShieldAlert,
  UserPlus,
} from "lucide-react";

/**
 * Sorts members so that the active user's account appears first ("(You)"),
 * followed by descending role hierarchy (Owner -> DBA -> Database Engineer -> Developer -> Data Analyst -> Auditor),
 * and alphabetically by full name or email as a tie-breaker.
 */
function sortMembersByCurrentUserAndRole<
  T extends {
    userId: string;
    role: string;
    fullName?: string | null;
    email?: string | null;
  },
>(
  list: T[],
  currentUserId?: string | null,
  currentUserEmail?: string | null,
): T[] {
  return [...list].sort((a, b) => {
    const aIsSelf =
      (!!currentUserId && a.userId === currentUserId) ||
      (!!currentUserEmail &&
        !!a.email &&
        currentUserEmail.toLowerCase() === a.email.toLowerCase());
    const bIsSelf =
      (!!currentUserId && b.userId === currentUserId) ||
      (!!currentUserEmail &&
        !!b.email &&
        currentUserEmail.toLowerCase() === b.email.toLowerCase());

    if (aIsSelf && !bIsSelf) return -1;
    if (!aIsSelf && bIsSelf) return 1;

    const aRank = ROLE_HIERARCHY[normalizeRole(a.role)] ?? 0;
    const bRank = ROLE_HIERARCHY[normalizeRole(b.role)] ?? 0;

    if (bRank !== aRank) {
      return bRank - aRank; // Highest role hierarchy first
    }

    const nameA = (a.fullName || a.email || "").toLowerCase();
    const nameB = (b.fullName || b.email || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<string>("workspaces");

  // Organization & Session state
  const [currentUser, setCurrentUser] = React.useState<{
    id: string;
    email: string;
    fullName: string;
  } | null>(null);
  const [org, setOrg] = React.useState<{
    id: string;
    name: string;
    slug: string;
    role?: string;
  } | null>(null);
  const [permissions, setPermissions] = React.useState<string[]>([]);

  // Permission-derived capabilities
  const isOwner = org?.role === "owner";
  const canInviteMembers = hasPermission(permissions, "members:invite");
  const canManageMembers = hasPermission(permissions, "members:manage");
  const canCreateWorkspace = hasPermission(permissions, "workspace:create");
  const canManageWorkspaces = isOwner || hasPermission(permissions, "workspace:manage");
  const canAssignWorkspaceMembers =
    isOwner ||
    hasPermission(permissions, "workspace:members:assign") ||
    hasPermission(permissions, "workspace:manage");
  const canRevokeWorkspaceMembers =
    isOwner ||
    hasPermission(permissions, "workspace:members:revoke") ||
    hasPermission(permissions, "workspace:manage");
  const canDeleteWorkspace =
    isOwner ||
    hasPermission(permissions, "workspace:delete") ||
    hasPermission(permissions, "workspace:manage");
  const canTransferOwnership =
    org?.role === "owner" &&
    (hasPermission(permissions, "permissions:manage") ||
      hasPermission(permissions, "organization:manage"));
  const canViewInvites = canInviteMembers || canManageMembers;
  const [members, setMembers] = React.useState<
    Array<{
      id: string;
      userId: string;
      email: string;
      fullName: string;
      role: string;
      joinedAt: string;
    }>
  >([]);
  const [invitations, setInvitations] = React.useState<
    Array<{
      id: string;
      email: string;
      role: string;
      token: string;
      status: string;
      expiresAt: string;
    }>
  >([]);
  const [workspaces, setWorkspaces] = React.useState<
    Array<{
      id: string;
      name: string;
      slug: string;
      environment: string;
      createdAt: string;
    }>
  >([]);

  // Workspace Access Management state
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string | null>(null);
  const [workspaceMembersMap, setWorkspaceMembersMap] = React.useState<
    Record<
      string,
      Array<{
        id: string;
        userId: string;
        email: string;
        fullName: string;
        role: string;
        assignedBy?: string | null;
        assignedByName?: string | null;
        assignedByEmail?: string | null;
        createdAt: string;
      }>
    >
  >({});
  const [isLoadingWsMembers, setIsLoadingWsMembers] = React.useState(false);

  // Add workspace member modal
  const [showAddWsMemberModal, setShowAddWsMemberModal] = React.useState(false);
  const [addWsMemberUserId, setAddWsMemberUserId] = React.useState("");
  const [addWsMemberRole, setAddWsMemberRole] = React.useState("developer");
  const [isAddingWsMember, setIsAddingWsMember] = React.useState(false);

  // Remove workspace member modal
  const [wsMemberToRemove, setWsMemberToRemove] = React.useState<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    fullName: string;
    email: string;
    role: string;
  } | null>(null);
  const [isRemovingWsMember, setIsRemovingWsMember] = React.useState(false);

  // Delete workspace modal
  const [wsToDelete, setWsToDelete] = React.useState<{
    id: string;
    name: string;
    environment: string;
  } | null>(null);
  const [isDeletingWs, setIsDeletingWs] = React.useState(false);
  const [wsDeleteConfirmName, setWsDeleteConfirmName] = React.useState("");

  // Form states
  const [inviteRole, setInviteRole] = React.useState("developer");
  const [isInviting, setIsInviting] = React.useState(false);

  const [wsEnv, setWsEnv] = React.useState<
    "development" | "staging" | "production"
  >("development");
  const [isCreatingWs, setIsCreatingWs] = React.useState(false);

  // Transfer Ownership state
  const [showTransferModal, setShowTransferModal] = React.useState(false);
  const [isTransferring, setIsTransferring] = React.useState(false);

  // Remove Member confirmation state
  const [memberToRemove, setMemberToRemove] = React.useState<{
    id: string;
    fullName: string;
    email: string;
    role: string;
  } | null>(null);
  const [isRemovingMember, setIsRemovingMember] = React.useState(false);

  // Organization Deletion state
  const [showOrgDeleteModal, setShowOrgDeleteModal] = React.useState(false);
  const [orgDeletionPreview, setOrgDeletionPreview] = React.useState<{
    organizationId: string;
    name: string;
    slug: string;
    memberCount: number;
    workspaceCount: number;
    databaseCount: number;
    pendingInviteCount: number;
    resourcesAffected: string[];
    databaseSafetyNotice: string;
  } | null>(null);
  const [isLoadingOrgPreview, setIsLoadingOrgPreview] = React.useState(false);
  const [orgDeletePassword, setOrgDeletePassword] = React.useState("");
  const [orgDeleteConfirmName, setOrgDeleteConfirmName] = React.useState("");
  const [isDeletingOrg, setIsDeletingOrg] = React.useState(false);
  const [orgDeleteError, setOrgDeleteError] = React.useState<string | null>(null);

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
      previousOwnerNewRole: "dba",
    },
  });

  const currentUserRole = org?.role;
  const assignableMemberRoles = React.useMemo(() => {
    return getAssignableRoles(currentUserRole, { allowOwner: false });
  }, [currentUserRole]);

  const assignableInviteRoles = React.useMemo(() => {
    return getAssignableRoles(currentUserRole, { allowOwner: isOwner });
  }, [currentUserRole, isOwner]);

  const matrixRows = React.useMemo(() => getPermissionsMatrix(), []);

  const sortedMembers = React.useMemo(() => {
    return sortMembersByCurrentUserAndRole(
      members,
      currentUser?.id,
      currentUser?.email
    );
  }, [members, currentUser?.id, currentUser?.email]);

  const sortedWorkspaceMembers = React.useMemo(() => {
    if (!selectedWorkspaceId) return [];
    const list = workspaceMembersMap[selectedWorkspaceId] || [];
    return sortMembersByCurrentUserAndRole(
      list,
      currentUser?.id,
      currentUser?.email
    );
  }, [workspaceMembersMap, selectedWorkspaceId, currentUser?.id, currentUser?.email]);

  const [isLoading, setIsLoading] = React.useState(true);
  const [pendingRoles, setPendingRoles] = React.useState<
    Record<string, string>
  >({});
  const [updatingRoleId, setUpdatingRoleId] = React.useState<string | null>(
    null,
  );
  const [message, setMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchWorkspaceMembers = React.useCallback(async (wsId: string) => {
    setIsLoadingWsMembers(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${wsId}/members`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaceMembersMap((prev) => ({
          ...prev,
          [wsId]: data.members || [],
        }));
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingWsMembers(false);
    }
  }, []);

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
        const effectivePerms: string[] = Array.isArray(meData.permissions)
          ? meData.permissions
          : [];
        setPermissions(effectivePerms);

        const activeOrg = meData.currentOrg || meData.organizations?.[0];
        if (activeOrg) {
          setOrg(activeOrg);

          // Determine permissions for invitations fetch
          const userCanViewInvites =
            hasPermission(effectivePerms, "members:invite") ||
            hasPermission(effectivePerms, "members:manage");

          // Fetch members, invitations (if permitted), and workspaces in parallel
          const [membersRes, invitesRes, wsRes] = await Promise.all([
            fetch(`/api/v1/organizations/${activeOrg.id}/members`),
            userCanViewInvites
              ? fetch(`/api/v1/organizations/${activeOrg.id}/invitations`)
              : Promise.resolve(null),
            fetch(`/api/v1/workspaces?organizationId=${activeOrg.id}`),
          ]);

          if (membersRes.ok) {
            const mData = await membersRes.json();
            setMembers(mData.members || []);
          }
          if (invitesRes && invitesRes.ok) {
            const iData = await invitesRes.json();
            setInvitations(iData.invitations || []);
          } else {
            setInvitations([]);
          }
          if (wsRes.ok) {
            const wData = await wsRes.json();
            const wsList = wData.workspaces || [];
            setWorkspaces(wsList);
            setSelectedWorkspaceId((prev) => {
              if (prev && wsList.some((w: { id: string }) => w.id === prev)) {
                fetchWorkspaceMembers(prev);
                return prev;
              }
              const nextId = wsList[0]?.id || null;
              if (nextId) fetchWorkspaceMembers(nextId);
              return nextId;
            });
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
    if (!org || !canInviteMembers) return;
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

      setMessage({
        type: "success",
        text: `Invitation sent to ${values.email}`,
      });
      resetInvite();
      loadData();
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to invite",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!org || !canManageMembers) return;
    try {
      const res = await fetch(
        `/api/v1/organizations/${org.id}/invitations/${inviteId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        setMessage({ type: "success", text: "Invitation revoked" });
        loadData();
      }
    } catch {
      setMessage({ type: "error", text: "Failed to revoke invitation" });
    }
  };

  const handleUpdateMemberRole = async (
    memberId: string,
    targetRole?: string,
  ) => {
    const roleToApply = targetRole || pendingRoles[memberId];
    if (!org || !canManageMembers || !roleToApply) return;
    setUpdatingRoleId(memberId);
    try {
      const res = await fetch(
        `/api/v1/organizations/${org.id}/members/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: roleToApply }),
        },
      );
      if (res.ok) {
        setMessage({
          type: "success",
          text: `Member role updated to ${roleToApply}`,
        });
        setPendingRoles((prev) => {
          const next = { ...prev };
          delete next[memberId];
          return next;
        });
        loadData();
      } else {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.error || "Failed to update member role",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update member role" });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!org || !canManageMembers || !memberToRemove) return;
    setIsRemovingMember(true);
    try {
      const res = await fetch(
        `/api/v1/organizations/${org.id}/members/${memberToRemove.id}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        setMessage({
          type: "success",
          text: `Member '${memberToRemove.fullName}' removed from organization`,
        });
        setMemberToRemove(null);
        loadData();
      } else {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.error || "Failed to remove member",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to remove member" });
    } finally {
      setIsRemovingMember(false);
    }
  };

  const handleOpenOrgDeleteModal = async () => {
    if (!org) return;
    setOrgDeleteError(null);
    setOrgDeletePassword("");
    setOrgDeleteConfirmName("");
    setShowOrgDeleteModal(true);
    setIsLoadingOrgPreview(true);
    try {
      const res = await fetch(`/api/v1/organizations/${org.id}/deletion-preview`);
      if (res.ok) {
        const data = await res.json();
        setOrgDeletionPreview(data);
      } else {
        const err = await res.json();
        setOrgDeleteError(err.error || "Failed to load deletion preview");
      }
    } catch {
      setOrgDeleteError("Failed to fetch organization details");
    } finally {
      setIsLoadingOrgPreview(false);
    }
  };

  const handleConfirmDeleteOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !orgDeletePassword || orgDeleteConfirmName.trim() !== org.name.trim()) return;
    setIsDeletingOrg(true);
    setOrgDeleteError(null);
    try {
      const res = await fetch(`/api/v1/organizations/${org.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: orgDeletePassword,
          confirmOrgName: orgDeleteConfirmName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOrgDeleteError(data.error || "Failed to delete organization");
        setIsDeletingOrg(false);
        return;
      }
      // Navigate to nextUrl (e.g. /dashboard or /init)
      window.location.href = data.nextUrl || "/dashboard";
    } catch {
      setOrgDeleteError("Network error occurred while deleting organization.");
      setIsDeletingOrg(false);
    }
  };

  const handleTransferOwnership = async (values: TransferFormValues) => {
    if (!org) return;
    setIsTransferring(true);
    setMessage(null);

    try {
      const res = await fetch(
        `/api/v1/organizations/${org.id}/transfer-ownership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );

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
        text:
          err instanceof Error ? err.message : "Failed to transfer ownership",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const eligibleOrgMembers = React.useMemo(() => {
    if (!selectedWorkspaceId) return [];
    const currentMemberUserIds = new Set(
      (workspaceMembersMap[selectedWorkspaceId] || []).map((m) => m.userId)
    );
    const filtered = members.filter(
      (m) =>
        !currentMemberUserIds.has(m.userId) &&
        m.userId !== currentUser?.id &&
        (!currentUser?.email ||
          m.email.toLowerCase() !== currentUser.email.toLowerCase())
    );
    return sortMembersByCurrentUserAndRole(
      filtered,
      currentUser?.id,
      currentUser?.email
    );
  }, [members, workspaceMembersMap, selectedWorkspaceId, currentUser?.id, currentUser?.email]);

  const handleSelectWorkspaceTab = (wsId: string) => {
    setSelectedWorkspaceId(wsId);
    if (!workspaceMembersMap[wsId]) {
      fetchWorkspaceMembers(wsId);
    }
  };

  const handleAddWorkspaceMember = async () => {
    if (!selectedWorkspaceId || !addWsMemberUserId) return;
    setIsAddingWsMember(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/workspaces/${selectedWorkspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: addWsMemberUserId,
          role: addWsMemberRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add member to workspace");
      }
      setShowAddWsMemberModal(false);
      setAddWsMemberUserId("");
      setAddWsMemberRole("developer");
      await fetchWorkspaceMembers(selectedWorkspaceId);
      setMessage({
        type: "success",
        text: "Member successfully granted access to workspace.",
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add member to workspace",
      });
    } finally {
      setIsAddingWsMember(false);
    }
  };

  const handleUpdateWsMemberRole = async (
    wsId: string,
    memberId: string,
    newRole: string
  ) => {
    setUpdatingRoleId(memberId);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/workspaces/${wsId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update member role");
      }
      await fetchWorkspaceMembers(wsId);
      setMessage({
        type: "success",
        text: "Workspace member role updated successfully.",
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update workspace role",
      });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleConfirmRemoveWsMember = async () => {
    if (!wsMemberToRemove) return;
    setIsRemovingWsMember(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsMemberToRemove.workspaceId}/members/${wsMemberToRemove.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove workspace access");
      }
      await fetchWorkspaceMembers(wsMemberToRemove.workspaceId);
      setWsMemberToRemove(null);
      setMessage({
        type: "success",
        text: "Workspace access revoked successfully.",
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to revoke access",
      });
    } finally {
      setIsRemovingWsMember(false);
    }
  };

  const handleConfirmDeleteWorkspace = async () => {
    if (!wsToDelete || !org) return;
    if (wsDeleteConfirmName !== wsToDelete.name) return;
    setIsDeletingWs(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/workspaces/${wsToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete workspace");
      }
      const remaining = workspaces.filter((w) => w.id !== wsToDelete.id);
      setWorkspaces(remaining);
      window.dispatchEvent(
        new CustomEvent("chronos:workspaces-updated", { detail: remaining })
      );
      if (selectedWorkspaceId === wsToDelete.id) {
        const nextWs = remaining[0] || null;
        setSelectedWorkspaceId(nextWs ? nextWs.id : null);
        if (nextWs) fetchWorkspaceMembers(nextWs.id);
      }
      const deletedName = wsToDelete.name;
      setWsToDelete(null);
      setWsDeleteConfirmName("");
      setMessage({
        type: "success",
        text: `Workspace '${deletedName}' deleted. Workspace metadata and database registrations removed; external PostgreSQL databases unaffected.`,
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete workspace",
      });
    } finally {
      setIsDeletingWs(false);
    }
  };

  const handleCreateWorkspace = async (values: WorkspaceFormValues) => {
    if (!org || !canCreateWorkspace) return;
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

      resetWs();
      const updatedList = [...workspaces, data.workspace];
      setWorkspaces(updatedList);
      setSelectedWorkspaceId(data.workspace.id);
      fetchWorkspaceMembers(data.workspace.id);
      window.dispatchEvent(
        new CustomEvent("chronos:workspaces-updated", { detail: updatedList })
      );
      setMessage({
        type: "success",
        text: `Workspace '${values.name}' created`,
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to create workspace",
      });
    } finally {
      setIsCreatingWs(false);
    }
  };

  return (
    <div className="space-y-4 w-full max-w-[1920px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-foreground">
            Settings & Access Management
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage organization members, workspace environments, and granular
            RBAC policies
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
          <TabsTrigger
            value="workspaces"
            className="text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Workspaces ({isLoading ? "..." : workspaces.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="invites"
            className="text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Mail className="h-3.5 w-3.5" />
            <span>
              Invitations (
              {isLoading
                ? "..."
                : canViewInvites
                  ? invitations.filter((i) => i.status === "pending").length
                  : 0}
              )
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="rbac"
            className="text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Roles & Permissions Matrix</span>
          </TabsTrigger>
        </TabsList>


        {/* Tab 2: Invitations */}
        <TabsContent value="invites" className="mt-4 space-y-4">
          {canInviteMembers && (
            <Card>
              <CardHeader>
                <CardTitle>Invite New Member</CardTitle>
                <CardDescription>
                  Send an invitation token allowing a teammate to join this
                  organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleInviteSubmit(handleSendInvite)}
                  noValidate
                  className="flex flex-col sm:flex-row items-start gap-2.5"
                >
                  <Field
                    error={inviteErrors.email?.message}
                    className="relative flex-1 w-full space-y-1"
                  >
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
                    <SelectTrigger className="h-9 w-full sm:w-48 text-xs shrink-0 font-sans">
                      <span className="text-xs truncate leading-none">
                        <span className="text-muted-foreground">Role:</span>{" "}
                        <span className="font-medium text-foreground">
                          {CHRONOS_ROLES[normalizeRole(inviteRole)]?.label || inviteRole}
                        </span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {assignableInviteRoles.map((roleKey) => (
                        <SelectItem key={roleKey} value={roleKey} className="text-xs font-mono">
                          {CHRONOS_ROLES[roleKey]?.label || roleKey}
                        </SelectItem>
                      ))}
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
          )}

          {!canViewInvites ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground font-mono text-xs">
                Organization invitation management is restricted to authorized administrators.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Active Invitations</CardTitle>
                <CardDescription>
                  Invitations valid for 7 days from generation
                </CardDescription>
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
                        <th className="p-3 font-medium text-right">
                          Invite Link / Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {isLoading ? (
                        Array.from({ length: 2 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="p-3">
                              <div className="h-4 w-36 bg-muted rounded" />
                            </td>
                            <td className="p-3">
                              <div className="h-5 w-16 bg-muted rounded" />
                            </td>
                            <td className="p-3">
                              <div className="h-5 w-16 bg-muted rounded" />
                            </td>
                            <td className="p-3">
                              <div className="h-4 w-24 bg-muted rounded" />
                            </td>
                            <td className="p-3 text-right">
                              <div className="h-4 w-20 bg-muted rounded ml-auto" />
                            </td>
                          </tr>
                        ))
                      ) : invitations.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-6 text-center text-muted-foreground font-mono text-xs"
                          >
                            No pending invitations
                          </td>
                        </tr>
                      ) : (
                        invitations.map((inv) => (
                          <tr key={inv.id} className="hover:bg-elevated/40">
                            <td className="p-3 font-mono text-foreground">
                              {inv.email}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="capitalize font-mono text-[10px]">
                                {CHRONOS_ROLES[normalizeRole(inv.role)]?.label || inv.role}
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
                                  {canInviteMembers && (
                                    <button
                                      onClick={() => {
                                        const url = `${window.location.origin}/invite/${inv.token}`;
                                        navigator.clipboard.writeText(url);
                                        setMessage({
                                          type: "success",
                                          text: "Invitation link copied to clipboard!",
                                        });
                                      }}
                                      className="text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                                      title="Copy invite URL"
                                    >
                                      <Copy className="h-3 w-3" /> Copy Link
                                    </button>
                                  )}
                                  {canManageMembers && (
                                    <button
                                      onClick={() => handleRevokeInvite(inv.id)}
                                      className="text-destructive hover:underline cursor-pointer ml-2"
                                    >
                                      Revoke
                                    </button>
                                  )}
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
          )}
        </TabsContent>

        {/* Tab 3: Workspaces & Access Governance */}
        <TabsContent value="workspaces" className="mt-4 space-y-5">
          {canCreateWorkspace && (
            <Card>
              <CardHeader>
                <CardTitle>Create New Workspace</CardTitle>
                <CardDescription>
                  Isolate database connections into development, staging, or
                  production boundaries
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleWsSubmit(handleCreateWorkspace)}
                  noValidate
                  className="flex flex-col sm:flex-row items-start gap-2.5"
                >
                  <Field
                    error={wsErrors.name?.message}
                    className="relative flex-1 w-full space-y-1"
                  >
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
                    onValueChange={(
                      val: "development" | "staging" | "production",
                    ) => setWsEnv(val)}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-44 text-xs shrink-0 font-sans">
                      <span className="text-xs truncate leading-none">
                        <span className="text-muted-foreground">Env:</span>{" "}
                        <span className="capitalize font-medium text-foreground">
                          {wsEnv}
                        </span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value="development"
                        className="text-xs font-mono"
                      >
                        Development
                      </SelectItem>
                      <SelectItem value="staging" className="text-xs font-mono">
                        Staging
                      </SelectItem>
                      <SelectItem
                        value="production"
                        className="text-xs font-mono"
                      >
                        Production
                      </SelectItem>
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
          )}

          {/* Workspaces List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle>Existing Workspaces</CardTitle>
                <CardDescription>
                  Select a workspace to manage its granular access control and member permissions
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-3 font-medium">Workspace Name</th>
                      <th className="p-3 font-medium">Slug</th>
                      <th className="p-3 font-medium">Environment</th>
                      <th className="p-3 font-medium">Members</th>
                      <th className="p-3 font-medium">Created</th>
                      <th className="p-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLoading ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="p-3">
                            <div className="h-4 w-32 bg-muted rounded" />
                          </td>
                          <td className="p-3">
                            <div className="h-4 w-24 bg-muted rounded" />
                          </td>
                          <td className="p-3">
                            <div className="h-5 w-16 bg-muted rounded" />
                          </td>
                          <td className="p-3">
                            <div className="h-4 w-12 bg-muted rounded" />
                          </td>
                          <td className="p-3">
                            <div className="h-4 w-24 bg-muted rounded" />
                          </td>
                          <td className="p-3 text-right">
                            <div className="h-6 w-20 bg-muted rounded ml-auto" />
                          </td>
                        </tr>
                      ))
                    ) : workspaces.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-6 text-center text-muted-foreground font-mono text-xs"
                        >
                          No registered workspaces found
                        </td>
                      </tr>
                    ) : (
                      workspaces.map((ws) => {
                        const isSelected = ws.id === selectedWorkspaceId;
                        const wsMembersCount = workspaceMembersMap[ws.id]?.length;
                        return (
                          <tr
                            key={ws.id}
                            className={cn(
                              "transition-colors",
                              isSelected
                                ? "bg-panel/70 border-l-2 border-l-primary"
                                : "hover:bg-elevated/40"
                            )}
                          >
                            <td className="p-3 font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{ws.name}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-muted-foreground">
                              {ws.slug}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={
                                  ws.environment === "production"
                                    ? "destructive"
                                    : ws.environment === "staging"
                                      ? "warning"
                                      : "info"
                                }
                                className="capitalize text-[10px]"
                              >
                                {ws.environment}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-muted-foreground">
                              {wsMembersCount !== undefined ? wsMembersCount : "-"}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-muted-foreground">
                              {formatDate(ws.createdAt)}
                            </td>
                            <td className="p-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isSelected ? "default" : "outline"}
                                  onClick={() => handleSelectWorkspaceTab(ws.id)}
                                  className="h-7 px-2.5 text-[11px] cursor-pointer"
                                >
                                  {isSelected ? "Managing Access" : "Manage Access"}
                                </Button>
                                {canDeleteWorkspace && workspaces.length > 1 && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setWsToDelete(ws);
                                      setWsDeleteConfirmName("");
                                    }}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                                    title="Delete workspace"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
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

          {/* Granular Workspace Access & Membership Section */}
          {selectedWorkspaceId && (
            (() => {
              const activeWs = workspaces.find((w) => w.id === selectedWorkspaceId) || workspaces[0];
              const membersList = sortedWorkspaceMembers;
              return (
                <Card className="border-border/80">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-semibold">
                          Access Control: {activeWs?.name || "Workspace"}
                        </CardTitle>
                        {activeWs?.environment && (
                          <Badge
                            variant={
                              activeWs.environment === "production"
                                ? "destructive"
                                : activeWs.environment === "staging"
                                  ? "warning"
                                  : "info"
                            }
                            className="capitalize text-[10px]"
                          >
                            {activeWs.environment}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        Assign organization members and configure workspace-specific roles. Workspace membership operates independently of organization-level roles.
                      </CardDescription>
                    </div>
                    {canAssignWorkspaceMembers && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setShowAddWsMemberModal(true);
                          setAddWsMemberRole("developer");
                          setAddWsMemberUserId(eligibleOrgMembers[0]?.userId || "");
                        }}
                        className="h-8 px-3 text-xs gap-1.5 cursor-pointer shrink-0"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Add Member</span>
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                            <th className="p-3 font-medium">Member</th>
                            <th className="p-3 font-medium">Workspace Role</th>
                            <th className="p-3 font-medium">Assigned By</th>
                            <th className="p-3 font-medium">Access Status</th>
                            <th className="p-3 font-medium">Joined Date</th>
                            {canRevokeWorkspaceMembers && (
                              <th className="p-3 font-medium text-right">Actions</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {isLoadingWsMembers ? (
                            Array.from({ length: 2 }).map((_, i) => (
                              <tr key={i} className="animate-pulse">
                                <td className="p-3">
                                  <div className="h-4 w-36 bg-muted rounded" />
                                </td>
                                <td className="p-3">
                                  <div className="h-6 w-28 bg-muted rounded" />
                                </td>
                                <td className="p-3">
                                  <div className="h-4 w-28 bg-muted rounded" />
                                </td>
                                <td className="p-3">
                                  <div className="h-4 w-16 bg-muted rounded" />
                                </td>
                                <td className="p-3">
                                  <div className="h-4 w-24 bg-muted rounded" />
                                </td>
                                {canRevokeWorkspaceMembers && (
                                  <td className="p-3 text-right">
                                    <div className="h-4 w-12 bg-muted rounded ml-auto" />
                                  </td>
                                )}
                              </tr>
                            ))
                          ) : membersList.length === 0 ? (
                            <tr>
                              <td
                                colSpan={canRevokeWorkspaceMembers ? 6 : 5}
                                className="p-8 text-center text-muted-foreground font-mono text-xs"
                              >
                                No members assigned to this workspace yet.
                              </td>
                            </tr>
                          ) : (
                            membersList.map((mem) => {
                              const isCurrentUser =
                                mem.userId === currentUser?.id ||
                                (!!currentUser?.email &&
                                  !!mem.email &&
                                  currentUser.email.toLowerCase() ===
                                    mem.email.toLowerCase());
                              return (
                                <tr key={mem.id} className="hover:bg-elevated/40">
                                  <td className="p-3">
                                    <div className="flex items-center gap-2.5">
                                      <div className="h-7 w-7 rounded-full bg-elevated border border-border flex items-center justify-center text-[10px] font-medium text-foreground shrink-0">
                                        {getInitials(mem.fullName || mem.email)}
                                      </div>
                                      <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-medium text-foreground truncate">
                                            {mem.fullName || mem.email}
                                          </span>
                                          {isCurrentUser && (
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                              (You)
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[11px] text-muted-foreground truncate font-mono">
                                          {mem.email}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    {isCurrentUser ? (
                                      <div className="flex items-center gap-1.5 py-0.5">
                                        <Badge variant="outline" className="capitalize text-[10px] font-mono">
                                          {CHRONOS_ROLES[normalizeRole(mem.role)]?.label || mem.role}
                                        </Badge>
                                        <span
                                          className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono"
                                          title="You cannot modify your own workspace role"
                                        >
                                          <Lock className="h-3 w-3 text-muted-foreground" /> Your account
                                        </span>
                                      </div>
                                    ) : canAssignWorkspaceMembers ? (
                                      <Select
                                        value={normalizeRole(mem.role)}
                                        onValueChange={(newRole) =>
                                          handleUpdateWsMemberRole(
                                            selectedWorkspaceId,
                                            mem.id,
                                            newRole
                                          )
                                        }
                                        disabled={updatingRoleId === mem.id}
                                      >
                                        <SelectTrigger className="h-7 w-44 text-xs font-sans">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="dba" className="text-xs">
                                            DBA (Full Access)
                                          </SelectItem>
                                          <SelectItem value="developer" className="text-xs">
                                            Developer (Write / DML)
                                          </SelectItem>
                                          <SelectItem value="database_engineer" className="text-xs">
                                            Database Engineer (Inspect / Explain)
                                          </SelectItem>
                                          <SelectItem value="data_analyst" className="text-xs">
                                            Data Analyst (Read-only SELECT)
                                          </SelectItem>
                                          <SelectItem value="auditor" className="text-xs">
                                            Auditor (Audit Logs)
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <Badge variant="outline" className="capitalize text-[10px] font-mono">
                                        {CHRONOS_ROLES[normalizeRole(mem.role)]?.label || mem.role}
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-3 font-mono text-[11px] text-muted-foreground">
                                    {mem.assignedByName || mem.assignedByEmail || "Direct Assignment"}
                                  </td>
                                  <td className="p-3">
                                    <div className="inline-flex items-center gap-1.5 text-xs text-foreground font-medium">
                                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                      <span>Active</span>
                                    </div>
                                  </td>
                                  <td className="p-3 font-mono text-[11px] text-muted-foreground">
                                    {formatDate(mem.createdAt)}
                                  </td>
                                  {canRevokeWorkspaceMembers && (
                                    <td className="p-3 text-right">
                                      {!isCurrentUser ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          onClick={() =>
                                            setWsMemberToRemove({
                                              id: mem.id,
                                              workspaceId: selectedWorkspaceId,
                                              workspaceName: activeWs?.name || "Workspace",
                                              fullName: mem.fullName || mem.email,
                                              email: mem.email,
                                              role: mem.role,
                                            })
                                          }
                                          className="h-7 px-2 text-destructive hover:bg-destructive/10 text-xs cursor-pointer"
                                          title={`Revoke access for ${mem.fullName || mem.email}`}
                                        >
                                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                                          <span>Revoke</span>
                                        </Button>
                                      ) : null}
                                    </td>
                                  )}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })()
          )}
        </TabsContent>

        {/* Tab 4: RBAC Permissions Matrix */}
        <TabsContent value="rbac" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Role-Based Access Control (RBAC) Matrix</CardTitle>
              <CardDescription>
                Backend-enforced permission mappings for each of the six primary
                user roles
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-border bg-sidebar/50 text-muted-foreground">
                      <th className="p-3 font-medium min-w-55">
                        Capability / Permission
                      </th>
                      {CHRONOS_ROLE_KEYS.map((roleKey) => (
                        <th
                          key={roleKey}
                          className="p-3 font-medium text-center min-w-22.5"
                        >
                          {CHRONOS_ROLES[roleKey]?.label || roleKey}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-[11px]">
                    {matrixRows.map((row) => (
                      <tr
                        key={String(row.permission)}
                        className="hover:bg-elevated/40 transition-colors"
                      >
                        <td className="p-2.5">
                          <div className="font-medium text-foreground">{row.label}</div>
                          <div className="text-[10px] text-muted-foreground font-sans">
                            {row.description}
                          </div>
                        </td>
                        {CHRONOS_ROLE_KEYS.map((roleKey) => {
                          const cell = row.roles[roleKey];
                          return (
                            <td key={roleKey} className="p-2.5 text-center">
                              {cell.state === "allowed" ? (
                                <span className="text-[#34D399] font-semibold">
                                  {cell.label}
                                </span>
                              ) : cell.state === "conditional" ? (
                                <span
                                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  title={cell.note}
                                >
                                  {cell.label}
                                </span>
                              ) : cell.label === "STRICT NO" ? (
                                <span
                                  className="text-destructive font-bold text-[10px]"
                                  title={cell.note}
                                >
                                  STRICT NO
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{cell.label}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Danger Zone: Organization Deletion (Only displayed to Organization Owners) */}
      {isOwner && (
        <Card className="mt-8 border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3 space-y-1">
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-4 w-4" />
              <CardTitle className="text-sm font-semibold">Danger Zone</CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Permanently delete this organization, workspaces, and remove registered database configurations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transfer Ownership Workflow */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-destructive/20">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">
                  Transfer organization ownership
                </p>
                <p className="text-[11px] text-muted-foreground max-w-xl leading-relaxed">
                  Transfer primary ownership and administrative root privileges of <strong className="text-foreground font-semibold">{org?.name}</strong> to another active member.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const otherMembers = sortedMembers.filter(
                    (other) =>
                      other.userId !== currentUser?.id &&
                      (!currentUser?.email ||
                        other.email.toLowerCase() !==
                          currentUser.email.toLowerCase()),
                  );
                  if (otherMembers.length > 0) {
                    setTransferValue("newOwnerMemberId", otherMembers[0].id);
                  }
                  setShowTransferModal(true);
                }}
                disabled={sortedMembers.filter((m) => m.userId !== currentUser?.id).length === 0}
                className="h-8 px-3 text-xs font-medium gap-1.5 text-amber-800 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 hover:border-amber-500/50 rounded-md transition-all shadow-2xs cursor-pointer font-sans shrink-0"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                <span>Transfer Ownership</span>
              </Button>
            </div>

            {/* Delete Organization Workflow */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">
                  Delete organization: <strong className="text-foreground font-semibold">{org?.name}</strong>
                </p>
                <p className="text-[11px] text-muted-foreground max-w-xl leading-relaxed">
                  Permanently deletes all workspaces, role assignments, saved queries, and connection registrations.
                  External PostgreSQL databases (e.g. Neon, AWS RDS) will not be dropped or modified.
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleOpenOrgDeleteModal}
                className="text-xs h-8 cursor-pointer shrink-0 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Organization</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SHADCN DIALOG: Transfer Ownership */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-md border-border/80 shadow-lg">
          <DialogHeader className="space-y-1.5 pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <Crown className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Transfer Organization Ownership
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Transfer primary ownership of{" "}
              <span className="font-medium text-foreground">
                &quot;{org?.name}&quot;
              </span>{" "}
              to another active member. You will relinquish Owner authority.
            </DialogDescription>
          </DialogHeader>

          {members.filter((m) => m.userId !== currentUser?.id).length === 0 ? (
            <div className="py-6 px-4 flex flex-col items-center text-center rounded-lg border border-border/70 bg-muted/30 my-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 dark:text-amber-400 mb-3 ring-8 ring-amber-500/5">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">
                No Eligible Members Found
              </h4>
              <p className="text-xs text-muted-foreground max-w-75 mt-1.5 leading-relaxed">
                You must have at least one other active member in this
                organization before transferring ownership. Invite a teammate
                first.
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
            <form
              onSubmit={handleTransferSubmit(handleTransferOwnership)}
              noValidate
              className="space-y-4 pt-1"
            >
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/25 bg-amber-500/5 text-xs text-foreground">
                <AlertTriangle className="h-4 w-4 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-semibold text-foreground">
                    Warning:{" "}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    This action permanently transfers primary organization
                    ownership and administrative root privileges.
                  </span>
                </div>
              </div>

              <Field error={transferErrors.newOwnerMemberId?.message}>
                <FieldLabel htmlFor="newOwnerMemberId">
                  Select New Owner
                </FieldLabel>
                <Select
                  value={watchTransfer("newOwnerMemberId")}
                  onValueChange={(val) =>
                    setTransferValue("newOwnerMemberId", val, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger
                    id="newOwnerMemberId"
                    className="h-9 text-xs font-sans"
                  >
                    <SelectValue placeholder="Choose an active member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedMembers
                      .filter(
                        (m) =>
                          m.userId !== currentUser?.id &&
                          (!currentUser?.email ||
                            m.email.toLowerCase() !==
                              currentUser.email.toLowerCase()),
                      )
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          <span className="font-medium text-foreground">
                            {m.fullName}
                          </span>{" "}
                          <span className="text-muted-foreground font-mono">
                            ({m.email})
                          </span>{" "}
                          <Badge
                            variant="outline"
                            className="ml-1.5 font-mono text-[9px] uppercase"
                          >
                            {m.role}
                          </Badge>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FieldError />
              </Field>

              <div className="space-y-1.5">
                <Label htmlFor="previousOwnerNewRole">
                  Your New Role After Transfer
                </Label>
                <Select
                  value={watchTransfer("previousOwnerNewRole")}
                  onValueChange={(val: string) =>
                    setTransferValue("previousOwnerNewRole", val, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger
                    id="previousOwnerNewRole"
                    className="h-9 text-xs font-sans"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dba" className="text-xs">
                      DBA (Full database administration & schema governance)
                    </SelectItem>
                    <SelectItem value="database_engineer" className="text-xs">
                      Database Engineer (Performance diagnostics & diagnostics)
                    </SelectItem>
                    <SelectItem value="developer" className="text-xs">
                      Developer (Application queries & data modifications)
                    </SelectItem>
                    <SelectItem value="data_analyst" className="text-xs">
                      Data Analyst (Read-only analysis & export)
                    </SelectItem>
                    <SelectItem value="auditor" className="text-xs">
                      Auditor (Read-only audit & compliance)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Field error={transferErrors.confirmationPhrase?.message}>
                <FieldLabel
                  htmlFor="transferConfirmation"
                  className="text-destructive font-medium"
                >
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

      {/* SHADCN DIALOG: Remove Member Confirmation */}
      <Dialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Remove Organization Member
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Are you sure you want to remove{" "}
              <strong className="text-foreground font-semibold">
                {memberToRemove?.fullName}
              </strong>{" "}
              (<span className="font-mono text-foreground">{memberToRemove?.email}</span>) from{" "}
              <strong className="text-foreground font-semibold">{org?.name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
            <p className="font-semibold">Access Revocation Notice</p>
            <p className="text-[11px] leading-relaxed text-destructive/90">
              This member will immediately lose access to all workspaces, databases, queries, and organization resources.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMemberToRemove(null)}
              disabled={isRemovingMember}
              className="text-xs h-8 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isRemovingMember}
              onClick={handleConfirmRemoveMember}
              className="text-xs h-8 cursor-pointer gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Member</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: Delete Organization Confirmation */}
      <Dialog open={showOrgDeleteModal} onOpenChange={setShowOrgDeleteModal}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleConfirmDeleteOrg}>
            <DialogHeader className="space-y-1.5 pb-2">
              <div className="flex items-center gap-2 text-destructive">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  Delete Organization
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
                This action is irreversible. All CHRONOS metadata, workspaces, and configurations for{" "}
                <strong className="text-foreground font-semibold">{org?.name}</strong> will be permanently removed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-3">
              {/* Summary Stats Grid */}
              <div className="rounded-lg border border-border/70 bg-panel/60 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Impacted Resources
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="rounded-md border border-border/50 bg-elevated/40 p-2">
                    <div className="text-base font-bold font-mono text-foreground">
                      {isLoadingOrgPreview ? "..." : (orgDeletionPreview?.memberCount ?? members.length)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Members</div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-elevated/40 p-2">
                    <div className="text-base font-bold font-mono text-foreground">
                      {isLoadingOrgPreview ? "..." : (orgDeletionPreview?.workspaceCount ?? workspaces.length)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Workspaces</div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-elevated/40 p-2">
                    <div className="text-base font-bold font-mono text-foreground">
                      {isLoadingOrgPreview ? "..." : (orgDeletionPreview?.databaseCount ?? 0)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Databases</div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-elevated/40 p-2">
                    <div className="text-base font-bold font-mono text-foreground">
                      {isLoadingOrgPreview
                        ? "..."
                        : (orgDeletionPreview?.pendingInviteCount ??
                          invitations.filter((i) => i.status === "pending").length)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Pending Invites</div>
                  </div>
                </div>
              </div>

              {/* What is deleted vs retained notice */}
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>External Database Safety Guarantee</span>
                </p>
                <p className="text-[11px] leading-relaxed text-destructive/90">
                  External PostgreSQL databases (such as Neon, AWS RDS, or self-hosted) will <strong>NOT</strong> be destroyed or modified.
                  Only CHRONOS workspaces, access policies, and encrypted connection profiles will be removed.
                </p>
              </div>

              {orgDeleteError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/15 p-2.5 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{orgDeleteError}</span>
                </div>
              )}

              {/* Re-authentication: Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Current Password <span className="text-destructive">*</span>
                </label>
                <Input
                  type="password"
                  value={orgDeletePassword}
                  onChange={(e) => setOrgDeletePassword(e.target.value)}
                  placeholder="Enter your password to verify"
                  className="h-8 text-xs bg-elevated/40"
                  required
                />
              </div>

              {/* Exact name match */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  To confirm, type <span className="font-semibold text-foreground">&quot;{org?.name}&quot;</span> below:
                </label>
                <Input
                  type="text"
                  value={orgDeleteConfirmName}
                  onChange={(e) => setOrgDeleteConfirmName(e.target.value)}
                  placeholder={org?.name || "Organization Name"}
                  className="h-8 text-xs font-mono bg-elevated/40"
                  required
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowOrgDeleteModal(false)}
                disabled={isDeletingOrg}
                className="text-xs h-8 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                isLoading={isDeletingOrg}
                disabled={
                  isDeletingOrg ||
                  !orgDeletePassword ||
                  orgDeleteConfirmName.trim() !== (org?.name || "").trim()
                }
                className="text-xs h-8 cursor-pointer gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Organization</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: Add Workspace Member */}
      <Dialog open={showAddWsMemberModal} onOpenChange={setShowAddWsMemberModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Grant Workspace Access
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Select an existing member of &quot;{org?.name}&quot; to grant access to the{" "}
              <span className="font-semibold text-foreground">
                {workspaces.find((w) => w.id === selectedWorkspaceId)?.name}
              </span>{" "}
              workspace. No email invitation or verification is required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Organization Member
              </label>
              {eligibleOrgMembers.length === 0 ? (
                <div className="p-3 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground font-mono">
                  All organization members already belong to this workspace.
                </div>
              ) : (
                <Select
                  value={addWsMemberUserId}
                  onValueChange={setAddWsMemberUserId}
                >
                  <SelectTrigger className="h-9 text-xs font-sans">
                    <SelectValue placeholder="Select member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOrgMembers.map((m) => (
                      <SelectItem key={m.userId} value={m.userId} className="text-xs">
                        {m.fullName || m.email} ({m.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Workspace Role
              </label>
              <Select
                value={addWsMemberRole}
                onValueChange={setAddWsMemberRole}
              >
                <SelectTrigger className="h-9 text-xs font-sans">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer" className="text-xs">
                    Developer (Write / DML query permissions)
                  </SelectItem>
                  <SelectItem value="database_engineer" className="text-xs">
                    Database Engineer (Performance diagnostics & explain plans)
                  </SelectItem>
                  <SelectItem value="data_analyst" className="text-xs">
                    Data Analyst (Strictly read-only SELECT queries)
                  </SelectItem>
                  <SelectItem value="dba" className="text-xs">
                    DBA (Full workspace database administrator)
                  </SelectItem>
                  <SelectItem value="auditor" className="text-xs">
                    Auditor (Append-only audit telemetry access)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddWsMemberModal(false)}
              disabled={isAddingWsMember}
              className="text-xs h-8 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAddWorkspaceMember}
              isLoading={isAddingWsMember}
              disabled={isAddingWsMember || !addWsMemberUserId || eligibleOrgMembers.length === 0}
              className="text-xs h-8 cursor-pointer gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Grant Access</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: Revoke Workspace Access */}
      <Dialog
        open={!!wsMemberToRemove}
        onOpenChange={(open) => !open && setWsMemberToRemove(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Revoke Workspace Access
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Are you sure you want to revoke access for{" "}
              <span className="font-semibold text-foreground">
                {wsMemberToRemove?.fullName}
              </span>{" "}
              from the{" "}
              <span className="font-semibold text-foreground">
                {wsMemberToRemove?.workspaceName}
              </span>{" "}
              workspace?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2 text-xs">
            <div className="font-medium text-destructive flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Access Revocation Notice</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              The user will immediately lose access to all databases, saved queries, and telemetry within this workspace. Their account and organization membership will remain active.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWsMemberToRemove(null)}
              disabled={isRemovingWsMember}
              className="text-xs h-8 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isRemovingWsMember}
              disabled={isRemovingWsMember}
              onClick={handleConfirmRemoveWsMember}
              className="text-xs h-8 cursor-pointer gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Revoke Access</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHADCN DIALOG: Delete Workspace */}
      <Dialog
        open={!!wsToDelete}
        onOpenChange={(open) => !open && setWsToDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Delete Workspace
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-normal">
              Permanently delete workspace{" "}
              <span className="font-semibold text-foreground">
                &quot;{wsToDelete?.name}&quot;
              </span>{" "}
              ({wsToDelete?.environment}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
              <div className="font-medium text-amber-500 flex items-center gap-1.5">
                <Shield className="h-4 w-4 shrink-0" />
                <span>External Database Safety Guarantee</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Deleting this workspace will remove registered connection credentials and workspace metadata from Chronos. External PostgreSQL database clusters will NOT be dropped or modified.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                To confirm, type <span className="font-semibold text-foreground">&quot;{wsToDelete?.name}&quot;</span> below:
              </label>
              <Input
                type="text"
                value={wsDeleteConfirmName}
                onChange={(e) => setWsDeleteConfirmName(e.target.value)}
                placeholder={wsToDelete?.name || "Workspace Name"}
                className="h-8 text-xs font-mono bg-elevated/40"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWsToDelete(null)}
              disabled={isDeletingWs}
              className="text-xs h-8 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              isLoading={isDeletingWs}
              disabled={
                isDeletingWs ||
                wsDeleteConfirmName.trim() !== (wsToDelete?.name || "").trim()
              }
              onClick={handleConfirmDeleteWorkspace}
              className="text-xs h-8 cursor-pointer gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Workspace</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
