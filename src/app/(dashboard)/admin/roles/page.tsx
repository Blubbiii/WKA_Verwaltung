"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Shield,
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  ArrowLeft,
  Loader2,
  Lock,
  Download,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

// Schema
const roleFormSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Ungültiger Farbcode").optional(),
  permissions: z.array(z.string()).default([]),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

interface Role {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  tenantId: string | null;
  _count: {
    permissions: number;
    userAssignments: number;
  };
  permissions?: Array<{
    permission: {
      id: string;
      name: string;
      displayName: string;
    };
  }>;
}

interface ModuleGroup {
  module: string;
  label: string;
  permissions: Array<{
    id: string;
    name: string;
    displayName: string;
    action: string;
    actionLabel: string;
  }>;
}

const presetColors = [
  "#dc2626", "#ea580c", "#ca8a04", "#16a34a",
  "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#6b7280",
];

/**
 * Redesign 2026-06 R-10: Permissions-Page als 2-Pane-Layout.
 *
 * Vorher: lange Rollen-Tabelle, Edit über Modal-Dialog mit eingebetteter Matrix.
 * Bei ~125 Permissions × N Rollen war das Modal zu groß, das Hin-und-Her
 * zwischen Tabelle und Modal kostete bei jeder Edit-Aktion mehrere Klicks.
 *
 * Jetzt: Liste links (320px) zeigt alle Rollen kompakt mit Color-Indicator,
 * Name, Permissions-Count und User-Count. Auswahl öffnet das Detail-Pane rechts
 * mit Header (Name + Type-Badge), Description, und vollständige PermissionMatrix
 * inline editierbar. Save/Cancel bleibt am unteren Rand sticky.
 *
 * "Neue Rolle" + "Delete" bleiben als modale Dialoge (sind Einmal-Aktionen
 * mit klarem Anfang und Ende — modal ist hier korrekt).
 */
export default function RolesPage() {
  const t = useTranslations("admin.roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<ModuleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // 2-Pane state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedRoleFull, setSelectedRoleFull] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [originalPermissions, setOriginalPermissions] = useState<string[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Inline-Edit form (für Name/Description/Color der gewählten Rolle)
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("#2563eb");

  // Dialog states (nur noch für Neu-Anlegen + Löschen)
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Form für "Neue Rolle"-Dialog
  const newRoleForm = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema) as Resolver<RoleFormValues>,
    defaultValues: {
      name: "",
      description: "",
      color: "#2563eb",
      permissions: [],
    },
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [rolesRes, permissionsRes, sessionRes] = await Promise.all([
        fetch("/api/admin/roles?includeSystem=true"),
        fetch("/api/admin/permissions"),
        fetch("/api/auth/session"),
      ]);

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData);
      }
      if (permissionsRes.ok) {
        const permData = await permissionsRes.json();
        setGroupedPermissions(permData.grouped);
      }
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        setIsSuperAdmin((session?.user?.roleHierarchy ?? 0) >= 100);
      }
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Detail-Pane: lade gewählte Rolle samt Permissions
  useEffect(() => {
    if (!selectedRoleId) {
      setSelectedRoleFull(null);
      setSelectedPermissions([]);
      setOriginalPermissions([]);
      setIsDirty(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/admin/roles/${selectedRoleId}`);
        if (!res.ok) throw new Error();
        const role = (await res.json()) as Role;
        if (cancelled) return;
        const permNames =
          role.permissions?.map((p) => p.permission.name) || [];
        setSelectedRoleFull(role);
        setSelectedPermissions(permNames);
        setOriginalPermissions(permNames);
        setEditName(role.name);
        setEditDescription(role.description || "");
        setEditColor(role.color || "#2563eb");
        setIsDirty(false);
      } catch {
        if (!cancelled) toast.error(t("loadRoleError"));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRoleId, t]);

  const handleTogglePermission = useCallback((permName: string) => {
    setSelectedPermissions((prev) => {
      const next = prev.includes(permName)
        ? prev.filter((p) => p !== permName)
        : [...prev, permName];
      // Dirty-Check gegen Original-Set
      setIsDirty(
        next.length !== originalPermissions.length ||
          !next.every((p) => originalPermissions.includes(p)),
      );
      return next;
    });
  }, [originalPermissions]);

  // Wenn Name/Desc/Color ändert: dirty markieren
  useEffect(() => {
    if (!selectedRoleFull) return;
    const nameChanged = editName !== selectedRoleFull.name;
    const descChanged = editDescription !== (selectedRoleFull.description || "");
    const colorChanged = editColor !== (selectedRoleFull.color || "#2563eb");
    const permChanged =
      selectedPermissions.length !== originalPermissions.length ||
      !selectedPermissions.every((p) => originalPermissions.includes(p));
    setIsDirty(nameChanged || descChanged || colorChanged || permChanged);
  }, [editName, editDescription, editColor, selectedPermissions, originalPermissions, selectedRoleFull]);

  const canEditSelected = useMemo(() => {
    if (!selectedRoleFull) return false;
    if (!selectedRoleFull.isSystem) return true;
    return isSuperAdmin;
  }, [selectedRoleFull, isSuperAdmin]);

  const handleSaveInline = async () => {
    if (!selectedRoleFull) return;
    try {
      setIsSubmitting(true);
      // Sende nur die Felder die sich gegenüber dem Original geändert haben.
      // Wenn der User eine System-Rolle nur "ansieht" (kein Edit erlaubt) und
      // ein anderer State-Effekt isDirty kurzzeitig setzt, würden sonst die
      // Original-Werte versehentlich zurückgeschrieben (No-Op, aber API-Aufruf
      // gegen Permission-Check). Saubere Payload-Berechnung verhindert das.
      const payload: Record<string, unknown> = {};
      if (editName !== selectedRoleFull.name) payload.name = editName;
      if (editDescription !== (selectedRoleFull.description || "")) {
        payload.description = editDescription || null;
      }
      if (editColor !== (selectedRoleFull.color || "#2563eb")) {
        payload.color = editColor;
      }
      const permChanged =
        selectedPermissions.length !== originalPermissions.length ||
        !selectedPermissions.every((p) => originalPermissions.includes(p));
      if (permChanged) payload.permissions = selectedPermissions;

      if (Object.keys(payload).length === 0) {
        // Nichts zu speichern — nur isDirty zurücksetzen
        setIsDirty(false);
        return;
      }

      const res = await fetch(`/api/admin/roles/${selectedRoleFull.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || t("saveError"));
      }
      const updated = (await res.json()) as Role;
      toast.success(t("roleUpdated"));

      // BUG-FIX (Post-R-10): selectedRoleFull muss nach Save auf den neuen
      // Server-Stand. Vorher wurde nur originalPermissions/setIsDirty(false)
      // zurückgesetzt, aber selectedRoleFull blieb auf dem ALTEN Name/Description/
      // Color. Der isDirty-useEffect verglich dann neue Inputs gegen alte
      // selectedRoleFull-Felder und sprang sofort wieder auf true — der User
      // sah "Ungespeicherte Änderungen" trotz erfolgreich gespeichert.
      const newPerms =
        updated.permissions?.map((p) => p.permission.name) ?? selectedPermissions;
      setSelectedRoleFull(updated);
      setSelectedPermissions(newPerms);
      setOriginalPermissions(newPerms);
      setEditName(updated.name);
      setEditDescription(updated.description || "");
      setEditColor(updated.color || "#2563eb");
      setIsDirty(false);

      // Liste asynchron neu laden für Counts/Sortierung — nicht blockierend
      void fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetInline = () => {
    if (!selectedRoleFull) return;
    setEditName(selectedRoleFull.name);
    setEditDescription(selectedRoleFull.description || "");
    setEditColor(selectedRoleFull.color || "#2563eb");
    setSelectedPermissions(originalPermissions);
    setIsDirty(false);
  };

  const handleCreateNew = async (data: RoleFormValues) => {
    try {
      setIsSubmitting(true);
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, permissions: data.permissions ?? [] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("saveError"));
      }
      const created = await res.json();
      await fetchData();
      setShowNewDialog(false);
      newRoleForm.reset({
        name: "",
        description: "",
        color: "#2563eb",
        permissions: [],
      });
      toast.success(t("roleCreated"));
      // Direkt selektieren — User landet im Detail-Pane für ersten Permission-Setup
      if (created?.id) setSelectedRoleId(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/admin/roles/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("deleteError"));
      }
      if (selectedRoleId === deleteTarget.id) setSelectedRoleId(null);
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      await fetchData();
      toast.success(t("roleDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = async (format: "pdf" | "xlsx") => {
    try {
      setIsExporting(true);
      const res = await fetch(`/api/admin/permissions/export?format=${format}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("exportFailed"));
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Berechtigungs-Matrix_${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(t("exportedAs", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  const filteredRoles = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {t("exportMatrix")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("pdf")}>
              <FileText className="mr-2 h-4 w-4" />
              {t("exportPdf")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {t("exportExcel")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("newRole")}
        </Button>
      </div>

      {/* Stats — kompakter als vorher (3-Reihen-Grid mit weniger Padding) */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("totalRoles")}</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-2xl font-semibold tabular-currency">{roles.length}</div>
            <p className="text-xs text-muted-foreground">
              {t("systemRoles", { count: roles.filter((r) => r.isSystem).length })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("permissionsLabel")}</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-2xl font-semibold tabular-currency">
              {groupedPermissions.reduce((acc, g) => acc + g.permissions.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("inModules", { count: groupedPermissions.length })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("assignments")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-2xl font-semibold tabular-currency">
              {roles.reduce((acc, r) => acc + r._count.userAssignments, 0)}
            </div>
            <p className="text-xs text-muted-foreground">{t("userRoleAssignments")}</p>
          </CardContent>
        </Card>
      </div>

      {/* 2-Pane-Layout: Liste links · Detail rechts.
       * Auf kleinen Bildschirmen: Liste komplett, Detail unterhalb (stacked).
       */}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Linkes Pane: Rollen-Liste */}
        <Card className="lg:max-h-[calc(100vh-280px)] lg:overflow-hidden lg:flex lg:flex-col">
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2 lg:flex-1 lg:overflow-y-auto">
            {loading ? (
              <div className="space-y-1.5 px-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : filteredRoles.length === 0 ? (
              <EmptyState
                kind="filtered"
                title={t("noRoles")}
                description={search ? `Keine Treffer für "${search}"` : undefined}
                onClearFilters={search ? () => setSearch("") : undefined}
              />
            ) : (
              <ul className="space-y-0.5">
                {filteredRoles.map((role) => {
                  const isActive = role.id === selectedRoleId;
                  return (
                    <li key={role.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedRoleId(role.id)}
                        className={cn(
                          "group w-full text-left rounded-md px-2.5 py-2 transition-colors",
                          "flex items-start gap-2.5",
                          isActive
                            ? "bg-primary/10 ring-1 ring-primary/30"
                            : "hover:bg-accent/60",
                        )}
                      >
                        {/* Color-Dot mit Active-Ring */}
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full",
                            isActive && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                          )}
                          style={{ backgroundColor: role.color || "#6b7280" }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{role.name}</span>
                            {role.isSystem && (
                              <ShieldCheck
                                className="h-3 w-3 shrink-0 text-muted-foreground"
                                aria-label={t("systemBadge")}
                              />
                            )}
                          </div>
                          {role.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {role.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-0.5">
                              <Lock className="h-3 w-3" aria-hidden />
                              {role._count.permissions}
                            </span>
                            <span className="inline-flex items-center gap-0.5">
                              <Users className="h-3 w-3" aria-hidden />
                              {role._count.userAssignments}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Rechtes Pane: Detail */}
        <Card className="lg:max-h-[calc(100vh-280px)] lg:overflow-hidden lg:flex lg:flex-col">
          {!selectedRoleId ? (
            <CardContent className="flex-1 flex items-center justify-center py-20">
              <EmptyState
                icon={Shield}
                title={t("selectRoleTitle")}
                description={t("selectRoleHint")}
              />
            </CardContent>
          ) : detailLoading || !selectedRoleFull ? (
            <CardContent className="space-y-4 py-6">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          ) : (
            <>
              {/* Header */}
              <CardHeader className="border-b py-4">
                <div className="flex items-start gap-3">
                  {/* Color Picker */}
                  <button
                    type="button"
                    className={cn(
                      "h-9 w-9 shrink-0 rounded-md border-2 transition-all relative overflow-hidden",
                      canEditSelected ? "cursor-pointer hover:scale-105" : "cursor-default",
                    )}
                    style={{ backgroundColor: editColor }}
                    disabled={!canEditSelected}
                    onClick={() => {
                      // Open native color picker via hidden input
                      const inp = document.getElementById("role-color-picker") as HTMLInputElement | null;
                      inp?.click();
                    }}
                    aria-label="Farbe ändern"
                  />
                  <input
                    id="role-color-picker"
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    disabled={!canEditSelected}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={!canEditSelected}
                        className="text-base font-semibold h-9 max-w-md"
                      />
                      {selectedRoleFull.isSystem ? (
                        <Badge variant="default" className="gap-1">
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          {t("systemBadge")}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t("customBadge")}</Badge>
                      )}
                      <Badge variant="secondary" className="gap-1 ml-auto">
                        <Users className="h-3 w-3" aria-hidden />
                        {selectedRoleFull._count.userAssignments}
                      </Badge>
                    </div>
                  </div>
                </div>
                {/* Preset-Colors */}
                {canEditSelected && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {presetColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          "h-5 w-5 rounded-full border-2 transition-all",
                          editColor === color
                            ? "border-foreground scale-110"
                            : "border-transparent hover:scale-105",
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditColor(color)}
                        aria-label={`Farbe ${color}`}
                      />
                    ))}
                  </div>
                )}
                {selectedRoleFull.isSystem && isSuperAdmin && (
                  <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <span>{t("systemWarnBanner")}</span>
                  </div>
                )}
                {selectedRoleFull.isSystem && !isSuperAdmin && (
                  <p className="text-xs text-muted-foreground italic">
                    {t("systemReadonly")}
                  </p>
                )}
              </CardHeader>

              {/* Beschreibung */}
              <CardContent className="space-y-4 py-4 lg:flex-1 lg:overflow-y-auto">
                <div className="space-y-1.5">
                  <Label htmlFor="role-desc" className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t("descriptionLabel")}
                  </Label>
                  <Textarea
                    id="role-desc"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    disabled={!canEditSelected}
                    rows={2}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </div>

                {/* PermissionMatrix */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t("permissionsSection")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("permissionsHint")}</p>
                  <PermissionMatrix
                    groupedPermissions={groupedPermissions}
                    selectedPermissions={selectedPermissions}
                    onTogglePermission={handleTogglePermission}
                    disabled={!canEditSelected}
                  />
                </div>
              </CardContent>

              {/* Sticky Footer mit Save/Reset und Delete-Action.
               * Auf lg+ "klebt" der Footer am Card-Unterrand dank
               * lg:max-h + flex-col. Auf kleineren Viewports wäre er sonst am
               * Ende der gesamten Page-Höhe (lange Scroll-Strecke), deshalb
               * sticky bottom-0 mit z-Index. */}
              <div className="border-t bg-card/95 backdrop-blur-sm p-3 flex items-center justify-between gap-2 sticky bottom-0 z-10 lg:static">
                <div className="flex items-center gap-2">
                  {!selectedRoleFull.isSystem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setDeleteTarget(selectedRoleFull);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("delete")}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isDirty && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {t("unsavedChanges")}
                    </span>
                  )}
                  {canEditSelected && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetInline}
                        disabled={!isDirty || isSubmitting}
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveInline}
                        disabled={!isDirty || isSubmitting || !editName.trim()}
                      >
                        {isSubmitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Pencil className="mr-2 h-4 w-4" />
                        )}
                        {t("save")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Neue-Rolle-Dialog (Anlegen ist Einmal-Aktion, modal korrekt) */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newRoleTitle")}</DialogTitle>
            <DialogDescription>{t("defineRoleDesc")}</DialogDescription>
          </DialogHeader>
          <Form {...newRoleForm}>
            <form
              onSubmit={newRoleForm.handleSubmit(handleCreateNew)}
              className="space-y-4"
            >
              <FormField
                control={newRoleForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nameLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newRoleForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("descriptionLabel")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("descriptionPlaceholder")}
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newRoleForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("colorLabel")}</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input
                          type="color"
                          {...field}
                          className="w-12 h-10 p-1 cursor-pointer"
                        />
                      </FormControl>
                      <div className="flex gap-1">
                        {presetColors.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={cn(
                              "h-6 w-6 rounded border-2 transition-all",
                              field.value === color
                                ? "border-foreground scale-110"
                                : "border-transparent",
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => field.onChange(color)}
                          />
                        ))}
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t("permissionsAfterCreate")}
              </p>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewDialog(false)}
                  disabled={isSubmitting}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete-Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Rolle &quot;{deleteTarget?.name}&quot; wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
              {deleteTarget?._count.userAssignments ? (
                <span className="block mt-2 text-destructive font-medium">
                  Hinweis: Die Rolle ist noch {deleteTarget._count.userAssignments} Benutzern zugewiesen.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                deleteTarget?._count.userAssignments
                  ? deleteTarget._count.userAssignments > 0
                  : false
              }
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
