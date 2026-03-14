"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2, Landmark } from "lucide-react";

interface BankAccount {
  id: string;
  name: string;
  iban: string;
  bic: string | null;
  bankName: string | null;
  currency: string;
  currentBalance: number | null;
  balanceDate: string | null;
  isActive: boolean;
  fund: { id: string; name: string } | null;
  _count: { transactions: number };
}

function fmt(n: number | null | string): string {
  if (n === null) return "-";
  const num = typeof n === "string" ? parseFloat(n) : n;
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export default function BankKontenContent() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [balance, setBalance] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/bank/accounts");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setAccounts(json.data || []);
    } catch {
      toast.error("Bankkonten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  function resetForm() {
    setName("");
    setIban("");
    setBic("");
    setBankName("");
    setBalance("");
    setEditId(null);
  }

  function openEdit(acc: BankAccount) {
    setEditId(acc.id);
    setName(acc.name);
    setIban(acc.iban);
    setBic(acc.bic || "");
    setBankName(acc.bankName || "");
    setBalance(acc.currentBalance != null ? String(acc.currentBalance) : "");
    setDialogOpen(true);
  }

  async function saveAccount() {
    if (!name.trim() || !iban.trim()) {
      toast.error("Name und IBAN sind Pflichtfelder");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        iban: iban.replace(/\s/g, ""),
        bic: bic || null,
        bankName: bankName || null,
        currentBalance: balance ? parseFloat(balance) : null,
      };

      const url = editId
        ? `/api/buchhaltung/bank/accounts/${editId}`
        : "/api/buchhaltung/bank/accounts";

      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler");
      }

      toast.success(editId ? "Konto aktualisiert" : "Konto erstellt");
      setDialogOpen(false);
      resetForm();
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(id: string) {
    if (!confirm("Bankkonto wirklich deaktivieren?")) return;
    try {
      const res = await fetch(`/api/buchhaltung/bank/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Bankkonto deaktiviert");
      fetchAccounts();
    } catch {
      toast.error("Fehler beim Deaktivieren");
    }
  }

  const totalBalance = accounts.reduce((sum, a) => {
    const b = a.currentBalance != null ? (typeof a.currentBalance === "string" ? parseFloat(a.currentBalance as string) : a.currentBalance) : 0;
    return sum + b;
  }, 0);

  return (
    <>
      {/* Summary */}
      {!loading && accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground">Konten</div>
              <div className="text-2xl font-bold">{accounts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground">Gesamtsaldo</div>
              <div className={`text-2xl font-bold font-mono ${totalBalance < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                {fmt(totalBalance)} €
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground">Transaktionen</div>
              <div className="text-2xl font-bold">
                {accounts.reduce((sum, a) => sum + a._count.transactions, 0)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 mb-6">
            <Button variant="outline" onClick={fetchAccounts}>
              <RefreshCw className="h-4 w-4 mr-2" />Aktualisieren
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />Neues Konto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editId ? "Konto bearbeiten" : "Neues Bankkonto"}</DialogTitle>
                  <DialogDescription>Bankkonto-Daten eingeben</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>Bezeichnung *</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Geschäftskonto Sparkasse" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>IBAN *</Label>
                      <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE89..." disabled={!!editId} />
                    </div>
                    <div className="space-y-1">
                      <Label>BIC</Label>
                      <Input value={bic} onChange={(e) => setBic(e.target.value)} placeholder="COBADEFFXXX" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Bankname</Label>
                      <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Sparkasse" />
                    </div>
                    <div className="space-y-1">
                      <Label>Aktueller Saldo (€)</Label>
                      <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
                  <Button onClick={saveAccount} disabled={saving}>
                    {saving ? "Speichere..." : editId ? "Aktualisieren" : "Erstellen"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : accounts.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Landmark className="h-12 w-12 mx-auto mb-4 opacity-30" />
              Noch keine Bankkonten angelegt.
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead>IBAN</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Gesellschaft</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Buchungen</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((acc) => (
                    <TableRow key={acc.id}>
                      <TableCell className="font-medium">{acc.name}</TableCell>
                      <TableCell className="font-mono text-sm">{formatIban(acc.iban)}</TableCell>
                      <TableCell className="text-sm">{acc.bankName || "-"}</TableCell>
                      <TableCell>
                        {acc.fund ? (
                          <Badge variant="outline">{acc.fund.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${acc.currentBalance != null && parseFloat(String(acc.currentBalance)) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {fmt(acc.currentBalance)} €
                      </TableCell>
                      <TableCell className="text-right">{acc._count.transactions}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(acc)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteAccount(acc.id)}>
                            <Trash2 className="h-4 w-4" />
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
    </>
  );
}
