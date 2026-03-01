"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ============================================================================
// TYPES
// ============================================================================

interface JournalLine {
  id?: string;
  lineNumber: number;
  account: string;
  accountName: string;
  description: string;
  debitAmount: string;   // string for form input
  creditAmount: string;
  taxKey: string;
  costCenter: string;
}

interface JournalEntry {
  id: string;
  entryDate: string;
  description: string;
  reference: string | null;
  status: "DRAFT" | "POSTED";
  createdAt: string;
  createdBy: { firstName: string | null; lastName: string | null } | null;
  lines: {
    id: string;
    lineNumber: number;
    account: string;
    accountName: string | null;
    debitAmount: string | null;
    creditAmount: string | null;
  }[];
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("de-DE");
}

function formatCurrency(n: string | number | null | undefined): string {
  if (n === null || n === undefined) return "";
  const val = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(val) || val === 0) return "";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(",", ".")) || 0;
}

function emptyLine(lineNumber: number): JournalLine {
  return {
    lineNumber,
    account: "",
    accountName: "",
    description: "",
    debitAmount: "",
    creditAmount: "",
    taxKey: "",
    costCenter: "",
  };
}

// ============================================================================
// JOURNAL ENTRY FORM DIALOG
// ============================================================================

interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: JournalEntry | null;  // null = new entry
}

function EntryFormDialog({ open, onClose, onSaved, editing }: FormDialogProps) {
  const [entryDate, setEntryDate] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(1), emptyLine(2)]);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (editing) {
      setEntryDate(editing.entryDate.slice(0, 10));
      setDescription(editing.description);
      setReference(editing.reference ?? "");
      setLines(
        editing.lines.map((l) => ({
          id: l.id,
          lineNumber: l.lineNumber,
          account: l.account,
          accountName: l.accountName ?? "",
          description: "",
          debitAmount: l.debitAmount ? parseFloat(l.debitAmount).toFixed(2) : "",
          creditAmount: l.creditAmount ? parseFloat(l.creditAmount).toFixed(2) : "",
          taxKey: "",
          costCenter: "",
        }))
      );
    } else {
      setEntryDate(new Date().toISOString().slice(0, 10));
      setDescription("");
      setReference("");
      setLines([emptyLine(1), emptyLine(2)]);
    }
  }, [editing, open]);

  const totalDebit = lines.reduce((s, l) => s + parseAmount(l.debitAmount), 0);
  const totalCredit = lines.reduce((s, l) => s + parseAmount(l.creditAmount), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine(prev.length + 1)]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((l, i) => ({ ...l, lineNumber: i + 1 }))
    );
  };

  const updateLine = (idx: number, field: keyof JournalLine, value: string) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  };

  const buildPayload = () => ({
    entryDate: new Date(entryDate).toISOString(),
    description,
    reference: reference || undefined,
    lines: lines.map((l) => ({
      lineNumber: l.lineNumber,
      account: l.account,
      accountName: l.accountName || undefined,
      description: l.description || undefined,
      debitAmount: parseAmount(l.debitAmount) || undefined,
      creditAmount: parseAmount(l.creditAmount) || undefined,
      taxKey: l.taxKey || undefined,
      costCenter: l.costCenter || undefined,
    })),
  });

  const handleSave = async () => {
    if (!description.trim()) { toast.error("Beschreibung fehlt"); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/journal-entries/${editing.id}` : "/api/journal-entries";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Fehler beim Speichern"); return; }
      toast.success(editing ? "Buchung aktualisiert" : "Buchung gespeichert");
      onSaved();
    } catch { toast.error("Verbindungsfehler"); }
    finally { setSaving(false); }
  };

  const handlePost = async () => {
    if (!balanced) { toast.error("Soll ≠ Haben — Buchung nicht ausgeglichen"); return; }
    setPosting(true);
    try {
      // Save first if new
      let id = editing?.id;
      if (!id) {
        if (!description.trim()) { toast.error("Beschreibung fehlt"); return; }
        const res = await fetch("/api/journal-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || "Fehler beim Speichern"); return; }
        id = data.id;
      } else {
        // Update first
        const res = await fetch(`/api/journal-entries/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        if (!res.ok) { const d = await res.json(); toast.error(d.error || "Fehler"); return; }
      }

      // Then post
      const postRes = await fetch(`/api/journal-entries/${id}/post`, { method: "POST" });
      const postData = await postRes.json();
      if (!postRes.ok) { toast.error(postData.error || "Fehler beim Buchen"); return; }
      toast.success("Buchung erfolgreich gebucht");
      onSaved();
    } catch { toast.error("Verbindungsfehler"); }
    finally { setPosting(false); }
  };

  const isReadOnly = editing?.status === "POSTED";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReadOnly
              ? "Buchung ansehen"
              : editing
              ? "Buchung bearbeiten"
              : "Neue Buchung"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="entryDate">Datum</Label>
              <Input
                id="entryDate"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="z.B. Abgrenzung Wartungskosten März"
                disabled={isReadOnly}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reference">Beleg-Nr. (optional)</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="K-001"
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Lines table */}
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium w-8">#</th>
                  <th className="text-left py-2 px-3 font-medium w-28">Konto</th>
                  <th className="text-left py-2 px-3 font-medium">Bezeichnung</th>
                  <th className="text-right py-2 px-3 font-medium w-32">Soll (€)</th>
                  <th className="text-right py-2 px-3 font-medium w-32">Haben (€)</th>
                  {!isReadOnly && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="py-1.5 px-3 text-muted-foreground">{line.lineNumber}</td>
                    <td className="py-1.5 px-2">
                      <Input
                        value={line.account}
                        onChange={(e) => updateLine(idx, "account", e.target.value)}
                        placeholder="4210"
                        className="h-7 text-sm font-mono"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        value={line.accountName}
                        onChange={(e) => updateLine(idx, "accountName", e.target.value)}
                        placeholder="Pachtaufwand"
                        className="h-7 text-sm"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        value={line.debitAmount}
                        onChange={(e) => {
                          updateLine(idx, "debitAmount", e.target.value);
                          if (e.target.value) updateLine(idx, "creditAmount", "");
                        }}
                        placeholder="0,00"
                        className="h-7 text-sm text-right font-mono"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input
                        value={line.creditAmount}
                        onChange={(e) => {
                          updateLine(idx, "creditAmount", e.target.value);
                          if (e.target.value) updateLine(idx, "debitAmount", "");
                        }}
                        placeholder="0,00"
                        className="h-7 text-sm text-right font-mono"
                        disabled={isReadOnly}
                      />
                    </td>
                    {!isReadOnly && (
                      <td className="py-1.5 px-1">
                        {lines.length > 2 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => removeLine(idx)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isReadOnly && (
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-1.5" />
              Zeile hinzufügen
            </Button>
          )}

          {/* Balance indicator */}
          <div
            className={`flex items-center gap-3 text-sm px-3 py-2 rounded-md ${
              balanced
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
            }`}
          >
            {balanced ? <CheckCircle2 className="h-4 w-4" /> : null}
            <span>
              Σ Soll:{" "}
              <strong>
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(totalDebit)}
              </strong>
              {"  |  "}Σ Haben:{" "}
              <strong>
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(totalCredit)}
              </strong>
              {balanced ? "  ✓" : "  — nicht ausgeglichen"}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {isReadOnly ? "Schließen" : "Abbrechen"}
          </Button>
          {!isReadOnly && (
            <>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving || posting}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Als Entwurf speichern
              </Button>
              <Button
                onClick={handlePost}
                disabled={saving || posting || !balanced}
              >
                {posting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Buchen
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>(String(new Date().getFullYear()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (yearFilter) params.set("year", yearFilter);
      const res = await fetch(`/api/journal-entries?${params}`);
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, [statusFilter, yearFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/journal-entries/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Buchung gelöscht");
        setEntries((prev) => prev.filter((e) => e.id !== id));
      } else {
        const d = await res.json();
        toast.error(d.error || "Fehler beim Löschen");
      }
    } catch { toast.error("Verbindungsfehler"); }
    finally { setDeletingId(null); }
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // Compute KPIs
  const draftCount = entries.filter((e) => e.status === "DRAFT").length;
  const postedCount = entries.filter((e) => e.status === "POSTED").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Buchungsjournal</h1>
            <p className="text-sm text-muted-foreground">
              Manuelle Soll/Haben-Buchungen mit SKR03-Konten
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
          <Button
            size="sm"
            onClick={() => { setEditingEntry(null); setDialogOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Neue Buchung
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Gesamt</p>
            <p className="text-3xl font-bold mt-1">{entries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Entwürfe</p>
            <p className="text-3xl font-bold mt-1 text-amber-600 dark:text-amber-400">
              {draftCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Gebucht</p>
            <p className="text-3xl font-bold mt-1 text-green-700 dark:text-green-400">
              {postedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Buchungen</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="DRAFT">Entwürfe</SelectItem>
                <SelectItem value="POSTED">Gebucht</SelectItem>
              </SelectContent>
            </Select>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="h-8 w-24 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-3" />
              Wird geladen…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-muted-foreground gap-2">
              <BookOpen className="h-10 w-10 opacity-30" />
              <p className="text-sm">Keine Buchungen vorhanden</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => { setEditingEntry(null); setDialogOpen(true); }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Erste Buchung erstellen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Beleg</TableHead>
                  <TableHead className="text-right">Σ Soll</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const totalDebit = entry.lines.reduce(
                    (s, l) => s + (l.debitAmount ? parseFloat(l.debitAmount) : 0),
                    0
                  );

                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => {
                        setEditingEntry(entry);
                        setDialogOpen(true);
                      }}
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(entry.entryDate)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[280px]">
                        <p className="truncate">{entry.description}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(totalDebit)}
                      </TableCell>
                      <TableCell>
                        {entry.status === "POSTED" ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Gebucht
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Entwurf
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {entry.status === "DRAFT" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingEntry(entry);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(entry.id);
                                }}
                                disabled={deletingId === entry.id}
                              >
                                {deletingId === entry.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EntryFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); load(); }}
        editing={editingEntry}
      />
    </div>
  );
}
