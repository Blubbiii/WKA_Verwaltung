"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
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
import { Download, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AwvWarningsAlert,
  type AwvWarning,
} from "@/components/buchhaltung/AwvWarningsAlert";

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

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DRAFT: "secondary",
  APPROVED: "outline",
  EXPORTED: "default",
  CANCELLED: "destructive",
};

function fmt(n: string | number): string {
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SepaContent() {
  const t = useTranslations("buchhaltung.zahlungenSepa");
  const [batches, setBatches] = useState<SepaBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [awvWarnings, setAwvWarnings] = useState<AwvWarning[] | null>(null);

  const statusLabel = useCallback(
    (status: string): string => {
      switch (status) {
        case "DRAFT": return t("statusDraft");
        case "APPROVED": return t("statusApproved");
        case "EXPORTED": return t("statusExported");
        case "CANCELLED": return t("statusCancelled");
        default: return t("statusDraft");
      }
    },
    [t]
  );

  // H-9: AbortController gegen Race-Conditions bei Tab-Wechsel.
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/sepa", { signal: ac.signal });
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (!ac.signal.aborted) setBatches(json.data || []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("toastLoadError"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  // AWV-Warnungen werden via Custom-Event publiziert. Andere Komponenten
  // (z.B. SEPA-Create-Dialog) feuern `wpm:sepa:awv-warnings` mit detail =
  // AwvWarning[] nach erfolgreichem POST /api/buchhaltung/sepa. Hier wird
  // der Dialog zur Anzeige automatisch geöffnet.
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<AwvWarning[]>).detail;
      if (Array.isArray(detail) && detail.length > 0) {
        setAwvWarnings(detail);
      }
    }
    window.addEventListener("wpm:sepa:awv-warnings", handler);
    return () => window.removeEventListener("wpm:sepa:awv-warnings", handler);
  }, []);

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
      toast.error(t("toastDownloadError"));
    }
  }

  return (
    <>
    <Card>
      <CardContent className="pt-6">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : batches.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            {t("emptyState")}
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colBatchNumber")}</TableHead>
                  <TableHead>{t("colExecution")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colAmount")}</TableHead>
                  <TableHead className="text-right">{t("colPayments")}</TableHead>
                  <TableHead>{t("colCreatedBy")}</TableHead>
                  <TableHead className="text-right">{t("colAction")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const variant = STATUS_VARIANTS[b.status] || STATUS_VARIANTS.DRAFT;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono">{b.batchNumber}</TableCell>
                      <TableCell>{formatDate(b.executionDate)}</TableCell>
                      <TableCell><Badge variant={variant}>{statusLabel(b.status)}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{fmt(b.totalAmount)} EUR</TableCell>
                      <TableCell className="text-right">{b.paymentCount}</TableCell>
                      <TableCell>{b.createdBy.firstName} {b.createdBy.lastName}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => downloadXml(b.id, b.batchNumber)}>
                          <Download className="h-4 w-4 mr-1" />{t("downloadXml")}
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

    <Dialog
      open={awvWarnings !== null && awvWarnings.length > 0}
      onOpenChange={(o) => !o && setAwvWarnings(null)}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            AWV-Meldepflicht erkannt
          </DialogTitle>
          <DialogDescription>
            Der SEPA-Lauf enthält meldepflichtige Auslandszahlungen.
            Eine manuelle Meldung an die Bundesbank ist erforderlich.
          </DialogDescription>
        </DialogHeader>
        {awvWarnings && (
          <AwvWarningsAlert warnings={awvWarnings} asCard={false} />
        )}
        <DialogFooter>
          <Button onClick={() => setAwvWarnings(null)}>
            Verstanden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
