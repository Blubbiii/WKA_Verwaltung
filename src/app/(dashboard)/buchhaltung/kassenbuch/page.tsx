"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

interface CashBookEntry {
  id: string;
  entryDate: string;
  entryNumber: number;
  description: string;
  amount: string;
  runningBalance: string;
  account: string | null;
  receiptNumber: string | null;
  createdBy: { firstName: string | null; lastName: string | null };
}

function fmt(n: string | number): string {
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function KassenbuchPage() {
  const [entries, setEntries] = useState<CashBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    account: "",
    receiptNumber: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/kassenbuch");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setEntries(json.data || []);
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/buchhaltung/kassenbuch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
          account: form.account || undefined,
          receiptNumber: form.receiptNumber || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Kassenbucheintrag erstellt");
      setDialogOpen(false);
      setForm({ entryDate: new Date().toISOString().slice(0, 10), description: "", amount: "", account: "", receiptNumber: "" });
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  const lastBalance = entries.length > 0 ? Number(entries[entries.length - 1].runningBalance) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Kassenbuch" description="Bargeldbewegungen erfassen und verwalten" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Kassenbestand</div>
            <div className={`text-2xl font-bold font-mono ${lastBalance >= 0 ? "" : "text-red-600"}`}>{fmt(lastBalance)} EUR</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Eintraege</div>
            <div className="text-2xl font-bold">{entries.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center justify-center">
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Neuer Eintrag</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : entries.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Keine Kassenbucheintraege vorhanden.</div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Nr.</TableHead>
                    <TableHead className="w-[100px]">Datum</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead>Beleg</TableHead>
                    <TableHead>Gegenkonto</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono">{e.entryNumber}</TableCell>
                      <TableCell>{formatDate(e.entryDate)}</TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.receiptNumber || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{e.account || "-"}</TableCell>
                      <TableCell className={`text-right font-mono ${Number(e.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {fmt(e.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmt(e.runningBalance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Kassenbucheintrag</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Datum</Label><Input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} /></div>
              <div className="space-y-2"><Label>Betrag (EUR)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Positiv = Einnahme, Negativ = Ausgabe" /></div>
            </div>
            <div className="space-y-2"><Label>Beschreibung</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Belegnummer</Label><Input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} /></div>
              <div className="space-y-2"><Label>Gegenkonto (SKR03)</Label><Input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} placeholder="z.B. 4900" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={saving || !form.description || !form.amount}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
