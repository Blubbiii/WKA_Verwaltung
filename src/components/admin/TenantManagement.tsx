"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
  Building2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
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
import { TenantCreationWizard } from "./tenant-creation-wizard";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  status: "ACTIVE" | "INACTIVE";
  storageUsedBytes: number;
  storageLimit: number;
  createdAt: string;
  _count: {
    users: number;
    parks: number;
    funds: number;
  };
}

interface TenantFormData {
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY_FORM: TenantFormData = {
  name: "",
  slug: "",
  contactEmail: "",
  contactPhone: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  primaryColor: "#3b82f6",
  secondaryColor: "#1e40af",
  status: "ACTIVE",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TenantManagement() {
  // Data state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Wizard state (for creating new tenants)
  const [wizardOpen, setWizardOpen] = useState(false);

  // Dialog state (for editing existing tenants)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Deactivate dialog
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [tenantToDeactivate, setTenantToDeactivate] = useState<Tenant | null>(null);

  // Hard-delete dialog
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false);
  const [tenantToHardDelete, setTenantToHardDelete] = useState<Tenant | null>(null);
  const [hardDeleteConfirmName, setHardDeleteConfirmName] = useState("");
  const [isHardDeleting, setIsHardDeleting] = useState(false);

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchTenants = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/tenants?${params.toString()}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setTenants(json.data ?? []);
    } catch {
      toast.error("Mandanten konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  // ─── Create / Edit ─────────────────────────────────────────────────────────

  function openCreateDialog() {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setSlugManuallyEdited(false);
    setDialogOpen(true);
  }

  function openEditDialog(tenant: Tenant) {
    setEditingId(tenant.id);
    setFormData({
      name: tenant.name,
      slug: tenant.slug,
      contactEmail: tenant.contactEmail ?? "",
      contactPhone: tenant.contactPhone ?? "",
      street: tenant.street ?? "",
      houseNumber: tenant.houseNumber ?? "",
      postalCode: tenant.postalCode ?? "",
      city: tenant.city ?? "",
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      status: tenant.status,
    });
    setSlugManuallyEdited(true);
    setDialogOpen(true);
  }

  function handleNameChange(name: string) {
    setFormData((prev) => ({
      ...prev,
      name,
      ...(!slugManuallyEdited ? { slug: slugify(name) } : {}),
    }));
  }

  async function handleSave() {
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast.error("Firmenname und Slug sind Pflichtfelder");
      return;
    }

    if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      toast.error("Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten");
      return;
    }

    setIsSaving(true);
    try {
      const url = editingId
        ? `/api/admin/tenants/${editingId}`
        : "/api/admin/tenants";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Speichern");
      }

      toast.success(editingId ? "Mandant aktualisiert" : "Mandant erstellt");
      setDialogOpen(false);
      fetchTenants();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  }

  // ─── Deactivate (Soft-Delete) ──────────────────────────────────────────────

  async function handleDeactivate() {
    if (!tenantToDeactivate) return;
    try {
      const res = await fetch(`/api/admin/tenants/${tenantToDeactivate.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Deaktivieren");
      }
      toast.success(`"${tenantToDeactivate.name}" wurde deaktiviert`);
      fetchTenants();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Deaktivieren");
    }
  }

  // ─── Hard-Delete ───────────────────────────────────────────────────────────

  async function handleHardDelete() {
    if (!tenantToHardDelete) return;
    if (hardDeleteConfirmName !== tenantToHardDelete.name) {
      toast.error("Der eingegebene Name stimmt nicht ueberein");
      return;
    }

    setIsHardDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantToHardDelete.id}?hard=true`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Loeschen");
      }
      toast.success(`"${tenantToHardDelete.name}" wurde endgueltig geloescht`);
      setHardDeleteDialogOpen(false);
      setHardDeleteConfirmName("");
      fetchTenants();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Loeschen");
    } finally {
      setIsHardDeleting(false);
    }
  }

  // ─── Reactivate ────────────────────────────────────────────────────────────

  async function handleReactivate(tenant: Tenant) {
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Reaktivieren");
      }
      toast.success(`"${tenant.name}" wurde reaktiviert`);
      fetchTenants();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Reaktivieren");
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-3 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suche nach Firmenname oder Slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Alle</SelectItem>
              <SelectItem value="ACTIVE">Aktiv</SelectItem>
              <SelectItem value="INACTIVE">Inaktiv</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neuer Mandant
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Firmenname</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead className="text-center">Benutzer</TableHead>
              <TableHead className="text-center">Parks</TableHead>
              <TableHead className="text-center">Gesellsch.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Keine Mandanten gefunden
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell>
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      {tenant.slug}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tenant.contactEmail || "-"}
                  </TableCell>
                  <TableCell className="text-center">{tenant._count.users}</TableCell>
                  <TableCell className="text-center">{tenant._count.parks}</TableCell>
                  <TableCell className="text-center">{tenant._count.funds}</TableCell>
                  <TableCell>
                    <Badge variant={tenant.status === "ACTIVE" ? "default" : "secondary"}>
                      {tenant.status === "ACTIVE" ? "Aktiv" : "Inaktiv"}
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
                        <DropdownMenuItem onClick={() => openEditDialog(tenant)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Bearbeiten
                        </DropdownMenuItem>

                        {tenant.status === "ACTIVE" ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setTenantToDeactivate(tenant);
                              setDeactivateDialogOpen(true);
                            }}
                          >
                            <Power className="h-4 w-4 mr-2" />
                            Deaktivieren
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleReactivate(tenant)}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reaktivieren
                          </DropdownMenuItem>
                        )}

                        {tenant.status === "INACTIVE" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setTenantToHardDelete(tenant);
                                setHardDeleteConfirmName("");
                                setHardDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Endgueltig loeschen
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
      </div>

      {/* Creation Wizard */}
      <TenantCreationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSuccess={fetchTenants}
      />

      {/* Edit Dialog */}
      <Dialog open={dialogOpen && editingId !== null} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mandant bearbeiten</DialogTitle>
            <DialogDescription>
              Aendern Sie die Firmendaten des Mandanten.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="tenant-name">
                Firmenname <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tenant-name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="z.B. Scharper GmbH"
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">
                Slug <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tenant-slug"
                value={formData.slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setFormData((prev) => ({ ...prev, slug: e.target.value }));
                }}
                placeholder="z.B. windpark-barenburg"
              />
              <p className="text-xs text-muted-foreground">
                Nur Kleinbuchstaben, Zahlen und Bindestriche
              </p>
            </div>

            {/* Contact Email */}
            <div className="space-y-2">
              <Label htmlFor="tenant-email">Kontakt-E-Mail</Label>
              <Input
                id="tenant-email"
                type="email"
                value={formData.contactEmail}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, contactEmail: e.target.value }))
                }
                placeholder="info@example.de"
              />
            </div>

            {/* Contact Phone */}
            <div className="space-y-2">
              <Label htmlFor="tenant-phone">Telefon</Label>
              <Input
                id="tenant-phone"
                value={formData.contactPhone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, contactPhone: e.target.value }))
                }
                placeholder="+49 123 456789"
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label>Adresse</Label>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-8 space-y-2">
                  <Label htmlFor="tenant-street">Strasse</Label>
                  <Input
                    id="tenant-street"
                    value={formData.street}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, street: e.target.value }))
                    }
                    placeholder="Musterstrasse"
                  />
                </div>
                <div className="col-span-4 space-y-2">
                  <Label htmlFor="tenant-houseNumber">Hausnummer</Label>
                  <Input
                    id="tenant-houseNumber"
                    value={formData.houseNumber}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, houseNumber: e.target.value }))
                    }
                    placeholder="1a"
                  />
                </div>
                <div className="col-span-4 space-y-2">
                  <Label htmlFor="tenant-postalCode">PLZ</Label>
                  <Input
                    id="tenant-postalCode"
                    value={formData.postalCode}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, postalCode: e.target.value }))
                    }
                    placeholder="12345"
                  />
                </div>
                <div className="col-span-8 space-y-2">
                  <Label htmlFor="tenant-city">Ort</Label>
                  <Input
                    id="tenant-city"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, city: e.target.value }))
                    }
                    placeholder="Musterstadt"
                  />
                </div>
              </div>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tenant-primary">Primaerfarbe</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="tenant-primary"
                    value={formData.primaryColor}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, primaryColor: e.target.value }))
                    }
                    className="h-9 w-9 rounded border cursor-pointer"
                  />
                  <Input
                    value={formData.primaryColor}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, primaryColor: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-secondary">Sekundaerfarbe</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="tenant-secondary"
                    value={formData.secondaryColor}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, secondaryColor: e.target.value }))
                    }
                    className="h-9 w-9 rounded border cursor-pointer"
                  />
                  <Input
                    value={formData.secondaryColor}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, secondaryColor: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Status (only on edit) */}
            {editingId && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, status: v as "ACTIVE" | "INACTIVE" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Aktiv</SelectItem>
                    <SelectItem value="INACTIVE">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Dialog (Soft-Delete) */}
      <DeleteConfirmDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        onConfirm={handleDeactivate}
        title="Mandant deaktivieren"
        description={`Moechten Sie "${tenantToDeactivate?.name}" wirklich deaktivieren? Alle Benutzer dieses Mandanten werden ebenfalls gesperrt. Der Mandant kann spaeter reaktiviert werden.`}
      />

      {/* Hard-Delete Dialog (with name confirmation) */}
      <AlertDialog open={hardDeleteDialogOpen} onOpenChange={setHardDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Mandant endgueltig loeschen
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Moechten Sie <span className="font-semibold">{tenantToHardDelete?.name}</span>{" "}
                  wirklich endgueltig loeschen? Alle zugehoerigen Daten (Benutzer, Parks,
                  Gesellschaften, Rechnungen, Dokumente etc.) werden unwiderruflich entfernt.
                </p>
                <p className="text-destructive font-medium">
                  Diese Aktion kann nicht rueckgaengig gemacht werden!
                </p>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="confirm-name">
                    Geben Sie zur Bestaetigung den Namen des Mandanten ein:
                  </Label>
                  <Input
                    id="confirm-name"
                    value={hardDeleteConfirmName}
                    onChange={(e) => setHardDeleteConfirmName(e.target.value)}
                    placeholder={tenantToHardDelete?.name}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isHardDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleHardDelete();
              }}
              disabled={
                isHardDeleting || hardDeleteConfirmName !== tenantToHardDelete?.name
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isHardDeleting ? "Loeschen..." : "Endgueltig loeschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
