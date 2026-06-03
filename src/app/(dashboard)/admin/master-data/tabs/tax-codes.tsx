"use client";

/**
 * P21: TaxCodes-Verwaltung als master-data-Tab.
 *
 * Tenant kann seine materialisierten TaxCodes ansehen und Overrides setzen
 * (DATEV-Code, Name, USt-Konto). Template-Daten (defaultRate, vatReportBox,
 * reverseCharge) sind read-only — die werden vom Super-Admin gepflegt.
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";

interface TaxCodeRow {
  id: string;
  code: string;
  templateId: string;
  template: {
    key: string;
    category: string;
    name: string;
    description: string | null;
    defaultRate: number;
    defaultVatReportBox: string | null;
    reverseCharge: boolean;
  };
  nameOverride: string | null;
  rateOverride: number | null;
  vatReportBoxOverride: string | null;
  taxAccount: { id: string; accountNumber: string; name: string } | null;
  taxAccountId: string | null;
  active: boolean;
  effective: {
    name: string;
    rate: number;
    vatReportBox: string | null;
    reverseCharge: boolean;
  };
}

function formatRate(r: number): string {
  return `${(r * 100).toFixed(2).replace(/\.00$/, "")} %`;
}

export default function TaxCodesTab() {
  const [codes, setCodes] = useState<TaxCodeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [editRow, setEditRow] = useState<TaxCodeRow | null>(null);
  const [editForm, setEditForm] = useState({
    code: "",
    nameOverride: "",
    rateOverride: "",
    vatReportBoxOverride: "",
    active: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/buchhaltung/tax-codes${includeInactive ? "?includeInactive=true" : ""}`,
      );
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setCodes(json.data ?? []);
    } catch {
      toast.error("Steuerschlüssel konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  const openEdit = (row: TaxCodeRow) => {
    setEditRow(row);
    setEditForm({
      code: row.code,
      nameOverride: row.nameOverride ?? "",
      rateOverride: row.rateOverride === null ? "" : String(row.rateOverride),
      vatReportBoxOverride: row.vatReportBoxOverride ?? "",
      active: row.active,
    });
  };

  const handleSave = async () => {
    if (!editRow) return;
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        code: editForm.code,
        nameOverride: editForm.nameOverride || null,
        rateOverride:
          editForm.rateOverride === "" ? null : Number(editForm.rateOverride),
        vatReportBoxOverride: editForm.vatReportBoxOverride || null,
        active: editForm.active,
      };
      const res = await fetch(`/api/buchhaltung/tax-codes/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Speichern fehlgeschlagen");
      }
      toast.success("Steuerschlüssel aktualisiert");
      setEditRow(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 pt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-6">
      <Card>
        <CardHeader>
          <CardTitle>Steuerschlüssel</CardTitle>
          <CardDescription>
            Tenant-spezifische DATEV-Schlüssel und USt-Konten. Die gesetzlichen
            Steuer-Kategorien (Default-Sätze, UStVA-Kennzahlen) werden vom
            Super-Admin gepflegt und sind read-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 mb-4">
            <Button
              variant={includeInactive ? "default" : "outline"}
              size="sm"
              onClick={() => setIncludeInactive(!includeInactive)}
            >
              {includeInactive ? "Nur aktive" : "Inaktive einbeziehen"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Aktualisieren
            </Button>
          </div>

          {codes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Noch keine Steuerschlüssel materialisiert.</p>
              <p className="text-sm mt-1">
                Beim ersten GET wird automatisch geseedet.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATEV-Code</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Anzeigename (effektiv)</TableHead>
                  <TableHead className="text-right">Satz</TableHead>
                  <TableHead>UStVA-Box</TableHead>
                  <TableHead>USt-Konto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => {
                  const hasOverride =
                    c.nameOverride !== null ||
                    c.rateOverride !== null ||
                    c.vatReportBoxOverride !== null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-semibold">
                        {c.code}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            c.effective.reverseCharge ? "secondary" : "outline"
                          }
                          className="text-xs"
                          title={c.template.description ?? undefined}
                        >
                          {c.template.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="truncate" title={c.effective.name}>
                          {c.effective.name}
                        </div>
                        {hasOverride && (
                          <div className="text-xs text-muted-foreground">
                            (Override aktiv)
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatRate(c.effective.rate)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {c.effective.vatReportBox ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {c.taxAccount
                          ? `${c.taxAccount.accountNumber} ${c.taxAccount.name}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {c.active ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Aktiv
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inaktiv</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit-Dialog */}
      <Dialog open={editRow !== null} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Steuerschlüssel{" "}
              <span className="font-mono">{editRow?.code}</span> bearbeiten
            </DialogTitle>
            <DialogDescription>
              Template:{" "}
              <span className="font-medium">{editRow?.template.name}</span>{" "}
              ({editRow?.template.category}). Felder leer lassen = Template-
              Default verwenden.
            </DialogDescription>
          </DialogHeader>

          {editRow && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>DATEV-Code</Label>
                <Input
                  value={editForm.code}
                  onChange={(e) =>
                    setEditForm({ ...editForm, code: e.target.value })
                  }
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>Name-Override (leer = Template)</Label>
                <Input
                  value={editForm.nameOverride}
                  onChange={(e) =>
                    setEditForm({ ...editForm, nameOverride: e.target.value })
                  }
                  placeholder={editRow.template.name}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Satz-Override (Dezimal)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={editForm.rateOverride}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        rateOverride: e.target.value,
                      })
                    }
                    placeholder={String(editRow.template.defaultRate)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: {formatRate(editRow.template.defaultRate)}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>UStVA-Box-Override</Label>
                  <Input
                    value={editForm.vatReportBoxOverride}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        vatReportBoxOverride: e.target.value,
                      })
                    }
                    placeholder={editRow.template.defaultVatReportBox ?? "—"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: {editRow.template.defaultVatReportBox ?? "keine"}
                  </p>
                </div>
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
            <Button onClick={handleSave} disabled={isSaving}>
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
