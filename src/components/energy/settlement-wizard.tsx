"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Receipt,
  Check,
  Loader2,
  AlertTriangle,
  FileText,
  Zap,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import {
  monthNames,
  distributionModeLabels,
} from "@/hooks/useEnergySettlements";

// =============================================================================
// TYPES
// =============================================================================

interface ParkOption {
  id: string;
  name: string;
  shortName?: string | null;
}

interface ProductionStatusData {
  totalTurbines: number;
  turbinesWithData: number;
  totalProductionKwh: number;
  turbineSummary: {
    turbineId: string;
    designation: string;
    totalKwh: number;
    recordCount: number;
  }[];
}

interface CalculationResultData {
  settlement: {
    id: string;
    year: number;
    month: number | null;
    netOperatorRevenueEur: number;
    totalProductionKwh: number;
    distributionMode: string;
    status: string;
    park: { id: string; name: string; shortName: string | null };
    items: CalculationItem[];
  };
  calculation: {
    mode: string;
    totalProductionKwh: number;
    netOperatorRevenueEur: number;
    pricePerKwh: number;
    turbineData: {
      turbineId: string;
      turbineDesignation: string;
      operatorFundId: string;
      operatorFundName: string;
      productionKwh: number;
      productionSharePct: number;
    }[];
  };
}

interface CalculationItem {
  id: string;
  productionShareKwh: number;
  productionSharePct: number;
  revenueShareEur: number;
  distributionKey: string | null;
  recipientFund: {
    id: string;
    name: string;
    fundCategory?: {
      id: string;
      name: string;
      code: string;
      color: string | null;
    } | null;
  } | null;
  turbine: {
    id: string;
    designation: string;
  } | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    invoiceDate?: string;
    status: string;
    grossAmount?: number;
  } | null;
}

interface InvoiceResult {
  itemId: string;
  invoiceId: string;
  invoiceNumber: string;
  recipientFund: string;
  amount: number;
}

interface InvoicesResponse {
  message: string;
  settlement: {
    id: string;
    status: string;
    items: CalculationItem[];
  };
  invoices: InvoiceResult[];
  summary: {
    count: number;
    totalAmount: number;
    period: string;
    park: string;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const WIZARD_STEPS = [
  { id: "park", title: "Park & Periode", description: "Zeitraum waehlen" },
  { id: "data", title: "NB-Daten", description: "Erloes & Verteilung" },
  { id: "calculate", title: "Berechnung", description: "Verteilung pruefen" },
  { id: "invoices", title: "Gutschriften", description: "Erstellen" },
  { id: "summary", title: "Abschluss", description: "Zusammenfassung" },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => currentYear - i);

const MONTH_OPTIONS = [
  { value: "__annual__", label: "Jahresabrechnung" },
  ...Object.entries(monthNames).map(([num, name]) => ({
    value: num,
    label: name,
  })),
];

// =============================================================================
// COMPONENT
// =============================================================================

export function SettlementWizard() {
  // Step navigation
  const [step, setStep] = useState(0);

  // Step 1: Park & Period
  const [parkId, setParkId] = useState("");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | null>(null);
  const [monthSelectValue, setMonthSelectValue] = useState("__annual__");
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [parksLoading, setParksLoading] = useState(true);
  const [productionStatus, setProductionStatus] =
    useState<ProductionStatusData | null>(null);
  const [productionStatusLoading, setProductionStatusLoading] = useState(false);

  // Step 2: Netzbetreiber-Daten
  const [formData, setFormData] = useState({
    productionKwh: "",
    revenueEur: "",
    reference: "",
    distributionMode: "PROPORTIONAL" as
      | "PROPORTIONAL"
      | "SMOOTHED"
      | "TOLERATED",
    smoothingFactor: 0.5,
    tolerancePercentage: 5,
    notes: "",
  });

  // Step 3: Calculation
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [calculationResult, setCalculationResult] =
    useState<CalculationResultData | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Step 4: Invoices
  const [invoicesResult, setInvoicesResult] =
    useState<InvoicesResponse | null>(null);
  const [creatingInvoices, setCreatingInvoices] = useState(false);
  const [sendImmediately, setSendImmediately] = useState(false);
  const [approvingInvoices, setApprovingInvoices] = useState(false);


  // -------------------------------------------------------------------------
  // Load parks on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    async function loadParks() {
      try {
        const res = await fetch("/api/parks?limit=100");
        if (!res.ok) throw new Error("Fehler beim Laden der Parks");
        const json = await res.json();
        const data = (json.data ?? json) as ParkOption[];
        setParks(data);
      } catch {
        toast.error("Parks konnten nicht geladen werden");
      } finally {
        setParksLoading(false);
      }
    }
    loadParks();
  }, []);

  // -------------------------------------------------------------------------
  // Load production status when park/year/month changes
  // -------------------------------------------------------------------------
  const loadProductionStatus = useCallback(async () => {
    if (!parkId) {
      setProductionStatus(null);
      return;
    }

    setProductionStatusLoading(true);
    try {
      // Fetch turbine count for this park
      const parkRes = await fetch(`/api/parks/${parkId}`);
      if (!parkRes.ok) throw new Error("Park konnte nicht geladen werden");
      const parkData = await parkRes.json();
      const totalTurbines =
        parkData.stats?.turbineCount ?? parkData._count?.turbines ?? 0;

      // Fetch production data for the period
      const params = new URLSearchParams({
        parkId,
        year: year.toString(),
      });
      if (month !== null) {
        params.set("month", month.toString());
      }

      const prodRes = await fetch(
        `/api/energy/productions/for-settlement?${params.toString()}`
      );
      if (!prodRes.ok)
        throw new Error("Produktionsdaten konnten nicht geladen werden");
      const prodData = await prodRes.json();

      setProductionStatus({
        totalTurbines,
        turbinesWithData: prodData.turbineCount || 0,
        totalProductionKwh: prodData.totalProductionKwh || 0,
        turbineSummary: prodData.turbineSummary || [],
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Laden des Status"
      );
      setProductionStatus(null);
    } finally {
      setProductionStatusLoading(false);
    }
  }, [parkId, year, month]);

  useEffect(() => {
    loadProductionStatus();
  }, [loadProductionStatus]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const selectedPark = parks.find((p) => p.id === parkId);

  function formatPeriodLabel(): string {
    if (month === null) return `Jahr ${year}`;
    return `${monthNames[month]} ${year}`;
  }

  function formatKwh(kwh: number): string {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(kwh);
  }

  function formatPercent(pct: number): string {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(pct);
  }

  // -------------------------------------------------------------------------
  // Step validation
  // -------------------------------------------------------------------------
  function canProceed(): boolean {
    switch (step) {
      case 0: // Park & Period
        return (
          !!parkId &&
          productionStatus !== null &&
          productionStatus.turbinesWithData > 0
        );
      case 1: // NB Data
        return (
          formData.productionKwh !== "" &&
          !isNaN(Number(formData.productionKwh)) &&
          Number(formData.productionKwh) >= 0 &&
          formData.revenueEur !== "" &&
          !isNaN(Number(formData.revenueEur)) &&
          Number(formData.revenueEur) >= 0
        );
      case 2: // Calculation
        return calculationResult !== null;
      case 3: // Invoices
        return invoicesResult !== null;
      case 4: // Summary
        return true;
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Create settlement and calculate
  // -------------------------------------------------------------------------
  async function handleCalculate() {
    setCalculating(true);
    try {
      let currentSettlementId = settlementId;

      // Create settlement if it doesn't exist yet
      if (!currentSettlementId) {
        const createRes = await fetch("/api/energy/settlements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parkId,
            year,
            month: month ?? null,
            totalProductionKwh: Number(formData.productionKwh),
            netOperatorRevenueEur: Number(formData.revenueEur),
            netOperatorReference: formData.reference.trim() || null,
            distributionMode: formData.distributionMode,
            smoothingFactor:
              formData.distributionMode === "SMOOTHED"
                ? formData.smoothingFactor
                : null,
            tolerancePercentage:
              formData.distributionMode === "TOLERATED"
                ? formData.tolerancePercentage
                : null,
            notes: formData.notes.trim() || null,
          }),
        });

        if (!createRes.ok) {
          const error = await createRes
            .json()
            .catch(() => ({ error: "Unbekannter Fehler" }));
          throw new Error(
            error.details
              ? typeof error.details === "string"
                ? error.details
                : error.error
              : error.error || `HTTP ${createRes.status}`
          );
        }

        const createData = await createRes.json();
        currentSettlementId = createData.id;
        setSettlementId(createData.id);
      }

      // Trigger calculation
      const calcRes = await fetch(
        `/api/energy/settlements/${currentSettlementId}/calculate`,
        { method: "POST" }
      );

      if (!calcRes.ok) {
        const error = await calcRes
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(error.error || `HTTP ${calcRes.status}`);
      }

      const calcData = await calcRes.json();
      setCalculationResult(calcData);
      toast.success("Berechnung erfolgreich durchgefuehrt");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler bei der Berechnung"
      );
    } finally {
      setCalculating(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Create invoices
  // -------------------------------------------------------------------------
  async function handleCreateInvoices() {
    if (!settlementId) return;

    setCreatingInvoices(true);
    try {
      const res = await fetch(
        `/api/energy/settlements/${settlementId}/create-invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(error.error || `HTTP ${res.status}`);
      }

      const data: InvoicesResponse = await res.json();
      setInvoicesResult(data);
      toast.success(data.message);

      // Optionally approve invoices immediately
      if (sendImmediately && data.invoices.length > 0) {
        setApprovingInvoices(true);
        try {
          const approveRes = await fetch("/api/batch/invoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "approve",
              invoiceIds: data.invoices.map((inv) => inv.invoiceId),
            }),
          });

          if (approveRes.ok) {
            toast.success("Gutschriften wurden freigegeben");
            // Reload settlement to get updated invoice statuses
            const updatedRes = await fetch(
              `/api/energy/settlements/${settlementId}`
            );
            if (updatedRes.ok) {
              const updatedSettlement = await updatedRes.json();
              setInvoicesResult((prev) =>
                prev
                  ? {
                      ...prev,
                      settlement: updatedSettlement,
                    }
                  : prev
              );
            }
          } else {
            toast.error("Fehler beim Freigeben der Gutschriften");
          }
        } catch {
          toast.error("Fehler beim Freigeben der Gutschriften");
        } finally {
          setApprovingInvoices(false);
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Fehler beim Erstellen der Gutschriften"
      );
    } finally {
      setCreatingInvoices(false);
    }
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  function handleBack() {
    if (step === 2 && settlementId) {
      // Warn when going back from calculation step
      const confirmed = window.confirm(
        "Wenn Sie zurueckgehen, wird die bestehende Berechnung verworfen. Fortfahren?"
      );
      if (!confirmed) return;
    }
    setStep((prev) => Math.max(0, prev - 1));
  }

  function handleNext() {
    setStep((prev) => Math.min(WIZARD_STEPS.length - 1, prev + 1));
  }

  function handleReset() {
    setStep(0);
    setParkId("");
    setYear(currentYear);
    setMonth(null);
    setMonthSelectValue("__annual__");
    setProductionStatus(null);
    setFormData({
      productionKwh: "",
      revenueEur: "",
      reference: "",
      distributionMode: "PROPORTIONAL",
      smoothingFactor: 0.5,
      tolerancePercentage: 5,
      notes: "",
    });
    setSettlementId(null);
    setCalculationResult(null);
    setInvoicesResult(null);
    setSendImmediately(false);
    setCalculating(false);
    setCreatingInvoices(false);
    setApprovingInvoices(false);
  }

  // -------------------------------------------------------------------------
  // Plausibility checks for step 3
  // -------------------------------------------------------------------------
  function getPlausibilityWarnings(): string[] {
    if (!calculationResult) return [];
    const warnings: string[] = [];
    const items = calculationResult.settlement.items;

    for (const item of items) {
      const pct = Number(item.productionSharePct);
      const fundName = item.recipientFund?.name || "Unbekannt";
      const turbineName = item.turbine?.designation || "";
      const label = turbineName ? `${fundName} (${turbineName})` : fundName;

      if (pct < 1) {
        warnings.push(
          `${label}: Anteil nur ${formatPercent(pct)}% - ungewoehnlich niedrig`
        );
      }
      if (pct > 50) {
        warnings.push(
          `${label}: Anteil ${formatPercent(pct)}% - ungewoehnlich hoch`
        );
      }
    }

    return warnings;
  }

  // -------------------------------------------------------------------------
  // Step renderers
  // -------------------------------------------------------------------------

  // STEP 1: Park & Period
  function renderStep1() {
    const progressPct =
      productionStatus && productionStatus.totalTurbines > 0
        ? (productionStatus.turbinesWithData /
            productionStatus.totalTurbines) *
          100
        : 0;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Park und Abrechnungszeitraum
            </CardTitle>
            <CardDescription>
              Waehlen Sie den Windpark und den Zeitraum fuer die Abrechnung
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Park Selection */}
            <div className="space-y-2">
              <Label htmlFor="wizard-park">
                Windpark <span className="text-destructive">*</span>
              </Label>
              <Select
                value={parkId || "none"}
                onValueChange={(value) =>
                  setParkId(value === "none" ? "" : value)
                }
                disabled={parksLoading}
              >
                <SelectTrigger id="wizard-park" aria-label="Windpark auswaehlen">
                  <SelectValue
                    placeholder={
                      parksLoading ? "Laden..." : "Windpark auswaehlen..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Windpark auswaehlen...
                  </SelectItem>
                  {parks.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year & Month */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-year">
                  Jahr <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={year.toString()}
                  onValueChange={(value) => setYear(parseInt(value, 10))}
                >
                  <SelectTrigger id="wizard-year" aria-label="Jahr auswaehlen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEAR_OPTIONS.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard-month">Monat / Zeitraum</Label>
                <Select
                  value={monthSelectValue}
                  onValueChange={(value) => {
                    setMonthSelectValue(value);
                    if (value === "__annual__") {
                      setMonth(null);
                    } else {
                      setMonth(parseInt(value, 10));
                    }
                  }}
                >
                  <SelectTrigger
                    id="wizard-month"
                    aria-label="Monat auswaehlen"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Production Status */}
            {parkId && (
              <Separator />
            )}

            {productionStatusLoading && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Produktionsdaten werden geladen...
                </p>
              </div>
            )}

            {productionStatus && !productionStatusLoading && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      Produktionsdaten-Status
                    </span>
                    <span className="text-muted-foreground">
                      {productionStatus.turbinesWithData} von{" "}
                      {productionStatus.totalTurbines} Turbinen
                    </span>
                  </div>
                  <Progress
                    value={progressPct}
                    className="h-3"
                    aria-label={`${productionStatus.turbinesWithData} von ${productionStatus.totalTurbines} Turbinen haben Produktionsdaten`}
                  />
                </div>

                {productionStatus.turbinesWithData > 0 && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-sm text-green-800 font-medium">
                      {productionStatus.turbinesWithData} Turbine(n) mit
                      Produktionsdaten fuer {formatPeriodLabel()}
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Gesamtproduktion:{" "}
                      {formatKwh(productionStatus.totalProductionKwh)} kWh
                    </p>
                  </div>
                )}

                {productionStatus.turbinesWithData <
                  productionStatus.totalTurbines &&
                  productionStatus.totalTurbines > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Unvollstaendige Daten</AlertTitle>
                      <AlertDescription>
                        Nicht alle Turbinen haben Produktionsdaten fuer{" "}
                        {formatPeriodLabel()}.{" "}
                        {productionStatus.totalTurbines -
                          productionStatus.turbinesWithData}{" "}
                        Turbine(n) fehlen noch. Die Berechnung bezieht sich nur
                        auf Turbinen mit vorhandenen Daten.
                      </AlertDescription>
                    </Alert>
                  )}

                {productionStatus.turbinesWithData === 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Keine Produktionsdaten</AlertTitle>
                    <AlertDescription>
                      Fuer {formatPeriodLabel()} liegen keine Produktionsdaten
                      vor. Bitte importieren Sie zuerst Produktionsdaten, bevor
                      Sie eine Abrechnung erstellen.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Turbine summary */}
                {productionStatus.turbineSummary.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      Turbinen-Details anzeigen
                    </summary>
                    <div className="mt-3 rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Turbine</TableHead>
                            <TableHead className="text-right">
                              Produktion (kWh)
                            </TableHead>
                            <TableHead className="text-right">
                              Datensaetze
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {productionStatus.turbineSummary.map((t) => (
                            <TableRow key={t.turbineId}>
                              <TableCell className="font-medium">
                                {t.designation}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatKwh(t.totalKwh)}
                              </TableCell>
                              <TableCell className="text-right">
                                {t.recordCount}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // STEP 2: Netzbetreiber-Daten
  function renderStep2() {
    return (
      <div className="space-y-6">
        {/* Production & Revenue Card */}
        <Card>
          <CardHeader>
            <CardTitle>Netzbetreiber-Abrechnungsdaten</CardTitle>
            <CardDescription>
              Einspeisung und Erloes laut Netzbetreiber-Gutschrift fuer{" "}
              {selectedPark?.name || "den ausgewaehlten Park"},{" "}
              {formatPeriodLabel()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Production kWh */}
              <div className="space-y-2">
                <Label htmlFor="wizard-production">
                  Einspeisung (kWh){" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="wizard-production"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="z.B. 2500000"
                  value={formData.productionKwh}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      productionKwh: e.target.value,
                    }))
                  }
                  aria-label="Einspeisung in Kilowattstunden"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Gesamteinspeisung laut Netzbetreiber
                </p>
              </div>

              {/* Revenue EUR */}
              <div className="space-y-2">
                <Label htmlFor="wizard-revenue">
                  Erloes (EUR) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="wizard-revenue"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="z.B. 185000.00"
                  value={formData.revenueEur}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      revenueEur: e.target.value,
                    }))
                  }
                  aria-label="Erloes in Euro"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Verguetungsbetrag vom Netzbetreiber
                </p>
              </div>
            </div>

            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="wizard-reference">
                Referenznummer (optional)
              </Label>
              <Input
                id="wizard-reference"
                type="text"
                placeholder="z.B. NB-2024-001"
                value={formData.reference}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    reference: e.target.value,
                  }))
                }
                maxLength={100}
                aria-label="Referenznummer vom Netzbetreiber"
              />
              <p className="text-xs text-muted-foreground">
                Belegnummer oder Referenz vom Netzbetreiber
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Distribution Mode Card */}
        <Card>
          <CardHeader>
            <CardTitle>Verteilungsmodus</CardTitle>
            <CardDescription>
              Wie soll der Erloes auf die Betreibergesellschaften verteilt
              werden?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={formData.distributionMode}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  distributionMode: value as
                    | "PROPORTIONAL"
                    | "SMOOTHED"
                    | "TOLERATED",
                }))
              }
              className="space-y-3"
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem
                  value="PROPORTIONAL"
                  id="mode-proportional"
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="mode-proportional" className="font-medium">
                    Proportional
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Verteilung strikt nach Produktionsanteil jeder Turbine
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem
                  value="SMOOTHED"
                  id="mode-smoothed"
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="mode-smoothed" className="font-medium">
                    Geglaettet
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Ausgleich von Standortunterschieden durch Mischung mit
                    Durchschnitt
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem
                  value="TOLERATED"
                  id="mode-tolerated"
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="mode-tolerated" className="font-medium">
                    Mit Duldung
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Abweichungen innerhalb einer Toleranzgrenze werden ignoriert
                  </p>
                </div>
              </div>
            </RadioGroup>

            {/* Smoothing Factor */}
            {formData.distributionMode === "SMOOTHED" && (
              <div className="space-y-3 p-4 rounded-lg bg-muted/50">
                <Label htmlFor="wizard-smoothing">
                  Glaettungsfaktor:{" "}
                  <span className="font-mono">
                    {formData.smoothingFactor.toFixed(2)}
                  </span>
                </Label>
                <input
                  id="wizard-smoothing"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={formData.smoothingFactor}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      smoothingFactor: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  aria-label="Glaettungsfaktor einstellen"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0 = keine Glaettung</span>
                  <span>1 = maximale Glaettung</span>
                </div>
              </div>
            )}

            {/* Tolerance Percentage */}
            {formData.distributionMode === "TOLERATED" && (
              <div className="space-y-2 p-4 rounded-lg bg-muted/50">
                <Label htmlFor="wizard-tolerance">Toleranzgrenze (%)</Label>
                <Input
                  id="wizard-tolerance"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={formData.tolerancePercentage}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      tolerancePercentage: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-32"
                  aria-label="Toleranzgrenze in Prozent"
                />
                <p className="text-xs text-muted-foreground">
                  Erlaubte Abweichung vom Durchschnitt in Prozent
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes Card */}
        <Card>
          <CardHeader>
            <CardTitle>Bemerkungen (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              id="wizard-notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              placeholder="Optionale Bemerkungen zur Abrechnung..."
              rows={3}
              aria-label="Bemerkungen zur Abrechnung"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // STEP 3: Calculation & Preview
  function renderStep3() {
    const warnings = getPlausibilityWarnings();

    return (
      <div className="space-y-6">
        {/* Calculation trigger */}
        {!calculationResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Verteilung berechnen
              </CardTitle>
              <CardDescription>
                Die Berechnung erstellt die Abrechnung und verteilt den Erloes
                auf die Betreibergesellschaften basierend auf den
                Produktionsdaten.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary of inputs */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs text-muted-foreground">Park</p>
                  <p className="font-medium">{selectedPark?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Zeitraum</p>
                  <p className="font-medium">{formatPeriodLabel()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Einspeisung</p>
                  <p className="font-medium font-mono">
                    {formatKwh(Number(formData.productionKwh))} kWh
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Erloes</p>
                  <p className="font-medium font-mono">
                    {formatCurrency(Number(formData.revenueEur))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Verteilmodus
                  </p>
                  <p className="font-medium">
                    {distributionModeLabels[formData.distributionMode] ||
                      formData.distributionMode}
                  </p>
                </div>
                {formData.distributionMode === "SMOOTHED" && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Glaettungsfaktor
                    </p>
                    <p className="font-medium font-mono">
                      {formData.smoothingFactor.toFixed(2)}
                    </p>
                  </div>
                )}
                {formData.distributionMode === "TOLERATED" && (
                  <div>
                    <p className="text-xs text-muted-foreground">Toleranz</p>
                    <p className="font-medium font-mono">
                      {formData.tolerancePercentage}%
                    </p>
                  </div>
                )}
              </div>

              <Button
                onClick={handleCalculate}
                disabled={calculating}
                className="w-full sm:w-auto"
                size="lg"
              >
                {calculating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="mr-2 h-4 w-4" />
                )}
                {calculating ? "Wird berechnet..." : "Jetzt berechnen"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Calculation results */}
        {calculationResult && (
          <>
            {/* Plausibility warnings */}
            {warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Plausibilitaets-Hinweise</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-sm">
                        {w}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Results table */}
            <Card>
              <CardHeader>
                <CardTitle>Berechnungsergebnis</CardTitle>
                <CardDescription>
                  Verteilung des Erloeses von{" "}
                  {formatCurrency(
                    calculationResult.calculation.netOperatorRevenueEur
                  )}{" "}
                  auf {calculationResult.settlement.items.length} Positionen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Gesellschaft</TableHead>
                        <TableHead>Anlage</TableHead>
                        <TableHead className="text-right">
                          Produktion (kWh)
                        </TableHead>
                        <TableHead className="text-right">Anteil %</TableHead>
                        <TableHead className="text-right">
                          Betrag (EUR)
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculationResult.settlement.items.map(
                        (item: CalculationItem) => (
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
                            <TableCell className="text-right font-mono font-medium">
                              {formatCurrency(Number(item.revenueShareEur))}
                            </TableCell>
                          </TableRow>
                        )
                      )}
                      {/* Sum row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={2}>Summe</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatKwh(
                            calculationResult.settlement.items.reduce(
                              (sum: number, item: CalculationItem) =>
                                sum + Number(item.productionShareKwh),
                              0
                            )
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPercent(
                            calculationResult.settlement.items.reduce(
                              (sum: number, item: CalculationItem) =>
                                sum + Number(item.productionSharePct),
                              0
                            )
                          )}
                          %
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(
                            calculationResult.settlement.items.reduce(
                              (sum: number, item: CalculationItem) =>
                                sum + Number(item.revenueShareEur),
                              0
                            )
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Price per kWh info */}
                <p className="text-xs text-muted-foreground mt-3">
                  Durchschnittlicher Vergtuetungspreis:{" "}
                  <span className="font-mono">
                    {(
                      calculationResult.calculation.pricePerKwh * 100
                    ).toFixed(3)}{" "}
                    ct/kWh
                  </span>
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  // STEP 4: Invoices
  function renderStep4() {
    if (!calculationResult) return null;

    return (
      <div className="space-y-6">
        {/* Invoice preview / creation */}
        {!invoicesResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Gutschriften erstellen
              </CardTitle>
              <CardDescription>
                Fuer jede Berechnungsposition wird eine Gutschrift an die
                jeweilige Betreibergesellschaft erstellt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Preview of invoices to be created */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empfaenger</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead className="text-right">
                        Betrag (EUR)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calculationResult.settlement.items.map(
                      (item: CalculationItem) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.recipientFund?.name || "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            Stromerloes {formatPeriodLabel()} -{" "}
                            {selectedPark?.name || ""}
                            {item.turbine
                              ? ` - WKA ${item.turbine.designation}`
                              : ""}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatCurrency(Number(item.revenueShareEur))}
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Send immediately option */}
              <div className="flex items-start space-x-3 p-4 rounded-lg bg-muted/50">
                <Checkbox
                  id="send-immediately"
                  checked={sendImmediately}
                  onCheckedChange={(checked) =>
                    setSendImmediately(checked === true)
                  }
                />
                <div>
                  <Label
                    htmlFor="send-immediately"
                    className="font-medium cursor-pointer"
                  >
                    Gutschriften sofort freigeben
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Die Gutschriften werden nach Erstellung automatisch in den
                    Status &quot;Freigegeben&quot; gesetzt
                  </p>
                </div>
              </div>

              <Button
                onClick={handleCreateInvoices}
                disabled={creatingInvoices || approvingInvoices}
                className="w-full sm:w-auto"
                size="lg"
              >
                {creatingInvoices || approvingInvoices ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Receipt className="mr-2 h-4 w-4" />
                )}
                {creatingInvoices
                  ? "Gutschriften werden erstellt..."
                  : approvingInvoices
                    ? "Gutschriften werden freigegeben..."
                    : `${calculationResult.settlement.items.length} Gutschrift(en) erstellen`}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Created invoices */}
        {invoicesResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                Gutschriften erstellt
              </CardTitle>
              <CardDescription>{invoicesResult.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr.</TableHead>
                      <TableHead>Empfaenger</TableHead>
                      <TableHead className="text-right">
                        Betrag (EUR)
                      </TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesResult.invoices.map((inv) => {
                      // Try to get status from settlement items
                      const settlementItem =
                        invoicesResult.settlement?.items?.find(
                          (item) => item.invoice?.id === inv.invoiceId
                        );
                      const status =
                        settlementItem?.invoice?.status || "DRAFT";

                      return (
                        <TableRow key={inv.invoiceId}>
                          <TableCell className="font-mono text-sm">
                            {inv.invoiceNumber}
                          </TableCell>
                          <TableCell className="font-medium">
                            {inv.recipientFund}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(inv.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                status === "APPROVED"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }
                            >
                              {status === "APPROVED"
                                ? "Freigegeben"
                                : status === "DRAFT"
                                  ? "Entwurf"
                                  : status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4 p-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">Gesamtbetrag</span>
                <span className="text-lg font-bold font-mono">
                  {formatCurrency(invoicesResult.summary.totalAmount)}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // STEP 5: Summary
  function renderStep5() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Abrechnung abgeschlossen
            </CardTitle>
            <CardDescription>
              Die Jahresendabrechnung wurde erfolgreich durchgefuehrt
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Park</p>
                <p className="font-medium">{selectedPark?.name || "-"}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Zeitraum</p>
                <p className="font-medium">{formatPeriodLabel()}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Gesamterloes</p>
                <p className="font-medium font-mono">
                  {formatCurrency(Number(formData.revenueEur))}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Verteilmodus</p>
                <p className="font-medium">
                  {distributionModeLabels[formData.distributionMode] ||
                    formData.distributionMode}
                </p>
              </div>
            </div>

            <Separator />

            {/* Invoices table */}
            {invoicesResult && (
              <div>
                <h3 className="text-sm font-medium mb-3">
                  Erstellte Gutschriften ({invoicesResult.invoices.length})
                </h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Gutschrift-Nr.</TableHead>
                        <TableHead>Empfaenger</TableHead>
                        <TableHead className="text-right">
                          Betrag (EUR)
                        </TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoicesResult.invoices.map((inv) => {
                        const settlementItem =
                          invoicesResult.settlement?.items?.find(
                            (item) => item.invoice?.id === inv.invoiceId
                          );
                        const status =
                          settlementItem?.invoice?.status || "DRAFT";

                        return (
                          <TableRow key={inv.invoiceId}>
                            <TableCell className="font-mono text-sm">
                              {inv.invoiceNumber}
                            </TableCell>
                            <TableCell className="font-medium">
                              {inv.recipientFund}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(inv.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={
                                  status === "APPROVED"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-gray-100 text-gray-800"
                                }
                              >
                                {status === "APPROVED"
                                  ? "Freigegeben"
                                  : status === "DRAFT"
                                    ? "Entwurf"
                                    : status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Neue Abrechnung starten
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/energy/settlements">
              <FileText className="mr-2 h-4 w-4" />
              Zur Uebersicht
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function renderStepContent() {
    switch (step) {
      case 0:
        return renderStep1();
      case 1:
        return renderStep2();
      case 2:
        return renderStep3();
      case 3:
        return renderStep4();
      case 4:
        return renderStep5();
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/energy/settlements" aria-label="Zurueck zur Uebersicht">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Abrechnung erstellen
          </h1>
          <p className="text-muted-foreground">
            Gefuehrter Prozess in {WIZARD_STEPS.length} Schritten
          </p>
        </div>
      </div>

      {/* Stepper */}
      <Stepper
        steps={WIZARD_STEPS}
        currentStep={step}
        onStepClick={(clickedStep) => {
          // Only allow navigating to completed steps
          if (clickedStep < step) {
            if (step >= 2 && clickedStep < 2 && settlementId) {
              const confirmed = window.confirm(
                "Wenn Sie zurueckgehen, wird die bestehende Berechnung verworfen. Fortfahren?"
              );
              if (!confirmed) return;
            }
            setStep(clickedStep);
          }
        }}
      />

      {/* Step Content */}
      <StepContent>{renderStepContent()}</StepContent>

      {/* Step Actions */}
      {step < 4 && (
        <StepActions>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/energy/settlements">Abbrechen</Link>
            </Button>
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurueck
            </Button>
          </div>

          {step < 2 && (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Weiter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 2 && calculationResult && (
            <Button onClick={handleNext}>
              Weiter zu Gutschriften
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {step === 3 && invoicesResult && (
            <Button onClick={handleNext}>
              Zur Zusammenfassung
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </StepActions>
      )}
    </div>
  );
}
