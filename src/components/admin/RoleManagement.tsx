"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Shield,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  Loader2,
  Lock,
  Download,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { toast } from "sonner";

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

// Preset colors for roles
const presetColors = [
  "#dc2626", // red
  "#ea580c", // orange
  "#ca8a04", // yellow
  "#16a34a", // green
  "#0891b2", // cyan
  "#2563eb", // blue
  "#7c3aed", // violet
  "#c026d3", // fuchsia
  "#6b7280", // gray
];

export function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [groupedPermissions, setGroupedPermissions] = useState<ModuleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog states
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#2563eb",
      permissions: [],
    },
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
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
        // Use hierarchy-based check (>= 100), with legacy enum as fallback
        setIsSuperAdmin(
          (session?.user?.roleHierarchy ?? 0) >= 100 ||
          session?.user?.role === "SUPERADMIN"
        );
      }
    } catch (error) {
      toast.error("Fehler beim Laden der Daten");
    } finally {
      setLoading(false);
    }
  }

  const openNewRoleDialog = () => {
    setSelectedRole(null);
    setSelectedPermissions([]);
    form.reset({
      name: "",
      description: "",
      color: "#2563eb",
      permissions: [],
    });
    setShowRoleDialog(true);
  };

  const openEditRoleDialog = async (role: Role) => {
    setSelectedRole(role);

    // Load full role with permissions
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`);
      if (res.ok) {
        const fullRole = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permNames = fullRole.permissions?.map((p: any) => p.permission.name) || [];
        setSelectedPermissions(permNames);
        form.reset({
          name: role.name,
          description: role.description || "",
          color: role.color || "#2563eb",
          permissions: permNames,
        });
      }
    } catch (error) {
      toast.error("Fehler beim Laden der Rolle");
      return;
    }

    setShowRoleDialog(true);
  };

  const openDeleteDialog = (role: Role) => {
    setSelectedRole(role);
    setShowDeleteDialog(true);
  };

  const handleTogglePermission = (permName: string) => {
    setSelectedPermissions(prev => {
      if (prev.includes(permName)) {
        return prev.filter(p => p !== permName);
      } else {
        return [...prev, permName];
      }
    });
  };

  const handleSubmit = async (data: RoleFormValues) => {
    try {
      setIsSubmitting(true);

      const payload = {
        ...data,
        permissions: selectedPermissions,
      };

      const url = selectedRole
        ? `/api/admin/roles/${selectedRole.id}`
        : "/api/admin/roles";
      const method = selectedRole ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      await fetchData();
      setShowRoleDialog(false);
      toast.success(selectedRole ? "Rolle aktualisiert" : "Rolle erstellt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRole) return;

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/admin/roles/${selectedRole.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Löschen");
      }

      await fetchData();
      setShowDeleteDialog(false);
      toast.success("Rolle gelöscht");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Löschen");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredRoles = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const handleExport = async (format: "pdf" | "xlsx") => {
    try {
      setIsExporting(true);
      const response = await fetch(`/api/admin/permissions/export?format=${format}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Export fehlgeschlagen");
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Berechtigungs-Matrix_${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Matrix als ${format.toUpperCase()} exportiert`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export fehlgeschlagen");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rollen gesamt</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roles.length}</div>
            <p className="text-xs text-muted-foreground">
              {roles.filter(r => r.isSystem).length} System-Rollen
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Berechtigungen</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {groupedPermissions.reduce((acc, g) => acc + g.permissions.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              in {groupedPermissions.length} Modulen
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Zuweisungen</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {roles.reduce((acc, r) => acc + r._count.userAssignments, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Benutzer-Rollen-Zuweisungen</p>
          </CardContent>
        </Card>
      </div>

      {/* Roles Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Rollen</CardTitle>
            <CardDescription>
              Übersicht aller System- und benutzerdefinierten Rollen
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isExporting}>
                  {isExporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Matrix exportieren
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <FileText className="mr-2 h-4 w-4" />
                  Als PDF exportieren
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Als Excel exportieren
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openNewRoleDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Neue Rolle
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rolle</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead className="text-center">Berechtigungen</TableHead>
                <TableHead className="text-center">Benutzer</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredRoles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-muted-foreground"
                  >
                    Keine Rollen gefunden
                  </TableCell>
                </TableRow>
              ) : (
                filteredRoles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: role.color || "#6b7280" }}
                        />
                        <span className="font-medium">{role.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[300px] truncate">
                      {role.description || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{role._count.permissions}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{role._count.userAssignments}</Badge>
                    </TableCell>
                    <TableCell>
                      {role.isSystem ? (
                        <Badge>System</Badge>
                      ) : (
                        <Badge variant="outline">Benutzerdefiniert</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditRoleDialog(role)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {role.isSystem && !isSuperAdmin ? "Anzeigen" : "Bearbeiten"}
                          </DropdownMenuItem>
                          {!role.isSystem && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => openDeleteDialog(role)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Löschen
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role Create/Edit Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedRole
                ? selectedRole.isSystem
                  ? `Rolle: ${selectedRole.name}`
                  : "Rolle bearbeiten"
                : "Neue Rolle erstellen"}
            </DialogTitle>
            <DialogDescription>
              {selectedRole?.isSystem && !isSuperAdmin
                ? "System-Rollen können nur von Superadmins bearbeitet werden"
                : selectedRole?.isSystem
                  ? "System-Rolle bearbeiten - Änderungen wirken sich auf alle Mandanten aus"
                  : "Definieren Sie Namen, Beschreibung und Berechtigungen der Rolle"}
            </DialogDescription>
            {selectedRole?.isSystem && isSuperAdmin && (
              <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Achtung: Änderungen an System-Rollen wirken sich auf alle Mandanten aus.</span>
              </div>
            )}
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="z.B. Park-Manager"
                          {...field}
                          disabled={selectedRole?.isSystem && !isSuperAdmin}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Farbe</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input
                            type="color"
                            {...field}
                            className="w-12 h-10 p-1 cursor-pointer"
                            disabled={selectedRole?.isSystem && !isSuperAdmin}
                          />
                        </FormControl>
                        <div className="flex gap-1">
                          {presetColors.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`h-6 w-6 rounded border-2 transition-all ${
                                field.value === color ? "border-foreground scale-110" : "border-transparent"
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => !(selectedRole?.isSystem && !isSuperAdmin) && field.onChange(color)}
                              disabled={selectedRole?.isSystem && !isSuperAdmin}
                            />
                          ))}
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Beschreiben Sie die Rolle..."
                        {...field}
                        disabled={selectedRole?.isSystem && !isSuperAdmin}
                        rows={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Permission Matrix */}
              <div>
                <Label className="text-base font-medium">Berechtigungen</Label>
                <p className="text-sm text-muted-foreground mb-4">
                  Wählen Sie die Berechtigungen für diese Rolle aus
                </p>
                <PermissionMatrix
                  groupedPermissions={groupedPermissions}
                  selectedPermissions={selectedPermissions}
                  onTogglePermission={handleTogglePermission}
                  disabled={selectedRole?.isSystem && !isSuperAdmin}
                  loading={loading}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRoleDialog(false)}
                >
                  {selectedRole?.isSystem && !isSuperAdmin ? "Schließen" : "Abbrechen"}
                </Button>
                {!(selectedRole?.isSystem && !isSuperAdmin) && (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {selectedRole ? "Speichern" : "Erstellen"}
                  </Button>
                )}
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rolle löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Rolle &quot;{selectedRole?.name}&quot; wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
              {selectedRole?._count.userAssignments ? (
                <span className="block mt-2 text-destructive font-medium">
                  Hinweis: Die Rolle ist noch {selectedRole._count.userAssignments} Benutzern zugewiesen.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={selectedRole?._count.userAssignments ? selectedRole._count.userAssignments > 0 : false}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
