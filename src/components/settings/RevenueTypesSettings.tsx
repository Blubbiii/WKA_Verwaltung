"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Zap } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

type TaxType = "STANDARD" | "REDUCED" | "EXEMPT";

const TAX_TYPE_LABELS: Record<TaxType, string> = {
  STANDARD: "Standard",
  REDUCED: "Ermaessigt",
  EXEMPT: "Befreit",
};

interface RevenueType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  calculationType: string;
  hasTax: boolean;
  taxRate: number | null;
  taxType: TaxType;
  isActive: boolean;
  sortOrder: number;
}

const CALC_TYPE_LABELS: Record<string, string> = {
  FIXED_RATE: "Fester Satz",
  MARKET_PRICE: "Marktpreis",
  MANUAL: "Manuell",
};

interface FormData {
  name: string;
  code: string;
  description: string;
  calculationType: string;
  taxType: TaxType;
  sortOrder: number;
}

const EMPTY_FORM: FormData = {
  name: "",
  code: "",
  description: "",
  calculationType: "FIXED_RATE",
  taxType: "STANDARD",
  sortOrder: 0,
};

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function RevenueTypesSettings() {
  const [revenueTypes, setRevenueTypes] = useState<RevenueType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<RevenueType | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/revenue-types");
      if (response.ok) {
        const data = await response.json();
        setRevenueTypes(data.data || []);
      }
    } catch {
      toast.error("Fehler beim Laden der Verguetungsarten");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleAdd() {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  }

  function handleEdit(item: RevenueType) {
    setEditingId(item.id);
    setFormData({
      name: item.name,
      code: item.code,
      description: item.description || "",
      calculationType: item.calculationType,
      taxType: item.taxType || "STANDARD",
      sortOrder: item.sortOrder,
    });
    setDialogOpen(true);
  }

  function handleDeleteClick(item: RevenueType) {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!itemToDelete) return;
    try {
      const response = await fetch(
        `/api/admin/revenue-types/${itemToDelete.id}`,
        { method: "DELETE" }
      );
      if (response.ok) {
        const result = await response.json();
        toast.success(result.message || "Verguetungsart geloescht");
        fetchData();
      } else {
        throw new Error("Fehler beim Loeschen");
      }
    } catch {
      toast.error("Fehler beim Loeschen der Verguetungsart");
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    if (!formData.code.trim()) {
      toast.error("Code ist erforderlich");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim() || null,
        calculationType: formData.calculationType,
        taxType: formData.taxType,
        hasTax: formData.taxType !== "EXEMPT",
        sortOrder: formData.sortOrder,
      };

      const url = editingId
        ? `/api/admin/revenue-types/${editingId}`
        : "/api/admin/revenue-types";

      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success(
        editingId
          ? "Verguetungsart aktualisiert"
          : "Verguetungsart erstellt"
      );
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Verguetungsarten
            </CardTitle>
            <CardDescription>
              Verguetungsarten fuer Netzbetreiber-Daten (EEG, Direktvermarktung
              etc.)
            </CardDescription>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Neue Verguetungsart
          </Button>
        </CardHeader>
        <CardContent>
          {revenueTypes.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Keine Verguetungsarten vorhanden. Erstellen Sie Ihre erste
              Verguetungsart.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Berechnungsart</TableHead>
                  <TableHead>Steuer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueTypes.map((rt) => (
                  <TableRow
                    key={rt.id}
                    className={!rt.isActive ? "opacity-50" : undefined}
                  >
                    <TableCell className="font-medium">{rt.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{rt.code}</Badge>
                    </TableCell>
                    <TableCell>
                      {CALC_TYPE_LABELS[rt.calculationType] ||
                        rt.calculationType}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rt.taxType === "EXEMPT" ? "outline" : "secondary"}>
                        {TAX_TYPE_LABELS[rt.taxType] || (rt.hasTax ? `${rt.taxRate}%` : "Befreit")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={rt.isActive ? "default" : "secondary"}
                        className={
                          rt.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }
                      >
                        {rt.isActive ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(rt)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteClick(rt)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? "Verguetungsart bearbeiten"
                : "Neue Verguetungsart"}
            </DialogTitle>
            <DialogDescription>
              Verguetungsarten werden fuer die Zuordnung von Netzbetreiber-Daten
              verwendet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rt-name">Name *</Label>
                <Input
                  id="rt-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="z.B. EEG-Verguetung"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rt-code">Code *</Label>
                <Input
                  id="rt-code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="z.B. EEG"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  Eindeutiger Kurzcode (wird automatisch in Grossbuchstaben
                  umgewandelt)
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rt-description">Beschreibung</Label>
              <Input
                id="rt-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optionale Beschreibung"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rt-calcType">Berechnungsart</Label>
                <Select
                  value={formData.calculationType}
                  onValueChange={(v) =>
                    setFormData({ ...formData, calculationType: v })
                  }
                >
                  <SelectTrigger id="rt-calcType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED_RATE">Fester Satz</SelectItem>
                    <SelectItem value="MARKET_PRICE">Marktpreis</SelectItem>
                    <SelectItem value="MANUAL">Manuell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rt-sortOrder">Reihenfolge</Label>
                <Input
                  id="rt-sortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sortOrder: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rt-taxType">Steuersatz-Zuordnung</Label>
              <Select
                value={formData.taxType}
                onValueChange={(v: string) =>
                  setFormData({ ...formData, taxType: v as TaxType })
                }
              >
                <SelectTrigger id="rt-taxType">
                  <SelectValue placeholder="Steuersatz waehlen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDARD">Standard (Regelsteuersatz)</SelectItem>
                  <SelectItem value="REDUCED">Ermaessigt</SelectItem>
                  <SelectItem value="EXEMPT">Steuerbefreit (0%)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Die konkreten Prozentsaetze werden zentral unter Steuersaetze verwaltet.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingId ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Verguetungsart loeschen"
        description={`Moechten Sie die Verguetungsart "${itemToDelete?.name}" wirklich loeschen? Falls Netzbetreiber-Daten diese verwenden, wird sie nur deaktiviert.`}
      />
    </div>
  );
}
