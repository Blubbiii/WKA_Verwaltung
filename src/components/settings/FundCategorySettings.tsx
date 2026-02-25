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
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, Loader2, Building2 } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

interface FundCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  _count?: { funds: number };
}

interface FormData {
  name: string;
  code: string;
  description: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
}

const EMPTY_FORM: FormData = {
  name: "",
  code: "",
  description: "",
  color: "#335E99",
  isActive: true,
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

export function FundCategorySettings() {
  const [categories, setCategories] = useState<FundCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FundCategory | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/fund-categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data.data || []);
      }
    } catch {
      toast.error("Fehler beim Laden der Gesellschaftstypen");
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

  function handleEdit(item: FundCategory) {
    setEditingId(item.id);
    setFormData({
      name: item.name,
      code: item.code,
      description: item.description || "",
      color: item.color || "#335E99",
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    });
    setDialogOpen(true);
  }

  function handleDeleteClick(item: FundCategory) {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!itemToDelete) return;
    try {
      const response = await fetch(
        `/api/admin/fund-categories/${itemToDelete.id}`,
        { method: "DELETE" }
      );
      if (response.ok) {
        const result = await response.json();
        toast.success(result.message || "Gesellschaftstyp gelöscht");
        fetchData();
      } else {
        throw new Error("Fehler beim Löschen");
      }
    } catch {
      toast.error("Fehler beim Löschen des Gesellschaftstyps");
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
        color: formData.color || null,
        isActive: formData.isActive,
        sortOrder: formData.sortOrder,
      };

      const url = editingId
        ? `/api/admin/fund-categories/${editingId}`
        : "/api/admin/fund-categories";

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
          ? "Gesellschaftstyp aktualisiert"
          : "Gesellschaftstyp erstellt"
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
              <Building2 className="h-5 w-5" />
              Gesellschaftstypen
            </CardTitle>
            <CardDescription>
              Kategorien für die Verwaltung von Gesellschaften (GmbH & Co. KG, GmbH etc.)
            </CardDescription>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Neuer Gesellschaftstyp
          </Button>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Keine Gesellschaftstypen vorhanden. Erstellen Sie Ihren ersten
              Gesellschaftstyp.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Farbe</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Zugeordnet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => (
                  <TableRow
                    key={cat.id}
                    className={!cat.isActive ? "opacity-50" : undefined}
                  >
                    <TableCell>
                      {cat.color && (
                        <div
                          className="h-6 w-6 rounded border border-gray-300"
                          style={{ backgroundColor: cat.color }}
                          title={cat.color}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{cat.code}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {cat.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {cat._count?.funds || 0} Gesellschaften
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={cat.isActive ? "default" : "secondary"}
                        className={
                          cat.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }
                      >
                        {cat.isActive ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(cat)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteClick(cat)}
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
                ? "Gesellschaftstyp bearbeiten"
                : "Neuer Gesellschaftstyp"}
            </DialogTitle>
            <DialogDescription>
              Gesellschaftstypen werden zur Kategorisierung von Gesellschaften verwendet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fc-name">Name *</Label>
                <Input
                  id="fc-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="z.B. GmbH & Co. KG"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fc-code">Code *</Label>
                <Input
                  id="fc-code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="z.B. GMBH_CO_KG"
                  maxLength={50}
                />
                <p className="text-xs text-muted-foreground">
                  GROSSBUCHSTABEN_UNTERSTRICHE
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fc-description">Beschreibung</Label>
              <Input
                id="fc-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optionale Beschreibung"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fc-color">Farbe</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="fc-color"
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="h-10 w-20 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    placeholder="#335E99"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fc-sortOrder">Sortierung</Label>
                <Input
                  id="fc-sortOrder"
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
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label>Aktiv</Label>
                <p className="text-xs text-muted-foreground">
                  Ist dieser Gesellschaftstyp aktiv und auswaehlbar?
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
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
        title="Gesellschaftstyp löschen"
        description={`Möchten Sie den Gesellschaftstyp "${itemToDelete?.name}" wirklich löschen? Falls Gesellschaften diese Kategorie verwenden, wird sie nur deaktiviert.`}
      />
    </div>
  );
}
