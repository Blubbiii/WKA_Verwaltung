"use client";

/**
 * P24.2: Super-Admin Pflege der globalen TaxCategoryTemplates.
 *
 * Diese Templates sind die "Source of Truth" für alle Tenants — sie
 * definieren die gesetzlichen Steuer-Kategorien (USt 19%, Reverse-Charge,
 * IGE/IGL, etc.) mit Default-Sätzen und UStVA-Kennzahlen.
 */

import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Pencil,
  Info,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface TaxTemplate {
  id: string;
  key: string;
  category: string;
  name: string;
  description: string | null;
  defaultRate: number;
  defaultVatReportBox: string | null;
  reverseCharge: boolean;
  sortOrder: number;
  active: boolean;
}

function formatRate(r: number): string {
  return `${(r * 100).toFixed(2).replace(/\.00$/, "")} %`;
}

export default function TaxCategoryTemplatesPage() {
  const [templates, setTemplates] = useState<TaxTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editRow, setEditRow] = useState<TaxTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    defaultRate: "",
    defaultVatReportBox: "",
    reverseCharge: false,
    sortOrder: 0,
    active: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        "/api/superadmin/tax-category-templates?includeInactive=true",
      );
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setTemplates(json.data ?? []);
    } catch {
      toast.error("Templates konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openEdit = (row: TaxTemplate) => {
    setEditRow(row);
    setEditForm({
      name: row.name,
      description: row.description ?? "",
      defaultRate: String(row.defaultRate),
      defaultVatReportBox: row.defaultVatReportBox ?? "",
      reverseCharge: row.reverseCharge,
      sortOrder: row.sortOrder,
      active: row.active,
    });
  };

  const handleSave = async () => {
    if (!editRow) return;
    setIsSaving(true);
    try {
      const rate = Number(editForm.defaultRate);
      if (isNaN(rate) || rate < 0 || rate > 1) {
        throw new Error("Satz muss zwischen 0 und 1 liegen (z.B. 0.19 für 19%)");
      }
      const res = await fetch(
        `/api/superadmin/tax-category-templates/${editRow.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editForm.name,
            description: editForm.description || null,
            defaultRate: rate,
            defaultVatReportBox: editForm.defaultVatReportBox || null,
            reverseCharge: editForm.reverseCharge,
            sortOrder: editForm.sortOrder,
            active: editForm.active,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Speichern fehlgeschlagen");
      }
      toast.success("Template aktualisiert");
      setEditRow(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Steuer-Kategorie-Templates"
        description="Globale gesetzliche Steuer-Kategorien für alle Mandanten"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Diese Templates sind global und gelten für ALLE Tenants. Tenants
          materialisieren sie als TaxCodes mit eigenen DATEV-Schlüsseln und
          können einzelne Felder per Override anpassen (Name, Satz, UStVA-Box).
          Bei einer Gesetzesänderung (z.B. neue UStVA-Kennzahl) hier ändern.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Aktualisieren
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Templates ({templates.length})</CardTitle>
            <CardDescription>
              Stand 01.06.2026 — pre-geseedet mit den 9 Default-Kategorien
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Satz</TableHead>
                  <TableHead>UStVA-Box</TableHead>
                  <TableHead className="text-center">Reverse-Charge</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm">{t.key}</TableCell>
                    <TableCell className="font-medium max-w-md">
                      <div className="truncate" title={t.name}>
                        {t.name}
                      </div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground truncate" title={t.description}>
                          {t.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatRate(t.defaultRate)}
                    </TableCell>
                    <TableCell className="font-mono">
                      {t.defaultVatReportBox ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {t.reverseCharge ? (
                        <Badge variant="secondary">Ja</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={t.active ? "default" : "outline"}>
                        {t.active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={editRow !== null} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Template{" "}
              <span className="font-mono">{editRow?.key}</span> bearbeiten
            </DialogTitle>
            <DialogDescription>
              Kategorie: <span className="font-mono">{editRow?.category}</span>
            </DialogDescription>
          </DialogHeader>

          {editRow && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name (Anzeige)</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Beschreibung</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Default-Satz</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={editForm.defaultRate}
                    onChange={(e) =>
                      setEditForm({ ...editForm, defaultRate: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    z.B. 0.19 für 19%
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>UStVA-Box</Label>
                  <Input
                    value={editForm.defaultVatReportBox}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        defaultVatReportBox: e.target.value,
                      })
                    }
                    placeholder="z.B. 81"
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Sort-Order</Label>
                  <Input
                    type="number"
                    value={editForm.sortOrder}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        sortOrder: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="rc">Reverse-Charge (§13b)</Label>
                <Switch
                  id="rc"
                  checked={editForm.reverseCharge}
                  onCheckedChange={(v) =>
                    setEditForm({ ...editForm, reverseCharge: v })
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="active">Aktiv</Label>
                <Switch
                  id="active"
                  checked={editForm.active}
                  onCheckedChange={(v) =>
                    setEditForm({ ...editForm, active: v })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditRow(null)}
              disabled={isSaving}
            >
              Abbrechen
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
