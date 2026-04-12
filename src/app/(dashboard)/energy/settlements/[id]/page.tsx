"use client";

import { useState, use } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  ArrowLeft,
  Calculator,
  Receipt,
  Trash2,
  Loader2,
  Pencil,
  FileText,
  Zap,
  Calendar,
  BarChart3,
  Info,
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
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { toast } from "sonner";
import {
  useEnergySettlement,
  calculateEnergySettlement,
  createEnergySettlementInvoices,
  deleteEnergySettlement,
  settlementStatusLabels,
  settlementStatusColors,
  distributionModeLabels,
  formatPeriod,
} from "@/hooks/useEnergySettlements";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatKwh(kwh: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kwh);
}

function formatMWh(kwh: number): string {
  const mwh = kwh / 1000;
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(mwh);
}

function formatPercent(pct: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pct);
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("energy.settlementDetail");
  const router = useRouter();
  const { settlement, isLoading, isError, mutate } = useEnergySettlement(id);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // ---- Actions ----

  async function handleCalculate() {
    try {
      setActionLoading("calculate");
      await calculateEnergySettlement(id);
      toast.success(t("calculateSuccess"));
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("calculateError")
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateInvoices() {
    try {
      setActionLoading("invoices");
      await createEnergySettlementInvoices(id, {});
      toast.success(t("invoicesSuccess"));
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("invoicesError")
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    try {
      await deleteEnergySettlement(id);
      toast.success(t("deleteSuccess"));
      router.push("/energy");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("deleteError")
      );
    }
  }

  // ---- Loading State ----

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // ---- Error / Not Found ----

  if (isError || !settlement) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/energy">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">{t("notFoundTitle")}</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("notFoundDesc")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const title = t("settlementTitle", { park: settlement.park?.name || "", period: formatPeriod(settlement.year, settlement.month) });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/energy">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{title}</h1>
              <Badge
                variant="secondary"
                className={settlementStatusColors[settlement.status]}
              >
                {settlementStatusLabels[settlement.status]}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {t("createdAt", { date: format(new Date(settlement.createdAt), "dd.MM.yyyy HH:mm", { locale: de }) })}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {settlement.status === "DRAFT" && (
            <>
              <Button
                onClick={handleCalculate}
                disabled={actionLoading === "calculate"}
              >
                {actionLoading === "calculate" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="mr-2 h-4 w-4" />
                )}
                {t("calculate")}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/energy/settlements/${id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t("edit")}
                </Link>
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </Button>
            </>
          )}

          {settlement.status === "CALCULATED" && (
            <Button
              onClick={handleCreateInvoices}
              disabled={actionLoading === "invoices"}
            >
              {actionLoading === "invoices" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Receipt className="mr-2 h-4 w-4" />
              )}
              {t("createInvoices")}
            </Button>
          )}

          {settlement.status === "INVOICED" && (
            <Button variant="outline" asChild>
              <Link href="/invoices">
                <FileText className="mr-2 h-4 w-4" />
                {t("showInvoices")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Park & Zeitraum */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {t("parkPeriod")}
              <InfoTooltip text={t("parkPeriodTooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t("park")}</span>
              <span className="font-medium">
                {settlement.park?.name || "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t("period")}</span>
              <span className="font-medium">
                {formatPeriod(settlement.year, settlement.month)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t("status")}</span>
              <Badge
                variant="secondary"
                className={settlementStatusColors[settlement.status]}
              >
                {settlementStatusLabels[settlement.status]}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Produktion & Erlös */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              {t("productionRevenue")}
              <InfoTooltip text={t("productionRevenueTooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                {t("totalProduction")}
              </span>
              <span className="font-medium font-mono">
                {formatMWh(Number(settlement.totalProductionKwh))} MWh
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                {t("gridFeedRevenue")}
              </span>
              <span className="font-medium font-mono">
                {formatCurrency(Number(settlement.netOperatorRevenueEur))}
              </span>
            </div>
            {settlement.netOperatorReference && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  {t("reference")}
                </span>
                <span className="font-mono text-sm">
                  {settlement.netOperatorReference}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verteilung */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {t("distribution")}
              <InfoTooltip text={t("distributionTooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                {t("distributionMode")}
              </span>
              <span className="font-medium">
                {distributionModeLabels[settlement.distributionMode] ||
                  settlement.distributionMode}
              </span>
            </div>
            {settlement.distributionMode === "SMOOTHED" &&
              settlement.smoothingFactor !== null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("smoothingFactor")}
                  </span>
                  <span className="font-mono">
                    {settlement.smoothingFactor}
                  </span>
                </div>
              )}
            {settlement.distributionMode === "TOLERATED" &&
              settlement.tolerancePercentage !== null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("tolerance")}
                  </span>
                  <span className="font-mono">
                    {settlement.tolerancePercentage}%
                  </span>
                </div>
              )}
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t("positions")}</span>
              <span className="font-medium">
                {settlement.items?.length || 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {settlement.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4" />
              {t("notesTitle")}
              <InfoTooltip text={t("notesTooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{settlement.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Settlement Items Table */}
      {settlement.items && settlement.items.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>{t("itemsTitle")}</CardTitle>
              <InfoTooltip text={t("itemsTooltip")} />
            </div>
            <CardDescription>
              {t("itemsCount", { count: settlement.items.length, status: settlementStatusLabels[settlement.status] })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("recipientFund")}</TableHead>
                    <TableHead>{t("turbine")}</TableHead>
                    <TableHead className="text-right">
                      {t("productionShareKwh")}
                    </TableHead>
                    <TableHead className="text-right">{t("sharePct")}</TableHead>
                    <TableHead className="text-right">
                      {t("revenueShareEur")}
                    </TableHead>
                    <TableHead>{t("distributionKey")}</TableHead>
                    <TableHead>{t("invoice")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlement.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.recipientFund?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {item.turbine?.designation || "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatKwh(Number(item.productionShareKwh))}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPercent(Number(item.productionSharePct))}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(item.revenueShareEur))}
                      </TableCell>
                      <TableCell>
                        {item.distributionKey || "-"}
                      </TableCell>
                      <TableCell>
                        {item.invoice ? (
                          <Link
                            href={`/invoices/${item.invoice.id}`}
                            className="text-primary hover:underline"
                          >
                            {item.invoice.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between gap-8">
                  <span className="text-muted-foreground">
                    {t("totalProductionLabel")}
                  </span>
                  <span className="font-mono font-medium">
                    {formatKwh(
                      settlement.items.reduce(
                        (sum, item) => sum + Number(item.productionShareKwh),
                        0
                      )
                    )}{" "}
                    kWh
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between gap-8">
                  <span className="text-muted-foreground font-medium">
                    {t("totalRevenueLabel")}
                  </span>
                  <span className="font-mono font-bold">
                    {formatCurrency(
                      settlement.items.reduce(
                        (sum, item) => sum + Number(item.revenueShareEur),
                        0
                      )
                    )}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty Items State */}
      {(!settlement.items || settlement.items.length === 0) &&
        settlement.status === "DRAFT" && (
          <Card>
            <CardContent className="py-12 text-center">
              <Calculator className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {t("noItemsTitle")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t("noItemsDesc")}
              </p>
              <Button
                onClick={handleCalculate}
                disabled={actionLoading === "calculate"}
              >
                {actionLoading === "calculate" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="mr-2 h-4 w-4" />
                )}
                {t("calculateNow")}
              </Button>
            </CardContent>
          </Card>
        )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title={t("deleteTitle")}
        itemName={title}
      />
    </div>
  );
}
