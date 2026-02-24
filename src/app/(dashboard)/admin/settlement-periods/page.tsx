"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus,
  Calendar,
  Loader2,
  Calculator,
  FileText,
  Eye,
  Filter,
  RefreshCw,
  CalendarPlus,
  MoreHorizontal,
  Clock,
  CheckCircle2,
  Euro,
  TrendingUp,
} from "lucide-react";
import {
  useSettlementPeriods,
  createSettlementPeriod,
  settlementStatusLabels,
  settlementStatusColors,
} from "@/hooks/useSettlementPeriods";
import { useParks } from "@/hooks/useParks";

interface CreatePeriodForm {
  parkId: string;
  year: number;
  month: number | null;
  periodType: "ADVANCE" | "FINAL";
  notes: string;
}

interface BulkCreateForm {
  parkId: string;
  year: number;
  frequency: "MONTHLY" | "QUARTERLY";
  createFinalPeriod: boolean;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - i + 1);
const months = [
  { value: 1, label: "Januar" },
  { value: 2, label: "Februar" },
  { value: 3, label: "Maerz" },
  { value: 4, label: "April" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "Oktober" },
  { value: 11, label: "November" },
  { value: 12, label: "Dezember" },
];

const periodTypeLabels: Record<string, string> = {
  ADVANCE: "Vorschuss",
  FINAL: "Endabrechnung",
};

const periodTypeColors: Record<string, string> = {
  ADVANCE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  FINAL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export default function SettlementPeriodsPage() {
  const [filters, setFilters] = useState<{
    parkId?: string;
    year?: number;
    periodType?: "ADVANCE" | "FINAL";
    status?: "OPEN" | "IN_PROGRESS" | "PENDING_REVIEW" | "APPROVED" | "CLOSED";
  }>({});

  const { periods, isLoading, isError, mutate } = useSettlementPeriods(filters);
  const { parks, isLoading: parksLoading } = useParks();

  // Create Period Dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState<CreatePeriodForm>({
    parkId: "",
    year: currentYear,
    month: null,
    periodType: "ADVANCE",
    notes: "",
  });
  const [isCreating, setIsCreating] = useState(false);

  // Bulk Create Dialog (Jahr vorbereiten)
  const [showBulkCreateDialog, setShowBulkCreateDialog] = useState(false);
  const [bulkFormData, setBulkFormData] = useState<BulkCreateForm>({
    parkId: "",
    year: currentYear,
    frequency: "MONTHLY",
    createFinalPeriod: true,
  });
  const [isBulkCreating, setIsBulkCreating] = useState(false);

  const parkList = Array.isArray(parks) ? parks : [];
  const periodList = Array.isArray(periods) ? periods : [];

  // KPI Berechnungen
  const kpis = useMemo(() => {
    const openCount = periodList.filter((p) => p.status === "OPEN").length;
    const inProgressCount = periodList.filter((p) => p.status === "IN_PROGRESS").length;
    const pendingReviewCount = periodList.filter((p) => p.status === "PENDING_REVIEW").length;
    const totalMinimumRent = periodList.reduce((sum, p) => {
      const rent = typeof p.totalMinimumRent === "string"
        ? parseFloat(p.totalMinimumRent)
        : (p.totalMinimumRent || 0);
      return sum + rent;
    }, 0);
    const totalActualRent = periodList.reduce((sum, p) => {
      const rent = typeof p.totalActualRent === "string"
        ? parseFloat(p.totalActualRent)
        : (p.totalActualRent || 0);
      return sum + rent;
    }, 0);
    const totalAdditionalPayment = Math.max(0, totalActualRent - totalMinimumRent);

    return {
      openCount,
      inProgressCount,
      pendingReviewCount,
      totalMinimumRent,
      totalAdditionalPayment,
    };
  }, [periodList]);

  async function handleCreate() {
    if (!formData.parkId) {
      toast.error("Bitte waehlen Sie einen Windpark aus");
      return;
    }

    if (formData.periodType === "ADVANCE" && !formData.month) {
      toast.error("Bitte waehlen Sie einen Monat für den Vorschuss aus");
      return;
    }

    try {
      setIsCreating(true);
      await createSettlementPeriod({
        parkId: formData.parkId,
        year: formData.year,
        month: formData.periodType === "ADVANCE" ? formData.month : undefined,
        periodType: formData.periodType,
        notes: formData.notes || undefined,
      });
      toast.success("Abrechnungsperiode erstellt");
      setShowCreateDialog(false);
      setFormData({ parkId: "", year: currentYear, month: null, periodType: "ADVANCE", notes: "" });
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleBulkCreate() {
    if (!bulkFormData.parkId) {
      toast.error("Bitte waehlen Sie einen Windpark aus");
      return;
    }

    try {
      setIsBulkCreating(true);
      const response = await fetch("/api/admin/settlement-periods/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bulkFormData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen");
      }

      const result = await response.json();
      toast.success(result.message);
      setShowBulkCreateDialog(false);
      setBulkFormData({
        parkId: "",
        year: currentYear,
        frequency: "MONTHLY",
        createFinalPeriod: true,
      });
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen");
    } finally {
      setIsBulkCreating(false);
    }
  }

  async function handleCalculate(periodId: string) {
    try {
      const response = await fetch(`/api/admin/settlement-periods/${periodId}/calculate`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler bei der Berechnung");
      }
      toast.success("Berechnung abgeschlossen");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler bei der Berechnung");
    }
  }

  async function handleCreateInvoices(periodId: string) {
    try {
      const response = await fetch(`/api/admin/settlement-periods/${periodId}/create-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxType: "EXEMPT" }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen der Rechnungen");
      }
      const result = await response.json();
      toast.success(result.message);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen der Rechnungen");
    }
  }

  function formatPeriod(period: { year: number; month?: number | null; periodType: string }) {
    if (period.periodType === "FINAL") {
      return `${period.year} (Jahresabrechnung)`;
    }
    if (period.month) {
      const monthName = months.find((m) => m.value === period.month)?.label || "";
      return `${monthName} ${period.year}`;
    }
    return `${period.year}`;
  }

  if (isError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Fehler beim Laden der Abrechnungsperioden
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pachtabrechnungen</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Pachtvorschüsse und Jahresendabrechnungen
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulkCreateDialog(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Jahr vorbereiten
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Periode erstellen
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offene Perioden</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.openCount}</div>
            <p className="text-xs text-muted-foreground">
              Noch nicht bearbeitet
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Bearbeitung / Prüfung</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inProgressCount + kpis.pendingReviewCount}</div>
            <p className="text-xs text-muted-foreground">
              {kpis.pendingReviewCount > 0
                ? `${kpis.inProgressCount} in Bearbeitung, ${kpis.pendingReviewCount} zur Prüfung`
                : "Berechnet, noch nicht genehmigt"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtsumme Mindestpacht</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.totalMinimumRent)}</div>
            <p className="text-xs text-muted-foreground">
              Über alle Perioden
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nachzahlungen</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(kpis.totalAdditionalPayment)}
            </div>
            <p className="text-xs text-muted-foreground">
              Über Mindestpacht hinaus
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="space-y-2">
              <Label>Windpark</Label>
              <Select
                value={filters.parkId || "all"}
                onValueChange={(value) =>
                  setFilters({ ...filters, parkId: value === "all" ? undefined : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alle Parks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Parks</SelectItem>
                  {parkList.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Jahr</Label>
              <Select
                value={filters.year?.toString() || "all"}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    year: value === "all" ? undefined : parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alle Jahre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Jahre</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select
                value={filters.periodType || "all"}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    periodType: value === "all" ? undefined : (value as "ADVANCE" | "FINAL"),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alle Typen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Typen</SelectItem>
                  <SelectItem value="ADVANCE">Vorschuss (ADVANCE)</SelectItem>
                  <SelectItem value="FINAL">Endabrechnung (FINAL)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={filters.status || "all"}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    status: value === "all" ? undefined : (value as "OPEN" | "IN_PROGRESS" | "PENDING_REVIEW" | "APPROVED" | "CLOSED"),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="OPEN">Offen</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Bearbeitung</SelectItem>
                  <SelectItem value="PENDING_REVIEW">Zur Prüfung</SelectItem>
                  <SelectItem value="APPROVED">Genehmigt</SelectItem>
                  <SelectItem value="CLOSED">Abgeschlossen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => setFilters({})}
                className="w-full"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Zurücksetzen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Abrechnungsperioden
          </CardTitle>
          <CardDescription>
            {periodList.length} Periode(n) gefunden
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : periodList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine Abrechnungsperioden gefunden</p>
              <p className="text-sm mt-2">
                Erstellen Sie eine neue Periode oder bereiten Sie ein Jahr vor.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Windpark</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead className="text-right">Mindestpacht</TableHead>
                    <TableHead className="text-right">Tatsaechliche Pacht</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodList.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">
                        {period.park.name}
                      </TableCell>
                      <TableCell>
                        {formatPeriod(period)}
                      </TableCell>
                      <TableCell>
                        <Badge className={periodTypeColors[period.periodType] || ""}>
                          {periodTypeLabels[period.periodType] || period.periodType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(period.totalMinimumRent)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(period.totalActualRent)}
                      </TableCell>
                      <TableCell>
                        <Badge className={settlementStatusColors[period.status] || ""}>
                          {settlementStatusLabels[period.status] || period.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/settlement-periods/${period.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleCalculate(period.id)}
                              disabled={period.status !== "OPEN" && period.status !== "IN_PROGRESS"}
                            >
                              <Calculator className="mr-2 h-4 w-4" />
                              Berechnen
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCreateInvoices(period.id)}
                              disabled={period.status !== "APPROVED"}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Rechnungen erstellen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Period Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Abrechnungsperiode</DialogTitle>
            <DialogDescription>
              Erstellen Sie eine einzelne Abrechnungsperiode (Vorschuss oder Endabrechnung)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="parkId">Windpark *</Label>
              <Select
                value={formData.parkId}
                onValueChange={(value) => setFormData({ ...formData, parkId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Windpark auswaehlen" />
                </SelectTrigger>
                <SelectContent>
                  {parkList.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Periodentyp *</Label>
              <Select
                value={formData.periodType}
                onValueChange={(value: "ADVANCE" | "FINAL") =>
                  setFormData({ ...formData, periodType: value, month: value === "FINAL" ? null : formData.month })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADVANCE">Vorschuss (monatlich)</SelectItem>
                  <SelectItem value="FINAL">Endabrechnung (jährlich)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="year">Jahr *</Label>
                <Select
                  value={formData.year.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, year: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.periodType === "ADVANCE" && (
                <div className="space-y-2">
                  <Label htmlFor="month">Monat *</Label>
                  <Select
                    value={formData.month?.toString() || ""}
                    onValueChange={(value) =>
                      setFormData({ ...formData, month: parseInt(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Monat waehlen" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem key={month.value} value={month.value.toString()}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notizen</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optionale Notizen..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || parksLoading}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Create Dialog (Jahr vorbereiten) */}
      <Dialog open={showBulkCreateDialog} onOpenChange={setShowBulkCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Jahr vorbereiten</DialogTitle>
            <DialogDescription>
              Erstellen Sie automatisch alle Vorschussperioden und die Endabrechnung für ein Jahr
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulkParkId">Windpark *</Label>
              <Select
                value={bulkFormData.parkId}
                onValueChange={(value) => setBulkFormData({ ...bulkFormData, parkId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Windpark auswaehlen" />
                </SelectTrigger>
                <SelectContent>
                  {parkList.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkYear">Jahr *</Label>
              <Select
                value={bulkFormData.year.toString()}
                onValueChange={(value) =>
                  setBulkFormData({ ...bulkFormData, year: parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Frequenz der Vorschüsse</Label>
              <Select
                value={bulkFormData.frequency}
                onValueChange={(value: "MONTHLY" | "QUARTERLY") =>
                  setBulkFormData({ ...bulkFormData, frequency: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">Monatlich (12 Vorschüsse)</SelectItem>
                  <SelectItem value="QUARTERLY">Quartalsweise (4 Vorschüsse)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {bulkFormData.frequency === "MONTHLY"
                  ? "Erstellt 12 monatliche Vorschussperioden (Januar bis Dezember)"
                  : "Erstellt 4 quartalsweise Vorschussperioden (Maerz, Juni, September, Dezember)"}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="createFinalPeriod"
                checked={bulkFormData.createFinalPeriod}
                onCheckedChange={(checked) =>
                  setBulkFormData({ ...bulkFormData, createFinalPeriod: !!checked })
                }
              />
              <Label htmlFor="createFinalPeriod" className="text-sm font-normal">
                Auch Jahresendabrechnung erstellen
              </Label>
            </div>

            <div className="rounded-lg bg-muted p-4">
              <h4 className="text-sm font-medium mb-2">Zusammenfassung</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>
                  {bulkFormData.frequency === "MONTHLY" ? "12" : "4"} Vorschuss-Perioden werden erstellt
                </li>
                {bulkFormData.createFinalPeriod && (
                  <li>1 Jahresendabrechnung wird erstellt</li>
                )}
                <li className="font-medium text-foreground mt-2">
                  Gesamt: {(bulkFormData.frequency === "MONTHLY" ? 12 : 4) + (bulkFormData.createFinalPeriod ? 1 : 0)} Perioden
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkCreateDialog(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleBulkCreate} disabled={isBulkCreating || parksLoading}>
              {isBulkCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bulkFormData.frequency === "MONTHLY" ? "12" : "4"} Vorschüsse + {bulkFormData.createFinalPeriod ? "Endabrechnung" : ""} erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
