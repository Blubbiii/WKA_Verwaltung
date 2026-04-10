"use client";

import { useState, useEffect, useCallback } from "react";
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/sepa");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setBatches(json.data || []);
    } catch {
      toast.error(t("toastLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      toast.error(t("toastDownloadError"));
    }
  }

  return (
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
  );
}
