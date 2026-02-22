"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useDebounce } from "@/hooks/useDebounce";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Shield,
  UserPlus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// ─── Types ───────────────────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  tenantId: string;
  tenant: { name: string } | null;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  color: string;
  isSystem: boolean;
  permissions: {
    permission: {
      id: string;
      name: string;
      module: string;
      action: string;
      description: string | null;
    };
  }[];
  _count: { userAssignments: number };
}

interface Permission {
  id: string;
  name: string;
  module: string;
  action: string;
  description: string | null;
}

interface UserRoleAssignment {
  roleId: string;
  roleName: string;
  roleColor: string;
  permissions: Permission[];
}

interface PermissionGroup {
  module: string;
  permissions: Permission[];
}

interface TenantOption {
  id: string;
  name: string;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const userFormSchema = z.object({
  email: z.string().email("Ungueltige E-Mail-Adresse"),
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  role: z.enum(["SUPERADMIN", "ADMIN", "MANAGER", "VIEWER"]).default("VIEWER"),
  tenantId: z.string().min(1, "Mandant ist erforderlich"),
  password: z.string().min(8, "Mindestens 8 Zeichen").or(z.literal("")).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

type UserFormValues = z.infer<typeof userFormSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────

const roleLabels: Record<string, string> = {
  SUPERADMIN: "Super-Admin",
  ADMIN: "Administrator",
  MANAGER: "Manager",
  VIEWER: "Betrachter",
};

const moduleLabels: Record<string, string> = {
  parks: "Windparks",
  turbines: "WEAs",
  users: "Benutzer",
  roles: "Rollen",
  documents: "Dokumente",
  reports: "Berichte",
  settings: "Einstellungen",
  admin: "Administration",
  contracts: "Vertraege",
  invoices: "Rechnungen",
  shareholders: "Gesellschafter",
  votes: "Abstimmungen",
};

const actionLabels: Record<string, string> = {
  read: "Lesen",
  create: "Erstellen",
  update: "Bearbeiten",
  delete: "Loeschen",
  manage: "Verwalten",
  assign: "Zuweisen",
  export: "Exportieren",
  import: "Importieren",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function UserManagement() {
  // Data state
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Permissions dialog
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [userRoleAssignments, setUserRoleAssignments] = useState<UserRoleAssignment[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  // Role management
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [originalUserRoles, setOriginalUserRoles] = useState<string[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);

  // Form
  const userForm = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "VIEWER",
      tenantId: "",
      password: "",
      status: "ACTIVE",
    },
  });

  // ─── Fetch Users ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setUsers(json.data ?? []);
    } catch {
      toast.error("Benutzer konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tenants");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setTenants(
        (json.data ?? []).map((t: { id: string; name: string }) => ({
          id: t.id,
          name: t.name,
        }))
      );
    } catch {
      // Tenants are non-critical for initial load
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchTenants();
  }, [fetchUsers, fetchTenants]);

  // ─── Filtered Users ─────────────────────────────────────────────────────

  const filteredUsers = users.filter((u) => {
    const term = debouncedSearch.toLowerCase();
    if (!term) return true;
    const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
    return (
      fullName.includes(term) || u.email.toLowerCase().includes(term)
    );
  });

  // ─── Load Available Roles ───────────────────────────────────────────────

  const loadAvailableRoles = async () => {
    try {
      setLoadingRoles(true);
      const res = await fetch("/api/admin/roles?includeSystem=true");
      if (res.ok) {
        const json = await res.json();
        setAvailableRoles(json.data ?? json ?? []);
      }
    } catch {
      toast.error("Fehler beim Laden der Rollen");
    } finally {
      setLoadingRoles(false);
    }
  };

  // ─── Load User Roles ───────────────────────────────────────────────────

  const loadUserRoles = async (userId: string) => {
    try {
      setLoadingRoles(true);
      const res = await fetch(`/api/admin/users/${userId}/roles`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? json ?? [];
        const roleIds = data.map(
          (assignment: { roleId: string }) => assignment.roleId
        );
        setUserRoles(roleIds);
        setOriginalUserRoles(roleIds);
      }
    } catch {
      toast.error("Fehler beim Laden der Benutzer-Rollen");
    } finally {
      setLoadingRoles(false);
    }
  };

  // ─── Toggle Role ────────────────────────────────────────────────────────

  const toggleRole = (roleId: string, checked: boolean) => {
    if (checked) {
      setUserRoles((prev) => [...prev, roleId]);
    } else {
      setUserRoles((prev) => prev.filter((id) => id !== roleId));
    }
  };

  // ─── Save Role Changes ─────────────────────────────────────────────────

  const saveRoleChanges = async (userId: string) => {
    const addedRoles = userRoles.filter((id) => !originalUserRoles.includes(id));
    const removedRoles = originalUserRoles.filter((id) => !userRoles.includes(id));

    for (const roleId of removedRoles) {
      const res = await fetch(
        `/api/admin/users/${userId}/roles?roleId=${roleId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Fehler beim Entfernen der Rolle");
      }
    }

    for (const roleId of addedRoles) {
      const res = await fetch(`/api/admin/users/${userId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Fehler beim Zuweisen der Rolle");
      }
    }
  };

  // ─── Create / Edit ────────────────────────────────────────────────────

  const openCreateDialog = async () => {
    setSelectedUser(null);
    userForm.reset({
      email: "",
      firstName: "",
      lastName: "",
      role: "VIEWER",
      tenantId: tenants.length > 0 ? tenants[0].id : "",
      password: "",
      status: "ACTIVE",
    });
    setUserRoles([]);
    setOriginalUserRoles([]);
    setDialogOpen(true);
    await loadAvailableRoles();
  };

  const openEditDialog = async (user: User) => {
    setSelectedUser(user);
    userForm.reset({
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      role: user.role as "SUPERADMIN" | "ADMIN" | "MANAGER" | "VIEWER",
      tenantId: user.tenantId,
      password: "",
      status: user.status as "ACTIVE" | "INACTIVE",
    });
    setUserRoles([]);
    setOriginalUserRoles([]);
    setDialogOpen(true);
    await Promise.all([loadAvailableRoles(), loadUserRoles(user.id)]);
  };

  const handleSave = async (data: UserFormValues) => {
    try {
      setIsSubmitting(true);
      const url = selectedUser
        ? `/api/admin/users/${selectedUser.id}`
        : "/api/admin/users";
      const method = selectedUser ? "PATCH" : "POST";

      const payload = { ...data };
      if (selectedUser && !data.password) {
        delete (payload as Partial<UserFormValues>).password;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      const savedUser = await response.json();
      const userId = selectedUser?.id || savedUser.id;

      // Save role changes
      if (userId) {
        try {
          await saveRoleChanges(userId);
        } catch {
          toast.error(
            "Benutzer gespeichert, aber Rollen konnten nicht aktualisiert werden"
          );
        }
      }

      toast.success(selectedUser ? "Benutzer aktualisiert" : "Benutzer erstellt");
      setDialogOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Delete (Deactivate) ──────────────────────────────────────────────

  const handleDeactivate = async () => {
    if (!userToDelete) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Fehler beim Deaktivieren");
      }
      toast.success(
        `${userToDelete.firstName} ${userToDelete.lastName} wurde deaktiviert`
      );
      setDeleteDialogOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Deaktivieren"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Impersonate ──────────────────────────────────────────────────────

  const handleImpersonate = async (user: User) => {
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Impersonation fehlgeschlagen");
      }

      toast.success(`Angemeldet als ${user.firstName} ${user.lastName}`);
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Impersonation fehlgeschlagen"
      );
    }
  };

  // ─── Permissions Dialog ───────────────────────────────────────────────

  const loadUserPermissions = async (user: User) => {
    try {
      setLoadingPermissions(true);
      setPermissionsUser(user);
      setPermissionsDialogOpen(true);

      const res = await fetch(`/api/admin/users/${user.id}/roles`);
      if (!res.ok) throw new Error("Fehler beim Laden");

      const json = await res.json();
      const data = json.data ?? json ?? [];

      // Fetch full role details with permissions for each assignment
      const detailedAssignments: UserRoleAssignment[] = await Promise.all(
        data.map(
          async (assignment: { roleId: string; role?: { id: string; name: string; color: string } }) => {
            const roleRes = await fetch(`/api/admin/roles/${assignment.roleId}`);
            if (roleRes.ok) {
              const roleData = await roleRes.json();
              const permissions: Permission[] = (roleData.permissions ?? []).map(
                (rp: { permission: Permission }) => rp.permission
              );
              return {
                roleId: assignment.roleId,
                roleName: roleData.name,
                roleColor: roleData.color || "#6b7280",
                permissions,
              };
            }
            return {
              roleId: assignment.roleId,
              roleName: assignment.role?.name ?? "Unbekannt",
              roleColor: assignment.role?.color ?? "#6b7280",
              permissions: [],
            };
          }
        )
      );

      setUserRoleAssignments(detailedAssignments);
    } catch {
      toast.error("Fehler beim Laden der Berechtigungen");
    } finally {
      setLoadingPermissions(false);
    }
  };

  // ─── Grouped Permissions ──────────────────────────────────────────────

  const getGroupedPermissions = (): PermissionGroup[] => {
    const permissionMap = new Map<string, Permission>();

    userRoleAssignments.forEach((assignment) => {
      assignment.permissions.forEach((perm) => {
        if (!permissionMap.has(perm.name)) {
          permissionMap.set(perm.name, perm);
        }
      });
    });

    const grouped = new Map<string, Permission[]>();
    permissionMap.forEach((permission) => {
      const mod = permission.module;
      if (!grouped.has(mod)) {
        grouped.set(mod, []);
      }
      grouped.get(mod)!.push(permission);
    });

    return Array.from(grouped.entries())
      .map(([mod, permissions]) => ({
        module: mod,
        permissions: permissions.sort((a, b) => a.action.localeCompare(b.action)),
      }))
      .sort((a, b) => {
        const labelA = moduleLabels[a.module] || a.module;
        const labelB = moduleLabels[b.module] || b.module;
        return labelA.localeCompare(labelB);
      });
  };

  const totalPermissions = getGroupedPermissions().reduce(
    (acc, group) => acc + group.permissions.length,
    0
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Name oder E-Mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Neuer Benutzer
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Mandant</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead>Letzter Login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Keine Benutzer gefunden
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.tenant?.name || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {roleLabels[user.role] || user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.lastLoginAt
                      ? format(new Date(user.lastLoginAt), "dd.MM.yyyy HH:mm", {
                          locale: de,
                        })
                      : "Nie"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        user.status === "ACTIVE" ? "success" : "secondary"
                      }
                    >
                      {user.status === "ACTIVE" ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleImpersonate(user)}
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Als Benutzer anmelden
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => loadUserPermissions(user)}
                        >
                          <Shield className="h-4 w-4 mr-2" />
                          Berechtigungen anzeigen
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setUserToDelete(user);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Deaktivieren
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedUser ? "Benutzer bearbeiten" : "Neuer Benutzer"}
            </DialogTitle>
            <DialogDescription>
              {selectedUser
                ? "Bearbeiten Sie die Benutzerdaten."
                : "Erstellen Sie einen neuen Benutzer."}
            </DialogDescription>
          </DialogHeader>
          <Form {...userForm}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={userForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname *</FormLabel>
                      <FormControl>
                        <Input placeholder="Max" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={userForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nachname *</FormLabel>
                      <FormControl>
                        <Input placeholder="Mustermann" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={userForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-Mail *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="max@beispiel.de"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={userForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Passwort{" "}
                      {selectedUser
                        ? "(leer lassen um beizubehalten)"
                        : "*"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Mindestens 8 Zeichen"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={userForm.control}
                name="tenantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mandant *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Mandant auswaehlen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tenants.map((tenant) => (
                          <SelectItem key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={userForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Aktiv</SelectItem>
                        <SelectItem value="INACTIVE">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Rollen-Zuweisung */}
              <Separator />
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Rollen zuweisen
                </Label>
                {loadingRoles ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Lade Rollen...
                  </div>
                ) : availableRoles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine Rollen verfuegbar
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-3">
                    {availableRoles.map((role) => (
                      <div
                        key={role.id}
                        className="flex items-center gap-3 py-1"
                      >
                        <Checkbox
                          id={`role-${role.id}`}
                          checked={userRoles.includes(role.id)}
                          onCheckedChange={(checked) =>
                            toggleRole(role.id, checked === true)
                          }
                        />
                        <label
                          htmlFor={`role-${role.id}`}
                          className="flex items-center gap-2 text-sm cursor-pointer flex-1"
                        >
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{
                              backgroundColor: role.color || "#6b7280",
                            }}
                          />
                          <span>{role.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {role._count.userAssignments} Berechtigungen
                          </Badge>
                          {role.isSystem && (
                            <Badge variant="outline" className="text-xs">
                              System
                            </Badge>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                {userRoles.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {userRoles.length} Rolle
                    {userRoles.length !== 1 ? "n" : ""} ausgewaehlt
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => userForm.handleSubmit(handleSave)()}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {selectedUser ? "Speichern" : "Erstellen"}
                </Button>
              </DialogFooter>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete (Deactivate) Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Benutzer deaktivieren</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Moechten Sie{" "}
                  <span className="font-semibold">
                    {userToDelete?.firstName} {userToDelete?.lastName}
                  </span>{" "}
                  ({userToDelete?.email}) wirklich deaktivieren?
                </p>
                <p className="text-destructive font-medium">
                  Der Benutzer wird gesperrt und kann sich nicht mehr anmelden.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeactivate();
              }}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permissions Dialog */}
      <Dialog
        open={permissionsDialogOpen}
        onOpenChange={setPermissionsDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Effektive Berechtigungen
            </DialogTitle>
            <DialogDescription>
              {permissionsUser
                ? `Alle Berechtigungen fuer ${permissionsUser.firstName} ${permissionsUser.lastName}`
                : "Benutzerberechtigungen"}
            </DialogDescription>
          </DialogHeader>

          {loadingPermissions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Zugewiesene Rollen */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Zugewiesene Rollen
                </h4>
                {userRoleAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine Rollen zugewiesen
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {userRoleAssignments.map((assignment) => (
                      <Badge
                        key={assignment.roleId}
                        variant="outline"
                        className="flex items-center gap-2 py-1 px-3"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: assignment.roleColor }}
                        />
                        {assignment.roleName}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Gruppierte Berechtigungen */}
              <div>
                <h4 className="text-sm font-semibold mb-3">
                  Alle Berechtigungen
                </h4>
                {getGroupedPermissions().length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Keine Berechtigungen vorhanden
                  </p>
                ) : (
                  <div className="space-y-4">
                    {getGroupedPermissions().map((group) => (
                      <div key={group.module} className="space-y-2">
                        <h5 className="text-sm font-medium text-muted-foreground">
                          {moduleLabels[group.module] ||
                            group.module.charAt(0).toUpperCase() +
                              group.module.slice(1)}
                        </h5>
                        <div className="flex flex-wrap gap-1">
                          {group.permissions.map((permission) => (
                            <Badge
                              key={permission.id}
                              variant="secondary"
                              className="text-xs"
                              title={
                                permission.description || permission.name
                              }
                            >
                              {actionLabels[permission.action] ||
                                permission.action}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zusammenfassung */}
              <Separator />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {userRoleAssignments.length} Rolle
                  {userRoleAssignments.length !== 1 ? "n" : ""} mit insgesamt{" "}
                  {totalPermissions} Berechtigung
                  {totalPermissions !== 1 ? "en" : ""}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPermissionsDialogOpen(false)}
            >
              Schliessen
            </Button>
            {permissionsUser && (
              <Button
                onClick={() => {
                  setPermissionsDialogOpen(false);
                  openEditDialog(permissionsUser);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rollen bearbeiten
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
