"use client";

/**
 * C-1 Sprint 5: Kapitalflussrechnung DRS 21.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface CashflowLine {
  position: string;
  label: string;
  amount: number;
  isSummary?: boolean;
  indent?: number;
}

interface CashflowResult {
  fiscalYear: number;
  cfo: number;
  cfi: number;
  cff: number;
  netChange: number;
  cashStart: number;
  cashEnd: number;
  validationDifference: number;
  lines: CashflowLine[];
  warnings: string[];
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CashflowPage() {
  const t = useTranslations("cashflow");
  const [data, setData] = useState<CashflowResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

  // H-9: AbortController um stale Requests bei FiscalYear-Wechsel zu cancelln.
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`/api/buchhaltung/cashflow?fiscalYear=${fiscalYear}`, { signal: ac.signal });
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (!ac.signal.aborted) setData(json.data || null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("loadError"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [fiscalYear, t]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div className="space-y-1">
              <Label>{t("fiscalYear")}</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                className="w-32"
              />
            </div>
            <Button variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data ? (
            <div className="text-center text-muted-foreground py-12">
              {t("noData")}
            </div>
          ) : (
            <>
              {data.warnings.length > 0 && (
                <Alert variant="default" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t("warningsTitle")}</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 mt-1">
                      {data.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {t("cfo")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold font-mono ${data.cfo < 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {fmt(data.cfo)} €
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {t("cfi")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold font-mono ${data.cfi < 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {fmt(data.cfi)} €
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {t("cff")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold font-mono ${data.cff < 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {fmt(data.cff)} €
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableBody>
                    {data.lines.map((line, i) => (
                      <TableRow
                        key={i}
                        className={
                          line.isSummary
                            ? "font-bold border-t-2 bg-muted/30"
                            : ""
                        }
                      >
                        <TableCell className="w-16 text-muted-foreground font-mono text-xs">
                          {line.position}
                        </TableCell>
                        <TableCell
                          style={{ paddingLeft: line.indent ? `${1 + line.indent * 1.5}rem` : undefined }}
                        >
                          {line.label}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${line.amount < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                        >
                          {fmt(line.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex justify-end gap-3 text-sm">
                <Badge variant="outline">
                  {t("validationDifference", { amount: fmt(data.validationDifference) })}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
