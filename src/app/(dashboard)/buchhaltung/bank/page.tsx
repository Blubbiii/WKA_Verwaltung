"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Upload, Loader2, Check, X, HelpCircle } from "lucide-react";

interface BankTx {
  id: string;
  bookingDate: string;
  amount: string;
  currency: string;
  counterpartName: string | null;
  reference: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  matchedInvoice: {
    id: string;
    invoiceNumber: string;
    grossAmount: string;
    recipientName: string;
  } | null;
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  MATCHED: { label: "Zugeordnet", variant: "default" },
  SUGGESTED: { label: "Vorschlag", variant: "outline" },
  UNMATCHED: { label: "Offen", variant: "destructive" },
  IGNORED: { label: "Ignoriert", variant: "secondary" },
};

function fmt(n: string | number): string {
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BankPage() {
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "ALL") params.set("status", filter);
      const res = await fetch(`/api/buchhaltung/bank/transactions?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setTransactions(json.data || []);
      setTotal(json.total || 0);
    } catch {
      toast.error("Fehler beim Laden der Transaktionen");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/buchhaltung/bank/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      toast.success(`${json.imported} Transaktionen importiert (${json.matched} zugeordnet, ${json.suggested} Vorschlaege)`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAction(id: string, action: "match" | "ignore" | "unmatch", invoiceId?: string) {
    try {
      const res = await fetch(`/api/buchhaltung/bank/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, invoiceId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(action === "match" ? "Zugeordnet" : action === "ignore" ? "Ignoriert" : "Zuordnung aufgehoben");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aktion fehlgeschlagen");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bankimport" description="MT940/CAMT Kontoauszuege importieren und Zahlungen zuordnen" />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div>
              <input ref={fileRef} type="file" accept=".sta,.mt940,.txt,.xml" className="hidden" onChange={handleUpload} />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Kontoauszug importieren
              </Button>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Alle Status</SelectItem>
                <SelectItem value="UNMATCHED">Offen</SelectItem>
                <SelectItem value="SUGGESTED">Vorschlaege</SelectItem>
                <SelectItem value="MATCHED">Zugeordnet</SelectItem>
                <SelectItem value="IGNORED">Ignoriert</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{total} Transaktionen</span>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : transactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Keine Transaktionen vorhanden. Importieren Sie einen Kontoauszug.</div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Datum</TableHead>
                    <TableHead className="text-right w-[100px]">Betrag</TableHead>
                    <TableHead>Auftraggeber</TableHead>
                    <TableHead>Verwendungszweck</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead>Zugeordnet zu</TableHead>
                    <TableHead className="w-[120px] text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const badge = STATUS_BADGES[tx.matchStatus] || STATUS_BADGES.UNMATCHED;
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-sm">{new Date(tx.bookingDate).toLocaleDateString("de-DE")}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${Number(tx.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {fmt(tx.amount)} {tx.currency}
                        </TableCell>
                        <TableCell className="text-sm">{tx.counterpartName || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{tx.reference || "-"}</TableCell>
                        <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                        <TableCell className="text-sm">{tx.matchedInvoice?.invoiceNumber || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {tx.matchStatus === "SUGGESTED" && tx.matchedInvoice && (
                              <Button size="icon" variant="ghost" title="Zuordnung bestaetigen"
                                onClick={() => handleAction(tx.id, "match", tx.matchedInvoice!.id)}>
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            {tx.matchStatus !== "IGNORED" && tx.matchStatus !== "MATCHED" && (
                              <Button size="icon" variant="ghost" title="Ignorieren"
                                onClick={() => handleAction(tx.id, "ignore")}>
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                            {tx.matchStatus === "MATCHED" && (
                              <Button size="icon" variant="ghost" title="Zuordnung aufheben"
                                onClick={() => handleAction(tx.id, "unmatch")}>
                                <HelpCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
