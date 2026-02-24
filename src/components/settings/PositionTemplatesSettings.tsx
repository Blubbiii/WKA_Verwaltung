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
import { Plus, Pencil, Trash2, Loader2, List, Info } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

interface PositionTemplate {
  id: string;
  name: string;
  description: string;
  category: string | null;
  unit: string;
  taxType: string;
  defaultPrice: number | null;
  sortOrder: number;
  isActive: boolean;
}

const TAX_TYPE_LABELS: Record<string, string> = {
  STANDARD: "19% MwSt",
  REDUCED: "7% MwSt",
  EXEMPT: "0% (steuerfrei)",
};

const DEFAULT_CATEGORIES = [
  "Pacht",
  "Ausschuettung",
  "Strom",
  "Verwaltung",
  "Sonstige",
];

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface TemplateFormData {
  name: string;
  description: string;
  category: string;
  unit: string;
  taxType: string;
  defaultPrice: string;
  sortOrder: number;
}

const EMPTY_FORM: TemplateFormData = {
  name: "",
  description: "",
  category: "",
  unit: "pauschal",
  taxType: "EXEMPT",
  defaultPrice: "",
  sortOrder: 0,
};

export function PositionTemplatesSettings() {
  const [templates, setTemplates] = useState<PositionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<PositionTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/position-templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.data || []);
      }
    } catch {
      toast.error("Fehler beim Laden der Vorlagen");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function handleAdd() {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  }

  function handleEdit(template: PositionTemplate) {
    setEditingId(template.id);
    setFormData({
      name: template.name,
      description: template.description,
      category: template.category || "",
      unit: template.unit,
      taxType: template.taxType,
      defaultPrice: template.defaultPrice != null ? String(template.defaultPrice) : "",
      sortOrder: template.sortOrder,
    });
    setDialogOpen(true);
  }

  function handleDeleteClick(template: PositionTemplate) {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!templateToDelete) return;
    try {
      const response = await fetch(`/api/admin/position-templates/${templateToDelete.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        toast.success("Vorlage gelöscht");
        fetchTemplates();
      } else {
        throw new Error("Fehler beim Löschen");
      }
    } catch {
      toast.error("Fehler beim Löschen der Vorlage");
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Beschreibung ist erforderlich");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: formData.category.trim() || null,
        unit: formData.unit,
        taxType: formData.taxType,
        defaultPrice: formData.defaultPrice ? parseFloat(formData.defaultPrice) : null,
        sortOrder: formData.sortOrder,
      };

      const url = editingId
        ? `/api/admin/position-templates/${editingId}`
        : "/api/admin/position-templates";

      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success(editingId ? "Vorlage aktualisiert" : "Vorlage erstellt");
      setDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  }

  // Group templates by category
  const grouped = templates.reduce<Record<string, PositionTemplate[]>>((acc, t) => {
    const cat = t.category || "Ohne Kategorie";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Placeholder Info */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Verfügbare Platzhalter in Beschreibungen:{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{currentYear}"}</code>{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{lastYear}"}</code>{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{currentMonth}"}</code>{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{currentQuarter}"}</code>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Positionsvorlagen
            </CardTitle>
            <CardDescription>
              Wiederverwendbare Vorlagen für Rechnungspositionen
            </CardDescription>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Neue Vorlage
          </Button>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Keine Positionsvorlagen vorhanden. Erstellen Sie Ihre erste Vorlage.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                    {category}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Beschreibung</TableHead>
                        <TableHead>Einheit</TableHead>
                        <TableHead>Steuer</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">
                            {template.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[300px] truncate">
                            {template.description}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{template.unit}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {TAX_TYPE_LABELS[template.taxType] || template.taxType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(template)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleDeleteClick(template)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Vorlage bearbeiten" : "Neue Vorlage erstellen"}
            </DialogTitle>
            <DialogDescription>
              Erstellen Sie eine wiederverwendbare Vorlage für Rechnungspositionen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Name *</Label>
              <Input
                id="tpl-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Mindestpacht, Gewinnausschuettung"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-description">Beschreibung (Vorlagetext) *</Label>
              <Input
                id="tpl-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="z.B. Gewinnausschuettung {lastYear}"
              />
              <p className="text-xs text-muted-foreground">
                Platzhalter: {"{currentYear}"}, {"{lastYear}"}, {"{currentMonth}"}, {"{currentQuarter}"}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tpl-category">Kategorie</Label>
                <Select
                  value={formData.category || "none"}
                  onValueChange={(v) => setFormData({ ...formData, category: v === "none" ? "" : v })}
                >
                  <SelectTrigger id="tpl-category">
                    <SelectValue placeholder="Keine" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine</SelectItem>
                    {DEFAULT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-unit">Einheit</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(v) => setFormData({ ...formData, unit: v })}
                >
                  <SelectTrigger id="tpl-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pauschal">pauschal</SelectItem>
                    <SelectItem value="Stueck">Stueck</SelectItem>
                    <SelectItem value="Stunden">Stunden</SelectItem>
                    <SelectItem value="Tage">Tage</SelectItem>
                    <SelectItem value="kWh">kWh</SelectItem>
                    <SelectItem value="MWh">MWh</SelectItem>
                    <SelectItem value="m2">m2</SelectItem>
                    <SelectItem value="ha">ha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tpl-taxType">Steuertyp</Label>
                <Select
                  value={formData.taxType}
                  onValueChange={(v) => setFormData({ ...formData, taxType: v })}
                >
                  <SelectTrigger id="tpl-taxType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXEMPT">0% (steuerfrei)</SelectItem>
                    <SelectItem value="REDUCED">7% MwSt</SelectItem>
                    <SelectItem value="STANDARD">19% MwSt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-defaultPrice">Standardpreis</Label>
                <Input
                  id="tpl-defaultPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.defaultPrice}
                  onChange={(e) => setFormData({ ...formData, defaultPrice: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-sortOrder">Reihenfolge</Label>
              <Input
                id="tpl-sortOrder"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
        title="Vorlage löschen"
        description={`Möchten Sie die Vorlage "${templateToDelete?.name}" wirklich löschen?`}
      />
    </div>
  );
}
