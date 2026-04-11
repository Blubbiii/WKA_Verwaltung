"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";
import {
  Calendar,
  Euro,
  Eye,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Park {
  id: string;
  name: string;
  shortName: string | null;
}

interface PreviewInvoice {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  recipientName?: string;
  amount?: number;
  error?: string;
}

interface GenerateResult {
  success: boolean;
  status: string;
  dryRun: boolean;
  period: {
    month: number;
    year: number;
    monthName: string;
    label: string;
  };
  summary: {
    invoicesCreated: number;
    totalAmount: number;
    totalProcessed: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  errorMessage?: string;
  invoices: PreviewInvoice[];
}

export default function LeaseAdvancesPage() {
  const t = useTranslations("leases.advances");
  const MONTH_NAMES = [
    t("months.1"),
    t("months.2"),
    t("months.3"),
    t("months.4"),
    t("months.5"),
    t("months.6"),
    t("months.7"),
    t("months.8"),
    t("months.9"),
    t("months.10"),
    t("months.11"),
    t("months.12"),
  ];
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [parkId, setParkId] = useState<string>("all");
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewResult, setPreviewResult] = useState<GenerateResult | null>(
    null
  );
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(
    null
  );
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fetchParks = useCallback(async () => {
    try {
      const response = await fetch("/api/parks?limit=100");
      if (response.ok) {
        const data = await response.json();
        setParks(data.data || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchParks();
  }, [fetchParks]);

  // Reset results when parameters change
  useEffect(() => {
    setPreviewResult(null);
    setGenerateResult(null);
  }, [year, month, parkId]);

  async function handlePreview() {
    setLoading(true);
    setPreviewResult(null);
    setGenerateResult(null);

    try {
      const response = await fetch(
        "/api/admin/billing-rules/generate-advances",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month,
            year,
            parkId: parkId !== "all" ? parkId : undefined,
            dryRun: true,
          }),
        }
      );

      const data: GenerateResult = await response.json();

      if (!response.ok && response.status !== 422) {
        toast.error(data.errorMessage || t("previewError"));
        return;
      }

      setPreviewResult(data);

      if (data.summary.successful === 0) {
        toast.info(t("noAdvances"));
      } else {
        toast.success(
          t("previewToast", { count: data.summary.successful, total: formatCurrency(data.summary.totalAmount) })
        );
      }
    } catch {
      toast.error(t("previewError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);

    try {
      const response = await fetch(
        "/api/admin/billing-rules/generate-advances",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month,
            year,
            parkId: parkId !== "all" ? parkId : undefined,
            dryRun: false,
          }),
        }
      );

      const data: GenerateResult = await response.json();

      if (!response.ok && response.status !== 422) {
        toast.error(data.errorMessage || t("generateError"));
        return;
      }

      setGenerateResult(data);
      setPreviewResult(null);

      if (data.summary.invoicesCreated > 0) {
        toast.success(
          t("createdToast", { count: data.summary.invoicesCreated })
        );
      } else {
        toast.info(t("noneCreated"));
      }
    } catch {
      toast.error(t("generateErrorAdvances"));
    } finally {
      setGenerating(false);
      setShowConfirmDialog(false);
    }
  }

  const activeResult = generateResult || previewResult;
  const isPreview = !generateResult && !!previewResult;

  // Available years (current year +/- 2)
  const years = Array.from(
    { length: 5 },
    (_, i) => now.getFullYear() - 2 + i
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("configCard.title")}</CardTitle>
          <CardDescription>
            {t("configCard.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            {/* Year Navigation */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("labels.year")}</label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setYear((y) => y - 1)}
                  disabled={year <= years[0]}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-9 w-20 items-center justify-center rounded-md border bg-background text-sm font-medium">
                  {year}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setYear((y) => y + 1)}
                  disabled={year >= years[years.length - 1]}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Month Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("labels.month")}</label>
              <Select
                value={month.toString()}
                onValueChange={(v) => setMonth(parseInt(v, 10))}
              >
                <SelectTrigger className="w-[180px]">
                  <Calendar className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Park Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("labels.park")}</label>
              <Select value={parkId} onValueChange={setParkId}>
                <SelectTrigger className="w-[220px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder={t("parkPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allParks")}</SelectItem>
                  {parks.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.shortName || park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 sm:ml-auto">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={loading || generating}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                {t("preview")}
              </Button>
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={
                  loading ||
                  generating ||
                  !previewResult ||
                  previewResult.summary.successful === 0
                }
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                {t("generate")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards (shown after preview or generate) */}
      {activeResult && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("summary.processed")}
              </CardTitle>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {activeResult.summary.totalProcessed}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("summary.processedHint")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {isPreview ? t("summary.toCreate") : t("summary.created")}
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {isPreview
                  ? activeResult.summary.successful
                  : activeResult.summary.invoicesCreated}
              </div>
              <p className="text-xs text-muted-foreground">{t("summary.creditNotes")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("summary.totalAmount")}
              </CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(activeResult.summary.totalAmount)}
              </div>
              <p className="text-xs text-muted-foreground">
                {isPreview ? t("summary.previewHint") : t("summary.netHint")}
              </p>
            </CardContent>
          </Card>

          <Card
            className={
              activeResult.summary.skipped > 0
                ? "border-yellow-300"
                : activeResult.summary.failed > 0
                  ? "border-red-300"
                  : ""
            }
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t("summary.skippedErrors")}
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {activeResult.summary.skipped + activeResult.summary.failed}
              </div>
              <p className="text-xs text-muted-foreground">
                {activeResult.summary.skipped > 0 &&
                  t("summary.skippedText", { count: activeResult.summary.skipped })}
                {activeResult.summary.skipped > 0 &&
                  activeResult.summary.failed > 0 &&
                  ", "}
                {activeResult.summary.failed > 0 &&
                  t("summary.failedText", { count: activeResult.summary.failed })}
                {activeResult.summary.skipped === 0 &&
                  activeResult.summary.failed === 0 &&
                  t("summary.none")}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {activeResult && activeResult.invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {isPreview ? (
                <span className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  {t("table.previewTitle", { month: MONTH_NAMES[month - 1], year })}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  {t("table.resultTitle", { month: MONTH_NAMES[month - 1], year })}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {isPreview
                ? t("table.previewDesc")
                : t("table.resultDesc", { count: activeResult.summary.invoicesCreated })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.status")}</TableHead>
                    <TableHead>{t("table.lessor")}</TableHead>
                    <TableHead className="text-right">{t("table.amount")}</TableHead>
                    {!isPreview && (
                      <TableHead>{t("table.creditNoteNr")}</TableHead>
                    )}
                    <TableHead>{t("table.note")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeResult.invoices.map((inv, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {inv.success ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200"
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            {t("table.badgeOk")}
                          </Badge>
                        ) : inv.error?.includes("bereits erstellt") ? (
                          <Badge
                            variant="outline"
                            className="bg-yellow-50 text-yellow-700 border-yellow-200"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {t("table.badgePresent")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-red-50 text-red-700 border-red-200"
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            {t("table.badgeError")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {inv.recipientName || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {inv.amount ? formatCurrency(inv.amount) : "-"}
                      </TableCell>
                      {!isPreview && (
                        <TableCell>
                          {inv.invoiceNumber ? (
                            <span className="font-mono text-sm">
                              {inv.invoiceNumber}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.error || (isPreview ? t("table.noteWillCreate") : t("table.noteCreated"))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="font-medium"
                    >
                      {t("table.sumLabel", { count: activeResult.invoices.filter((i) => i.success).length })}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(
                        activeResult.invoices
                          .filter((i) => i.success)
                          .reduce((sum, i) => sum + (i.amount || 0), 0)
                      )}
                    </TableCell>
                    <TableCell
                      colSpan={isPreview ? 1 : 2}
                    />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("confirmDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDialog.description1", {
                count: previewResult?.summary.successful || 0,
                month: MONTH_NAMES[month - 1],
                year,
                total: formatCurrency(previewResult?.summary.totalAmount || 0),
              })}
              {" "}
              {t("confirmDialog.description2")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>
              {t("confirmDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              {t("confirmDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
