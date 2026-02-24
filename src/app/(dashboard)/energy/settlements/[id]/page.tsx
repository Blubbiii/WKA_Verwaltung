"use client";

import { useState, use } from "react";
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
  const router = useRouter();
  const { settlement, isLoading, isError, mutate } = useEnergySettlement(id);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // ---- Actions ----

  async function handleCalculate() {
    try {
      setActionLoading("calculate");
      await calculateEnergySettlement(id);
      toast.success("Abrechnung wurde erfolgreich berechnet");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler bei der Berechnung"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateInvoices() {
    try {
      setActionLoading("invoices");
      await createEnergySettlementInvoices(id, {});
      toast.success("Gutschriften wurden erfolgreich erstellt");
      mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Gutschriften"
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    try {
      await deleteEnergySettlement(id);
      toast.success("Abrechnung wurde gelöscht");
      router.push("/energy");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Löschen"
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
          <h1 className="text-2xl font-bold">Abrechnung nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Die angeforderte Abrechnung konnte nicht geladen werden.
          </CardContent>
        </Card>
      </div>
    );
  }

  const title = `Abrechnung ${settlement.park?.name || ""} - ${formatPeriod(settlement.year, settlement.month)}`;

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
              Erstellt am{" "}
              {format(new Date(settlement.createdAt), "dd.MM.yyyy HH:mm", {
                locale: de,
              })}
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
                Berechnen
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/energy/settlements/${id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Bearbeiten
                </Link>
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Löschen
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
              Gutschriften erstellen
            </Button>
          )}

          {settlement.status === "INVOICED" && (
            <Button variant="outline" asChild>
              <Link href="/invoices">
                <FileText className="mr-2 h-4 w-4" />
                Gutschriften anzeigen
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
              Park & Zeitraum
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Park</span>
              <span className="font-medium">
                {settlement.park?.name || "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Zeitraum</span>
              <span className="font-medium">
                {formatPeriod(settlement.year, settlement.month)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
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
              Produktion & Erlös
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Gesamtproduktion
              </span>
              <span className="font-medium font-mono">
                {formatMWh(Number(settlement.totalProductionKwh))} MWh
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Netzeinspeisung Erlös
              </span>
              <span className="font-medium font-mono">
                {formatCurrency(Number(settlement.netOperatorRevenueEur))}
              </span>
            </div>
            {settlement.netOperatorReference && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Referenz
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
              Verteilung
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Verteilungsmodus
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
                    Glaettungsfaktor
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
                    Toleranz
                  </span>
                  <span className="font-mono">
                    {settlement.tolerancePercentage}%
                  </span>
                </div>
              )}
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Positionen</span>
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
              Notizen
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
            <CardTitle>Abrechnungspositionen</CardTitle>
            <CardDescription>
              {settlement.items.length} Position(en) -{" "}
              {settlementStatusLabels[settlement.status]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gesellschaft / Empfänger</TableHead>
                    <TableHead>Anlage</TableHead>
                    <TableHead className="text-right">
                      Produktionsanteil (kWh)
                    </TableHead>
                    <TableHead className="text-right">Anteil (%)</TableHead>
                    <TableHead className="text-right">
                      Erlösanteil (EUR)
                    </TableHead>
                    <TableHead>Verteilungsschluessel</TableHead>
                    <TableHead>Gutschrift</TableHead>
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
                    Gesamtproduktion:
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
                    Gesamterlös:
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
                Noch keine Abrechnungspositionen
              </h3>
              <p className="text-muted-foreground mb-4">
                Klicken Sie auf &quot;Berechnen&quot;, um die
                Abrechnungspositionen aus den Netzbetreiber-Daten zu generieren.
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
                Jetzt berechnen
              </Button>
            </CardContent>
          </Card>
        )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title="Abrechnung löschen"
        itemName={title}
      />
    </div>
  );
}
