"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

interface DunningCandidate {
  invoiceId: string;
  invoiceNumber: string;
  recipientName: string;
  grossAmount: number;
  dueDate: string;
  overdueDays: number;
  currentLevel: number;
  suggestedLevel: number;
  feeAmount: number;
}

interface DunningRun {
  id: string;
  runDate: string;
  status: string;
  createdBy: { firstName: string | null; lastName: string | null };
  _count: { items: number };
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Zahlungserinnerung",
  2: "1. Mahnung",
  3: "2. Mahnung",
};

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MahnwesenContent() {
  const [candidates, setCandidates] = useState<DunningCandidate[]>([]);
  const [runs, setRuns] = useState<DunningRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [executing, setExecuting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [candRes, runsRes] = await Promise.all([
        fetch("/api/buchhaltung/dunning?mode=candidates"),
        fetch("/api/buchhaltung/dunning"),
      ]);
      if (candRes.ok) {
        const json = await candRes.json();
        setCandidates(json.data || []);
        setSelected(new Set((json.data || []).map((c: DunningCandidate) => c.invoiceId)));
      }
      if (runsRes.ok) {
        const json = await runsRes.json();
        setRuns(json.data || []);
      }
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function handleExecute() {
    if (selected.size === 0) return;
    setExecuting(true);
    try {
      const res = await fetch("/api/buchhaltung/dunning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: Array.from(selected) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      toast.success(`Mahnlauf erstellt: ${json.itemCount} Mahnungen`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Mahnlauf");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <Tabs defaultValue="candidates">
      <TabsList>
        <TabsTrigger value="candidates">Mahnkandidaten ({candidates.length})</TabsTrigger>
        <TabsTrigger value="history">Mahnlaeufe ({runs.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="candidates" className="mt-4">
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : candidates.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">Keine ueberfaelligen Rechnungen gefunden.</div>
            ) : (
              <>
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]" />
                        <TableHead>Rechnung</TableHead>
                        <TableHead>Empfaenger</TableHead>
                        <TableHead className="text-right">Betrag</TableHead>
                        <TableHead>Faellig seit</TableHead>
                        <TableHead className="text-right">Tage</TableHead>
                        <TableHead>Mahnstufe</TableHead>
                        <TableHead className="text-right">Gebuehr</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.map((c) => (
                        <TableRow key={c.invoiceId}>
                          <TableCell>
                            <Checkbox checked={selected.has(c.invoiceId)} onCheckedChange={() => toggleSelect(c.invoiceId)} />
                          </TableCell>
                          <TableCell className="font-mono">{c.invoiceNumber}</TableCell>
                          <TableCell>{c.recipientName}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(c.grossAmount)} EUR</TableCell>
                          <TableCell>{formatDate(c.dueDate)}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">{c.overdueDays}</TableCell>
                          <TableCell><Badge variant="outline">{LEVEL_LABELS[c.suggestedLevel] || `Stufe ${c.suggestedLevel}`}</Badge></TableCell>
                          <TableCell className="text-right font-mono">{fmt(c.feeAmount)} EUR</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{selected.size} von {candidates.length} ausgewaehlt</span>
                  <Button onClick={handleExecute} disabled={executing || selected.size === 0}>
                    {executing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Mahnlauf ausfuehren
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <Card>
          <CardContent className="pt-6">
            {runs.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">Noch keine Mahnlaeufe durchgefuehrt.</div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Mahnungen</TableHead>
                      <TableHead>Erstellt von</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>{formatDate(run.runDate)}</TableCell>
                        <TableCell><Badge variant={run.status === "EXECUTED" ? "default" : "secondary"}>{run.status}</Badge></TableCell>
                        <TableCell className="text-right">{run._count.items}</TableCell>
                        <TableCell>{run.createdBy.firstName} {run.createdBy.lastName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
