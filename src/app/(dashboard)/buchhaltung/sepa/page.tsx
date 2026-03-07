"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
import { Download } from "lucide-react";

interface SepaBatch {
  id: string;
  batchNumber: string;
  executionDate: string;
  status: string;
  totalAmount: string;
  paymentCount: number;
  createdAt: string;
  createdBy: { firstName: string | null; lastName: string | null };
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Entwurf", variant: "secondary" },
  APPROVED: { label: "Freigegeben", variant: "outline" },
  EXPORTED: { label: "Exportiert", variant: "default" },
  CANCELLED: { label: "Storniert", variant: "destructive" },
};

function fmt(n: string | number): string {
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SepaPage() {
  const [batches, setBatches] = useState<SepaBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/sepa");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setBatches(json.data || []);
    } catch {
      toast.error("Fehler beim Laden der SEPA-Batches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function downloadXml(id: string, batchNumber: string) {
    try {
      const res = await fetch(`/api/buchhaltung/sepa/${id}?format=xml`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${batchNumber}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download fehlgeschlagen");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="SEPA-Export" description="SEPA Credit Transfer XML-Dateien (pain.001) erstellen und verwalten" />

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : batches.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              Noch keine SEPA-Batches erstellt. Erstellen Sie einen neuen Batch ueber die API.
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch-Nr.</TableHead>
                    <TableHead>Ausfuehrung</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="text-right">Zahlungen</TableHead>
                    <TableHead>Erstellt von</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => {
                    const badge = STATUS_BADGES[b.status] || STATUS_BADGES.DRAFT;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono">{b.batchNumber}</TableCell>
                        <TableCell>{new Date(b.executionDate).toLocaleDateString("de-DE")}</TableCell>
                        <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{fmt(b.totalAmount)} EUR</TableCell>
                        <TableCell className="text-right">{b.paymentCount}</TableCell>
                        <TableCell>{b.createdBy.firstName} {b.createdBy.lastName}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => downloadXml(b.id, b.batchNumber)}>
                            <Download className="h-4 w-4 mr-1" />XML
                          </Button>
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
