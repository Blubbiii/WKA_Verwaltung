"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Loader2, Play } from "lucide-react";

interface FixedAsset {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: string;
  usefulLifeMonths: number;
  depreciationMethod: string;
  residualValue: string;
  status: string;
  depreciations: Array<{ bookValue: string; periodEnd: string }>;
}

function fmt(n: string | number): string {
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktiv",
  DISPOSED: "Abgegangen",
  FULLY_DEPRECIATED: "Voll abgeschrieben",
};

export default function AnlagenPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assetNumber: "", name: "", category: "WEA", acquisitionDate: "", acquisitionCost: "",
    usefulLifeMonths: "240", depreciationMethod: "LINEAR", residualValue: "0",
    accountNumber: "0310", depAccountNumber: "4831",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/assets");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setAssets(json.data || []);
    } catch {
      toast.error("Fehler beim Laden der Anlagen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/buchhaltung/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          acquisitionCost: parseFloat(form.acquisitionCost),
          usefulLifeMonths: parseInt(form.usefulLifeMonths),
          residualValue: parseFloat(form.residualValue || "0"),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Anlage erstellt");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunDepreciation() {
    const now = new Date();
    const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const periodEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;

    try {
      const res = await fetch("/api/buchhaltung/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "depreciate", periodStart, periodEnd, createPostings: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      toast.success(`AfA-Lauf: ${json.processedCount} Anlagen, ${fmt(json.totalAmount)} EUR`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AfA-Lauf fehlgeschlagen");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Anlagenbuchhaltung" description="Anlagevermoegen und Abschreibungen (AfA) verwalten" />

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 mb-6">
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Neue Anlage</Button>
            <Button variant="outline" onClick={handleRunDepreciation}><Play className="h-4 w-4 mr-2" />AfA-Lauf (aktueller Monat)</Button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : assets.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Keine Anlagen vorhanden.</div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr.</TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Anschaffung</TableHead>
                    <TableHead className="text-right">AHK</TableHead>
                    <TableHead className="text-right">Buchwert</TableHead>
                    <TableHead>ND (Mon.)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((a) => {
                    const bookValue = a.depreciations[0]?.bookValue ?? a.acquisitionCost;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono">{a.assetNumber}</TableCell>
                        <TableCell>{a.name}</TableCell>
                        <TableCell>{a.category}</TableCell>
                        <TableCell>{new Date(a.acquisitionDate).toLocaleDateString("de-DE")}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(a.acquisitionCost)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(bookValue)}</TableCell>
                        <TableCell>{a.usefulLifeMonths}</TableCell>
                        <TableCell><Badge variant={a.status === "ACTIVE" ? "default" : "secondary"}>{STATUS_LABELS[a.status] || a.status}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Anlage erfassen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Anlagen-Nr.</Label><Input value={form.assetNumber} onChange={(e) => setForm({ ...form, assetNumber: e.target.value })} /></div>
              <div className="space-y-2"><Label>Kategorie</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Bezeichnung</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Anschaffungsdatum</Label><Input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} /></div>
              <div className="space-y-2"><Label>Anschaffungskosten (EUR)</Label><Input type="number" value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nutzungsdauer (Monate)</Label><Input type="number" value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>AfA-Methode</Label>
                <Select value={form.depreciationMethod} onValueChange={(v) => setForm({ ...form, depreciationMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LINEAR">Linear</SelectItem>
                    <SelectItem value="DECLINING_BALANCE">Degressiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={saving || !form.assetNumber || !form.name || !form.acquisitionCost || !form.acquisitionDate || !form.usefulLifeMonths}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
