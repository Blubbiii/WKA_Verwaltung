"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, Search, Pencil, Trash2, Download } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { EditableCell } from "@/components/ui/editable-cell";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

// ============================================================================
// Types
// ============================================================================

interface Vendor {
  id: string;
  name: string;
  taxId: string | null;
  iban: string | null;
  bic: string | null;
  email: string | null;
  city: string | null;
  country: string;
  notes: string | null;
  person: { id: string; firstName: string | null; lastName: string | null; companyName: string | null } | null;
}

const EMPTY_FORM = {
  name: "",
  taxId: "",
  vatId: "",
  iban: "",
  bic: "",
  email: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  notes: "",
};

// ============================================================================
// Vendor Dialog
// ============================================================================

function VendorDialog({
  open,
  onClose,
  onSaved,
  vendor,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  vendor?: Vendor | null;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name,
        taxId: vendor.taxId ?? "",
        vatId: "",
        iban: vendor.iban ?? "",
        bic: vendor.bic ?? "",
        email: vendor.email ?? "",
        street: "",
        postalCode: "",
        city: vendor.city ?? "",
        country: vendor.country,
        notes: vendor.notes ?? "",
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
  }, [vendor, open]);

  const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        taxId: form.taxId || null,
        vatId: form.vatId || null,
        iban: form.iban || null,
        bic: form.bic || null,
        email: form.email || null,
        street: form.street || null,
        postalCode: form.postalCode || null,
        city: form.city || null,
        country: form.country,
        notes: form.notes || null,
      };

      const url = vendor ? `/api/vendors/${vendor.id}` : "/api/vendors";
      const method = vendor ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }

      toast.success(vendor ? "Lieferant aktualisiert" : "Lieferant angelegt");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor ? "Lieferant bearbeiten" : "Neuer Lieferant"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Steuernummer</Label>
              <Input value={form.taxId} onChange={(e) => set("taxId", e.target.value)} />
            </div>
            <div>
              <Label>USt-IdNr.</Label>
              <Input value={form.vatId} onChange={(e) => set("vatId", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>IBAN</Label>
              <Input value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="DE..." />
            </div>
            <div>
              <Label>BIC</Label>
              <Input value={form.bic} onChange={(e) => set("bic", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>E-Mail</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>

          <div>
            <Label>Straße</Label>
            <Input value={form.street} onChange={(e) => set("street", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>PLZ</Label>
              <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
            </div>
            <div>
              <Label>Stadt</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Notizen</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Speichere..." : vendor ? "Speichern" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function VendorsPage() {
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Batch selection
  const { selectedIds, isAllSelected, isSomeSelected, toggleItem, toggleAll, clearSelection, selectedCount } =
    useBatchSelection({ items: vendors });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (search) params.set("q", search);
      const res = await fetch(`/api/vendors?${params}`);
      if (res.ok) {
        const data = await res.json();
        setVendors(data.data ?? []);
      }
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!flagsLoading && flags.inbox) {
      const t = setTimeout(load, 300);
      return () => clearTimeout(t);
    }
  }, [flags.inbox, flagsLoading, load, search]);

  const handleDelete = async () => {
    if (!deleteVendor) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vendors/${deleteVendor.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }
      toast.success("Lieferant gelöscht");
      setDeleteVendor(null);
      load();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setDeleting(false);
    }
  };

  // Batch CSV export
  const handleBatchExport = useCallback(() => {
    const selected = vendors.filter((v) => selectedIds.has(v.id));
    const header = "Name;IBAN;E-Mail";
    const rows = selected.map((v) =>
      [
        (v.name || "").replace(/;/g, ","),
        v.iban || "",
        v.email || "",
      ].join(";")
    );
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lieferanten-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${selected.length} Lieferant(en) exportiert`);
  }, [vendors, selectedIds]);

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!confirm(`${ids.length} Lieferant(en) wirklich löschen?`)) return;
    let success = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/vendors/${id}`, { method: "DELETE" });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }
    if (success > 0) {
      toast.success(`${success} Lieferant(en) gelöscht`);
      clearSelection();
      load();
    }
    if (failed > 0) {
      toast.error(`${failed} Lieferant(en) konnten nicht gelöscht werden`);
    }
  }, [selectedIds, clearSelection, load]);

  if (flagsLoading) return null;

  if (!flags.inbox) {
    return (
      <div className="p-8 text-center">
        <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Inbox nicht aktiviert</h2>
        <p className="text-muted-foreground">Das Eingangsrechnungs-Modul ist für diesen Mandanten nicht aktiviert.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lieferanten"
        description="Lieferanten für Eingangsrechnungen verwalten"
        actions={
          <Button onClick={() => { setEditVendor(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Neuer Lieferant
          </Button>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Lieferanten suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Keine Lieferanten gefunden"
              description="Erstellen Sie Ihren ersten Lieferanten"
              action={
                <Button onClick={() => { setEditVendor(null); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Lieferant anlegen
                </Button>
              }
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} aria-label="Alle auswählen"
                      {...(isSomeSelected ? { "data-state": "indeterminate" } : {})} />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>IBAN</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Verknüpfte Person</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(v.id)} onCheckedChange={() => toggleItem(v.id)} aria-label="Auswählen" />
                    </TableCell>
                    <TableCell className="font-medium" onClick={(e) => e.stopPropagation()}>
                      <EditableCell
                        value={v.name}
                        onSave={async (val) => {
                          const res = await fetch(`/api/vendors/${v.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: val }),
                          });
                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.error ?? "Fehler beim Speichern");
                          }
                          load();
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                      <EditableCell
                        value={v.iban}
                        placeholder="—"
                        onSave={async (val) => {
                          const res = await fetch(`/api/vendors/${v.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ iban: val || null }),
                          });
                          if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.error ?? "Fehler beim Speichern");
                          }
                          load();
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{v.email ?? "—"}</TableCell>
                    <TableCell>
                      {v.person ? (
                        <Badge variant="secondary" className="text-xs">
                          {[v.person.companyName, v.person.firstName, v.person.lastName]
                            .filter(Boolean)
                            .join(" ")}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => { setEditVendor(v); setDialogOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteVendor(v)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <VendorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
        vendor={editVendor}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        actions={[
          {
            label: "CSV Export",
            icon: <Download className="h-4 w-4" />,
            onClick: handleBatchExport,
          },
          {
            label: "Löschen",
            icon: <Trash2 className="h-4 w-4" />,
            onClick: handleBatchDelete,
            variant: "destructive",
          },
        ]}
      />

      <AlertDialog open={!!deleteVendor} onOpenChange={(v) => !v && setDeleteVendor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lieferant löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteVendor?.name} wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Lösche..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
