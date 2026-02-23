"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Percent, Save, Link2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaxType = "STANDARD" | "REDUCED" | "EXEMPT";

interface TaxRate {
  id: string;
  taxType: TaxType;
  rate: number;
  validFrom: string;
  validTo: string | null;
  label: string | null;
  createdAt: string;
}

interface TaxRateFormData {
  taxType: TaxType;
  rate: string;
  validFrom: string;
  validTo: string;
  label: string;
}

interface PositionTaxMapping {
  id: string;
  category: string;
  label: string;
  taxType: TaxType;
  module: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAX_TYPE_LABELS: Record<TaxType, string> = {
  STANDARD: "Regelsteuersatz (Standard)",
  REDUCED: "Ermaessigter Steuersatz",
  EXEMPT: "Steuerbefreit",
};

const TAX_TYPE_SELECT_LABELS: Record<TaxType, string> = {
  STANDARD: "Standard",
  REDUCED: "Ermaessigt",
  EXEMPT: "Befreit",
};

const TAX_TYPE_ORDER: TaxType[] = ["STANDARD", "REDUCED", "EXEMPT"];

const MODULE_LABELS: Record<string, string> = {
  lease: "Pacht",
  management: "Betriebsfuehrung",
  billing: "Abrechnung",
};

const EMPTY_FORM: TaxRateFormData = {
  taxType: "STANDARD",
  rate: "",
  validFrom: "",
  validTo: "",
  label: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("de-DE").format(new Date(dateString));
}

function getRateStatus(
  rate: TaxRate
): "active" | "past" | "future" {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const from = new Date(rate.validFrom);
  from.setHours(0, 0, 0, 0);

  if (from > now) return "future";

  if (rate.validTo) {
    const to = new Date(rate.validTo);
    to.setHours(0, 0, 0, 0);
    if (to < now) return "past";
  }

  return "active";
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdminTaxRatesPage() {
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [positionMappings, setPositionMappings] = useState<PositionTaxMapping[]>([]);
  const [editedMappings, setEditedMappings] = useState<Record<string, TaxType>>({});
  const [isSavingMappings, setIsSavingMappings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [formData, setFormData] = useState<TaxRateFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRate, setDeletingRate] = useState<TaxRate | null>(null);

  // --------------------------------------------------
  // Data Fetching
  // --------------------------------------------------

  const fetchTaxRates = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/admin/tax-rates");
      if (!res.ok) {
        throw new Error("Fehler beim Laden der Steuersaetze");
      }
      const json = await res.json();
      setTaxRates(Array.isArray(json) ? json : json.data ?? []);
      if (json.positionMappings) {
        setPositionMappings(json.positionMappings);
        setEditedMappings({});
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTaxRates();
  }, [fetchTaxRates]);

  // --------------------------------------------------
  // Grouped data
  // --------------------------------------------------

  const grouped = useMemo(() => {
    const map: Record<TaxType, TaxRate[]> = {
      STANDARD: [],
      REDUCED: [],
      EXEMPT: [],
    };
    for (const rate of taxRates) {
      if (map[rate.taxType]) {
        map[rate.taxType].push(rate);
      }
    }
    // Sort each group: active first, then future, then past (newest first within each)
    const statusOrder = { active: 0, future: 1, past: 2 };
    for (const type of TAX_TYPE_ORDER) {
      map[type].sort((a, b) => {
        const sa = statusOrder[getRateStatus(a)];
        const sb = statusOrder[getRateStatus(b)];
        if (sa !== sb) return sa - sb;
        return (
          new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime()
        );
      });
    }
    return map;
  }, [taxRates]);

  // --------------------------------------------------
  // Create / Edit
  // --------------------------------------------------

  function openCreate() {
    setEditingRate(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(rate: TaxRate) {
    setEditingRate(rate);
    setFormData({
      taxType: rate.taxType,
      rate: String(rate.rate),
      validFrom: rate.validFrom.slice(0, 10),
      validTo: rate.validTo ? rate.validTo.slice(0, 10) : "",
      label: rate.label || "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    // Validation
    if (!formData.rate || isNaN(Number(formData.rate))) {
      toast.error("Bitte geben Sie einen gueltigen Steuersatz ein");
      return;
    }
    if (!formData.validFrom) {
      toast.error("Bitte geben Sie ein Startdatum ein");
      return;
    }

    const payload = {
      taxType: formData.taxType,
      rate: Number(formData.rate),
      validFrom: formData.validFrom,
      validTo: formData.validTo || null,
      label: formData.label || null,
    };

    try {
      setIsSaving(true);

      if (editingRate) {
        // PATCH (edit)
        const res = await fetch(`/api/admin/tax-rates/${editingRate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err.error || "Fehler beim Aktualisieren des Steuersatzes"
          );
        }
        toast.success("Steuersatz aktualisiert");
      } else {
        // POST (create)
        const res = await fetch("/api/admin/tax-rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            err.error || "Fehler beim Erstellen des Steuersatzes"
          );
        }
        toast.success("Steuersatz erstellt");
      }

      setDialogOpen(false);
      setEditingRate(null);
      setFormData(EMPTY_FORM);
      await fetchTaxRates();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Speichern"
      );
    } finally {
      setIsSaving(false);
    }
  }

  // --------------------------------------------------
  // Delete
  // --------------------------------------------------

  function openDelete(rate: TaxRate) {
    setDeletingRate(rate);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deletingRate) return;

    try {
      const res = await fetch(`/api/admin/tax-rates/${deletingRate.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Loeschen des Steuersatzes");
      }
      toast.success("Steuersatz geloescht");
      setDeletingRate(null);
      await fetchTaxRates();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Loeschen"
      );
      throw err; // re-throw so DeleteConfirmDialog stays open on error
    }
  }

  // --------------------------------------------------
  // Position Mappings
  // --------------------------------------------------

  const hasMappingChanges = Object.keys(editedMappings).length > 0;

  function handleMappingChange(category: string, taxType: TaxType) {
    const original = positionMappings.find((m) => m.category === category);
    if (original?.taxType === taxType) {
      // Reverted to original - remove from edited
      const next = { ...editedMappings };
      delete next[category];
      setEditedMappings(next);
    } else {
      setEditedMappings({ ...editedMappings, [category]: taxType });
    }
  }

  function getMappingTaxType(mapping: PositionTaxMapping): TaxType {
    return editedMappings[mapping.category] ?? mapping.taxType;
  }

  function getActiveRate(taxType: TaxType): number | null {
    const rates = grouped[taxType];
    const active = rates?.find((r) => getRateStatus(r) === "active");
    return active ? Number(active.rate) : null;
  }

  async function handleSaveMappings() {
    if (!hasMappingChanges) return;

    try {
      setIsSavingMappings(true);
      const mappings = positionMappings.map((m) => ({
        category: m.category,
        taxType: editedMappings[m.category] ?? m.taxType,
      }));

      const res = await fetch("/api/admin/tax-rates/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Speichern");
      }

      toast.success("Zuordnungen gespeichert");
      await fetchTaxRates();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Speichern"
      );
    } finally {
      setIsSavingMappings(false);
    }
  }

  // --------------------------------------------------
  // Render helpers
  // --------------------------------------------------

  function renderStatusBadge(rate: TaxRate) {
    const status = getRateStatus(rate);
    switch (status) {
      case "active":
        return <Badge variant="success">Aktuell</Badge>;
      case "future":
        return (
          <Badge className="border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Geplant
          </Badge>
        );
      case "past":
        return null;
    }
  }

  function renderRateRow(rate: TaxRate) {
    const status = getRateStatus(rate);
    const isPast = status === "past";

    return (
      <TableRow key={rate.id}>
        <TableCell className={isPast ? "text-muted-foreground" : ""}>
          <span className="font-medium">{rate.rate}%</span>
          {renderStatusBadge(rate) && (
            <span className="ml-2">{renderStatusBadge(rate)}</span>
          )}
        </TableCell>
        <TableCell className={isPast ? "text-muted-foreground" : ""}>
          {formatDate(rate.validFrom)}
        </TableCell>
        <TableCell className={isPast ? "text-muted-foreground" : ""}>
          {rate.validTo ? formatDate(rate.validTo) : "unbegrenzt"}
        </TableCell>
        <TableCell className={isPast ? "text-muted-foreground" : ""}>
          {rate.label || "\u2014"}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openEdit(rate)}
              aria-label="Steuersatz bearbeiten"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openDelete(rate)}
              aria-label="Steuersatz loeschen"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  // --------------------------------------------------
  // Loading state
  // --------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Steuersaetze"
          description="Verwalten Sie hier die gesetzlichen Steuersaetze mit Gueltigkeitszeitraum."
        />
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --------------------------------------------------
  // Error state
  // --------------------------------------------------

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Steuersaetze"
          description="Verwalten Sie hier die gesetzlichen Steuersaetze mit Gueltigkeitszeitraum."
        />
        <div className="p-4 text-red-600 bg-red-50 dark:bg-red-950/20 dark:text-red-400 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // Main render
  // --------------------------------------------------

  const hasAnyRates = taxRates.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Steuersaetze"
        description="Verwalten Sie hier die gesetzlichen Steuersaetze mit Gueltigkeitszeitraum."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Neuer Steuersatz
          </Button>
        }
      />

      {!hasAnyRates ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground">
              <Percent className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">
                Keine Steuersaetze vorhanden
              </p>
              <p className="text-sm mt-2">
                Erstellen Sie den ersten Steuersatz, um loszulegen.
              </p>
              <Button onClick={openCreate} className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Neuer Steuersatz
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        TAX_TYPE_ORDER.map((taxType) => {
          const rates = grouped[taxType];
          if (rates.length === 0) return null;

          return (
            <Card key={taxType}>
              <CardContent className="pt-6">
                <h2 className="text-lg font-semibold mb-4">
                  {TAX_TYPE_LABELS[taxType]}
                </h2>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Satz (%)</TableHead>
                        <TableHead>Gueltig ab</TableHead>
                        <TableHead>Gueltig bis</TableHead>
                        <TableHead>Bezeichnung</TableHead>
                        <TableHead className="w-[100px]">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rates.map((rate) => renderRateRow(rate))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Position Tax Mappings */}
      {positionMappings.length > 0 && (
        <>
          <Separator />
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Zuordnung Positionskategorien
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Legen Sie fest, welcher Steuersatz fuer welche Abrechnungsposition gilt.
                  </p>
                </div>
                {hasMappingChanges && (
                  <Button onClick={handleSaveMappings} disabled={isSavingMappings}>
                    {isSavingMappings ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Zuordnungen speichern
                  </Button>
                )}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Positionskategorie</TableHead>
                      <TableHead>Modul</TableHead>
                      <TableHead className="w-[260px]">Steuersatz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positionMappings.map((mapping) => {
                      const currentTaxType = getMappingTaxType(mapping);
                      const rate = getActiveRate(currentTaxType);
                      const isChanged = mapping.category in editedMappings;

                      return (
                        <TableRow key={mapping.id}>
                          <TableCell className="font-medium">
                            {mapping.label}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {MODULE_LABELS[mapping.module] ?? mapping.module}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select
                                value={currentTaxType}
                                onValueChange={(v: string) =>
                                  handleMappingChange(mapping.category, v as TaxType)
                                }
                              >
                                <SelectTrigger className={`w-[200px] ${isChanged ? "ring-2 ring-blue-500" : ""}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TAX_TYPE_ORDER.map((type) => {
                                    const r = getActiveRate(type);
                                    return (
                                      <SelectItem key={type} value={type}>
                                        {TAX_TYPE_SELECT_LABELS[type]}
                                        {r !== null ? ` (${r}%)` : ""}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              {rate !== null && (
                                <span className="text-sm text-muted-foreground whitespace-nowrap">
                                  {rate}%
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRate ? "Steuersatz bearbeiten" : "Neuer Steuersatz"}
            </DialogTitle>
            <DialogDescription>
              {editingRate
                ? "Bearbeiten Sie die Daten des Steuersatzes."
                : "Erstellen Sie einen neuen Steuersatz mit Gueltigkeitszeitraum."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Tax Type - only on create */}
            {!editingRate && (
              <div className="space-y-2">
                <Label htmlFor="taxType">Steuerart *</Label>
                <Select
                  value={formData.taxType}
                  onValueChange={(value: string) =>
                    setFormData({ ...formData, taxType: value as TaxType })
                  }
                >
                  <SelectTrigger id="taxType">
                    <SelectValue placeholder="Steuerart waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_TYPE_ORDER.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TAX_TYPE_SELECT_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Rate */}
            <div className="space-y-2">
              <Label htmlFor="rate">Steuersatz (%) *</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.rate}
                onChange={(e) =>
                  setFormData({ ...formData, rate: e.target.value })
                }
                placeholder="z.B. 19"
              />
            </div>

            {/* Valid From */}
            <div className="space-y-2">
              <Label htmlFor="validFrom">Gueltig ab *</Label>
              <Input
                id="validFrom"
                type="date"
                value={formData.validFrom}
                onChange={(e) =>
                  setFormData({ ...formData, validFrom: e.target.value })
                }
              />
            </div>

            {/* Valid To */}
            <div className="space-y-2">
              <Label htmlFor="validTo">
                Gueltig bis{" "}
                <span className="text-muted-foreground font-normal">
                  (leer = unbegrenzt)
                </span>
              </Label>
              <Input
                id="validTo"
                type="date"
                value={formData.validTo}
                onChange={(e) =>
                  setFormData({ ...formData, validTo: e.target.value })
                }
              />
            </div>

            {/* Label */}
            <div className="space-y-2">
              <Label htmlFor="label">
                Bezeichnung{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) =>
                  setFormData({ ...formData, label: e.target.value })
                }
                placeholder="z.B. MwSt Deutschland"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRate ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="Steuersatz loeschen"
        description="Moechten Sie diesen Steuersatz wirklich loeschen?"
        itemName={
          deletingRate
            ? `${deletingRate.rate}% (${TAX_TYPE_SELECT_LABELS[deletingRate.taxType]})`
            : undefined
        }
      />
    </div>
  );
}
