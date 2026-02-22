"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  RefreshCw,
  Wind,
  AlertTriangle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import { toast } from "sonner";
import {
  getSettlementPeriodLabel,
  SETTLEMENT_STATUS_LABELS,
} from "@/types/billing";

// ============================================================================
// Types
// ============================================================================

interface Park {
  id: string;
  name: string;
  shortName: string | null;
}

interface LeaseInfo {
  id: string;
  status: string;
  lessor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  };
  leasePlots: Array<{
    id: string;
    plot: {
      id: string;
      plotNumber: string;
      cadastralDistrict: string;
      areaSqm: number | null;
    };
  }>;
}

interface EnergySettlement {
  id: string;
  year: number;
  month: number | null;
  status: string;
  netOperatorRevenueEur: number;
  eegProductionKwh: number | null;
  eegRevenueEur: number | null;
  dvProductionKwh: number | null;
  dvRevenueEur: number | null;
  totalProductionKwh: number | null;
  netOperatorReference: string | null;
  park?: { name: string };
}

interface MonthlyEntry {
  eegProductionKwh: string;
  eegRevenueEur: string;
  dvProductionKwh: string;
  dvRevenueEur: string;
}

// Calculation result types matching the API response
interface AdvanceLease {
  leaseId: string;
  lessorId: string;
  lessorName: string;
  lessorAddress: string | null;
  monthlyMinimumRent: number;
  plotCount: number;
}

interface AdvanceCalculation {
  parkId: string;
  parkName: string;
  year: number;
  month: number;
  periodType: "ADVANCE";
  calculatedAt: string;
  minimumRentPerTurbine: number | null;
  leases: AdvanceLease[];
  totals: {
    leaseCount: number;
    totalMonthlyMinimumRent: number;
  };
}

interface FinalLease {
  leaseId: string;
  lessorId: string;
  lessorName: string;
  lessorAddress: string | null;
  totalMinimumRent: number;
  totalRevenueShare: number;
  alreadyPaidAdvances: number;
  finalPayment: number;
  isCredit: boolean;
}

interface FinalCalculation {
  parkId: string;
  parkName: string;
  year: number;
  periodType: "FINAL";
  calculatedAt: string;
  totalRevenue: number;
  revenuePhasePercentage: number | null;
  leases: FinalLease[];
  totals: {
    leaseCount: number;
    totalMinimumRent: number;
    totalRevenueShare: number;
    totalAdvancesPaid: number;
    totalFinalPayment: number;
  };
}

interface ExistingSettlement {
  id: string;
  year: number;
  month: number | null;
  periodType: string;
  advanceInterval: string | null;
  status: string;
  totalParkRevenueEur: number | string | null;
  actualFeeEur: number | string | null;
  calculatedFeeEur: number | string | null;
  createdAt: string;
  park?: { id: string; name: string };
}

type CalculationResult = AdvanceCalculation | FinalCalculation;

// ============================================================================
// Constants
// ============================================================================

const STEPS = [
  { id: "park", title: "Park & Zeitraum", description: "Grunddaten" },
  { id: "revenue", title: "Umsatzdaten", description: "Erloese" },
  { id: "calculation", title: "Berechnung & Vorschau", description: "Vorschau" },
  { id: "summary", title: "Abschluss", description: "Gutschriften" },
];

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "Maerz",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

// ============================================================================
// Helper: Format EUR currency
// ============================================================================

function formatEur(value: number): string {
  return value.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

// ============================================================================
// Status badge helper
// ============================================================================

function getStatusBadge(status: string) {
  const label = SETTLEMENT_STATUS_LABELS[status as keyof typeof SETTLEMENT_STATUS_LABELS] || status;
  const variantMap: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    OPEN: "outline",
    ADVANCE_CREATED: "secondary",
    CALCULATED: "default",
    SETTLED: "default",
    PENDING_REVIEW: "secondary",
    APPROVED: "default",
    CLOSED: "secondary",
    CANCELLED: "destructive",
  };
  const variant = variantMap[status] || "outline";
  return <Badge variant={variant}>{label}</Badge>;
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function NewLeaseSettlementPage() {
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Park & Zeitraum
  const [parks, setParks] = useState<Park[]>([]);
  const [loadingParks, setLoadingParks] = useState(true);
  const [selectedParkId, setSelectedParkId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [periodType, setPeriodType] = useState<"FINAL" | "ADVANCE">("FINAL");
  const [advanceInterval, setAdvanceInterval] = useState<"YEARLY" | "QUARTERLY" | "MONTHLY">("QUARTERLY");
  const [selectedMonth, setSelectedMonth] = useState<number>(1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(1);
  const [leases, setLeases] = useState<LeaseInfo[]>([]);
  const [loadingLeases, setLoadingLeases] = useState(false);

  // Step 2: Umsatzdaten
  const [revenueSource, setRevenueSource] = useState<"auto" | "manual">("auto");
  const [energySettlements, setEnergySettlements] = useState<EnergySettlement[]>([]);
  const [loadingEnergySettlements, setLoadingEnergySettlements] = useState(false);
  const [monthlyData, setMonthlyData] = useState<MonthlyEntry[]>(
    Array.from({ length: 12 }, () => ({
      eegProductionKwh: "",
      eegRevenueEur: "",
      dvProductionKwh: "",
      dvRevenueEur: "",
    }))
  );
  const [savingMonthlyData, setSavingMonthlyData] = useState(false);

  // Step 3: Berechnung
  const [createdSettlementId, setCreatedSettlementId] = useState<string | null>(null);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Step 4: Gutschriften
  const [creatingInvoices, setCreatingInvoices] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    recipientName: string;
    grossAmount: number;
  }> | null>(null);

  // Existing settlements (collapsible history)
  const [existingSettlements, setExistingSettlements] = useState<ExistingSettlement[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [showExisting, setShowExisting] = useState(false);

  // =========================================================================
  // Data Loading
  // =========================================================================

  // Load parks on mount
  useEffect(() => {
    async function fetchParks() {
      try {
        const res = await fetch("/api/parks?limit=100");
        if (res.ok) {
          const data = await res.json();
          setParks(data.parks || data.data || []);
        } else {
          toast.error("Fehler beim Laden der Windparks");
        }
      } catch {
        toast.error("Netzwerkfehler beim Laden der Windparks");
      } finally {
        setLoadingParks(false);
      }
    }
    fetchParks();
  }, []);

  // Load leases when park changes
  useEffect(() => {
    if (!selectedParkId) {
      setLeases([]);
      return;
    }

    let cancelled = false;

    async function fetchLeases() {
      setLoadingLeases(true);
      try {
        const res = await fetch(
          `/api/leases?parkId=${selectedParkId}&status=ACTIVE&limit=500`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setLeases(data.leases || data.data || []);
        }
      } catch {
        if (!cancelled) toast.error("Fehler beim Laden der Pachtvertraege");
      } finally {
        if (!cancelled) setLoadingLeases(false);
      }
    }

    fetchLeases();
    return () => {
      cancelled = true;
    };
  }, [selectedParkId]);

  // Load energy settlements when park + year changes and type is FINAL
  useEffect(() => {
    if (!selectedParkId || periodType !== "FINAL") {
      setEnergySettlements([]);
      return;
    }

    let cancelled = false;

    async function fetchEnergySettlements() {
      setLoadingEnergySettlements(true);
      try {
        const res = await fetch(
          `/api/energy/settlements?parkId=${selectedParkId}&year=${year}&limit=50`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setEnergySettlements(data.settlements || data.data || []);
        }
      } catch {
        // Energy settlements may not exist; silently ignore
      } finally {
        if (!cancelled) setLoadingEnergySettlements(false);
      }
    }

    fetchEnergySettlements();
    return () => {
      cancelled = true;
    };
  }, [selectedParkId, year, periodType]);

  // Auto-populate monthlyData when energy settlements change (for manual pre-fill)
  useEffect(() => {
    if (energySettlements.length === 0) return;
    setMonthlyData((prev) => {
      const next = prev.map((m) => ({ ...m }));
      for (const es of energySettlements) {
        if (es.month && es.month >= 1 && es.month <= 12) {
          const idx = es.month - 1;
          next[idx] = {
            eegProductionKwh: es.eegProductionKwh != null ? String(es.eegProductionKwh) : "",
            eegRevenueEur: es.eegRevenueEur != null ? String(es.eegRevenueEur) : "",
            dvProductionKwh: es.dvProductionKwh != null ? String(es.dvProductionKwh) : "",
            dvRevenueEur: es.dvRevenueEur != null ? String(es.dvRevenueEur) : "",
          };
        }
      }
      return next;
    });
  }, [energySettlements]);

  // Load existing settlements for the selected park + year
  const loadExistingSettlements = useCallback(async () => {
    if (!selectedParkId) return;
    setLoadingExisting(true);
    try {
      const res = await fetch(
        `/api/leases/settlement?parkId=${selectedParkId}&year=${year}&limit=50`
      );
      if (res.ok) {
        const data = await res.json();
        setExistingSettlements(data.settlements || data.data || []);
      }
    } catch {
      // Non-critical, ignore
    } finally {
      setLoadingExisting(false);
    }
  }, [selectedParkId, year]);

  useEffect(() => {
    if (selectedParkId && year > 0) {
      loadExistingSettlements();
    }
  }, [selectedParkId, year, loadExistingSettlements]);

  // =========================================================================
  // Computed values
  // =========================================================================

  const leaseSummary = (() => {
    const plotCount = leases.reduce((sum, l) => sum + (l.leasePlots?.length || 0), 0);
    const totalArea = leases.reduce((sum, l) => {
      return (
        sum +
        (l.leasePlots?.reduce(
          (s, lp) => s + (lp.plot?.areaSqm ? Number(lp.plot.areaSqm) : 0),
          0
        ) || 0)
      );
    }, 0);
    return { leaseCount: leases.length, plotCount, totalArea };
  })();

  // Aggregate finalized energy settlements for auto mode
  const autoRevenueData = (() => {
    const finalized = energySettlements.filter(
      (es) => es.status === "INVOICED" || es.status === "CLOSED"
    );
    const totalRevenue = finalized.reduce((sum, es) => sum + Number(es.netOperatorRevenueEur || 0), 0);
    const eegRevenue = finalized.reduce((sum, es) => sum + Number(es.eegRevenueEur || 0), 0);
    const dvRevenue = finalized.reduce((sum, es) => sum + Number(es.dvRevenueEur || 0), 0);
    const totalProduction = finalized.reduce((sum, es) => sum + Number(es.totalProductionKwh || 0), 0);
    return { totalRevenue, eegRevenue, dvRevenue, totalProduction, count: finalized.length };
  })();

  // Manual mode totals from 48 fields
  const manualTotals = (() => {
    let eegKwh = 0, eegEur = 0, dvKwh = 0, dvEur = 0;
    for (const m of monthlyData) {
      eegKwh += parseFloat(m.eegProductionKwh) || 0;
      eegEur += parseFloat(m.eegRevenueEur) || 0;
      dvKwh += parseFloat(m.dvProductionKwh) || 0;
      dvEur += parseFloat(m.dvRevenueEur) || 0;
    }
    return { eegKwh, eegEur, dvKwh, dvEur, total: eegEur + dvEur };
  })();

  const effectiveRevenue = (() => {
    if (periodType === "ADVANCE") return 0;
    if (revenueSource === "auto") return autoRevenueData.totalRevenue;
    if (revenueSource === "manual") return manualTotals.total;
    return 0;
  })();

  // Determine the month value for API based on interval selection
  const effectiveMonth = (() => {
    if (periodType !== "ADVANCE") return null;
    if (advanceInterval === "YEARLY") return null;
    if (advanceInterval === "QUARTERLY") {
      // Q1=1, Q2=4, Q3=7, Q4=10
      return (selectedQuarter - 1) * 3 + 1;
    }
    if (advanceInterval === "MONTHLY") {
      return selectedMonth;
    }
    return null;
  })();

  // =========================================================================
  // Validation
  // =========================================================================

  function canProceed(): boolean {
    switch (currentStep) {
      case 0:
        return !!selectedParkId && year > 0 && leaseSummary.leaseCount > 0;
      case 1:
        if (periodType === "ADVANCE") return true;
        return effectiveRevenue > 0;
      case 2:
        return calculationResult !== null;
      case 3:
        return true;
      default:
        return false;
    }
  }

  // =========================================================================
  // Actions
  // =========================================================================

  async function saveMonthlyData(): Promise<boolean> {
    if (!selectedParkId || revenueSource !== "manual") return true;

    const entries = monthlyData
      .map((m, idx) => ({
        month: idx + 1,
        eegProductionKwh: parseFloat(m.eegProductionKwh) || null,
        eegRevenueEur: parseFloat(m.eegRevenueEur) || null,
        dvProductionKwh: parseFloat(m.dvProductionKwh) || null,
        dvRevenueEur: parseFloat(m.dvRevenueEur) || null,
      }))
      .filter(
        (e) =>
          e.eegProductionKwh !== null ||
          e.eegRevenueEur !== null ||
          e.dvProductionKwh !== null ||
          e.dvRevenueEur !== null
      );

    if (entries.length === 0) return true;

    setSavingMonthlyData(true);
    try {
      const res = await fetch("/api/energy/settlements/batch-upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId: selectedParkId,
          year,
          entries,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Speicherfehler" }));
        throw new Error(err.error || "Fehler beim Speichern der Monatsdaten");
      }

      const data = await res.json();
      if (data.settlements) {
        setEnergySettlements(data.settlements);
      }
      toast.success(data.message || "Monatsdaten gespeichert");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
      return false;
    } finally {
      setSavingMonthlyData(false);
    }
  }

  async function handleCalculate() {
    setCalculating(true);
    setCalculationResult(null);

    try {
      // Step A: Create the settlement period record
      const createPayload: Record<string, unknown> = {
        parkId: selectedParkId,
        year,
        periodType,
      };

      if (periodType === "ADVANCE") {
        createPayload.advanceInterval = advanceInterval;
        if (advanceInterval === "MONTHLY") {
          createPayload.month = selectedMonth;
        } else if (advanceInterval === "QUARTERLY") {
          createPayload.month = effectiveMonth;
        }
        // YEARLY: no month needed
      }

      const createRes = await fetch("/api/leases/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPayload),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || err.details || `HTTP ${createRes.status}`);
      }

      const periodData = await createRes.json();
      const settlementId = periodData.settlement?.id || periodData.id;
      setCreatedSettlementId(settlementId);

      // Step B: Trigger calculation
      const calcPayload: Record<string, unknown> = {
        saveResult: true,
      };

      if (periodType === "FINAL" && effectiveRevenue > 0) {
        calcPayload.totalRevenue = effectiveRevenue;
      }

      const calcRes = await fetch(
        `/api/leases/settlement/${settlementId}/calculate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(calcPayload),
        }
      );

      if (!calcRes.ok) {
        const err = await calcRes.json().catch(() => ({ error: "Berechnungsfehler" }));
        throw new Error(err.error || err.details || `HTTP ${calcRes.status}`);
      }

      const calcData = await calcRes.json();
      setCalculationResult(calcData.calculation);
      toast.success("Berechnung erfolgreich abgeschlossen");

      // Reload existing settlements
      loadExistingSettlements();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler bei der Berechnung"
      );
    } finally {
      setCalculating(false);
    }
  }

  async function handleRecalculate() {
    if (!createdSettlementId) return;

    setCalculating(true);
    setCalculationResult(null);

    try {
      const calcPayload: Record<string, unknown> = {
        saveResult: true,
      };

      if (periodType === "FINAL" && effectiveRevenue > 0) {
        calcPayload.totalRevenue = effectiveRevenue;
      }

      const calcRes = await fetch(
        `/api/leases/settlement/${createdSettlementId}/calculate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(calcPayload),
        }
      );

      if (!calcRes.ok) {
        const err = await calcRes.json().catch(() => ({ error: "Berechnungsfehler" }));
        throw new Error(err.error || err.details || `HTTP ${calcRes.status}`);
      }

      const calcData = await calcRes.json();
      setCalculationResult(calcData.calculation);
      toast.success("Neuberechnung erfolgreich");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler bei der Neuberechnung"
      );
    } finally {
      setCalculating(false);
    }
  }

  async function handleCreateInvoices() {
    if (!createdSettlementId) {
      toast.error("Keine Abrechnungsperiode vorhanden");
      return;
    }

    setCreatingInvoices(true);
    try {
      const res = await fetch(
        `/api/leases/settlement/${createdSettlementId}/invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceDate: new Date().toISOString(),
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Erstellen der Gutschriften");
      }

      const result = await res.json();
      setInvoiceResult(result.invoices || []);
      toast.success(result.message || "Gutschriften erfolgreich erstellt");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Gutschriften"
      );
    } finally {
      setCreatingInvoices(false);
    }
  }

  function handleReset() {
    setCurrentStep(0);
    setSelectedParkId("");
    setYear(new Date().getFullYear() - 1);
    setPeriodType("FINAL");
    setAdvanceInterval("QUARTERLY");
    setSelectedMonth(1);
    setSelectedQuarter(1);
    setLeases([]);
    setRevenueSource("auto");
    setMonthlyData(
      Array.from({ length: 12 }, () => ({
        eegProductionKwh: "",
        eegRevenueEur: "",
        dvProductionKwh: "",
        dvRevenueEur: "",
      }))
    );
    setCreatedSettlementId(null);
    setCalculationResult(null);
    setCreatingInvoices(false);
    setInvoiceResult(null);
    setExistingSettlements([]);
    setShowExisting(false);
  }

  // =========================================================================
  // Step 1: Park & Zeitraum
  // =========================================================================

  function renderStep1() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wind className="h-5 w-5" />
              Park und Abrechnungszeitraum
            </CardTitle>
            <CardDescription>
              Waehlen Sie den Windpark, das Abrechnungsjahr und den Abrechnungstyp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Windpark */}
            <div className="space-y-2">
              <Label htmlFor="park-select">Windpark *</Label>
              {loadingParks ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parks werden geladen...
                </div>
              ) : (
                <Select
                  value={selectedParkId}
                  onValueChange={(v) => {
                    setSelectedParkId(v);
                    setCreatedSettlementId(null);
                    setCalculationResult(null);
                    setInvoiceResult(null);
                  }}
                >
                  <SelectTrigger id="park-select">
                    <SelectValue placeholder="Windpark auswaehlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {parks.map((park) => (
                      <SelectItem key={park.id} value={park.id}>
                        {park.name}
                        {park.shortName ? ` (${park.shortName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Jahr */}
            <div className="space-y-2">
              <Label htmlFor="year-input">Jahr *</Label>
              <Input
                id="year-input"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => {
                  setYear(parseInt(e.target.value, 10) || 0);
                  setCreatedSettlementId(null);
                  setCalculationResult(null);
                  setInvoiceResult(null);
                }}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Pacht wird nachtraeglich abgerechnet - Standard ist das Vorjahr.
              </p>
            </div>

            <Separator />

            {/* Abrechnungstyp */}
            <div className="space-y-3">
              <Label>Abrechnungstyp</Label>
              <RadioGroup
                value={periodType}
                onValueChange={(v) => {
                  setPeriodType(v as "FINAL" | "ADVANCE");
                  setCreatedSettlementId(null);
                  setCalculationResult(null);
                  setInvoiceResult(null);
                }}
                className="space-y-3"
              >
                <div
                  className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    periodType === "FINAL"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setPeriodType("FINAL");
                    setCreatedSettlementId(null);
                    setCalculationResult(null);
                    setInvoiceResult(null);
                  }}
                >
                  <RadioGroupItem value="FINAL" id="type-final" className="mt-0.5" />
                  <div>
                    <Label htmlFor="type-final" className="font-medium cursor-pointer">
                      Jahresendabrechnung (FINAL)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Umsatzbasierte Abrechnung mit Vorschuss-Verrechnung
                    </p>
                  </div>
                </div>
                <div
                  className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    periodType === "ADVANCE"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setPeriodType("ADVANCE");
                    setCreatedSettlementId(null);
                    setCalculationResult(null);
                    setInvoiceResult(null);
                  }}
                >
                  <RadioGroupItem value="ADVANCE" id="type-advance" className="mt-0.5" />
                  <div>
                    <Label htmlFor="type-advance" className="font-medium cursor-pointer">
                      Vorschuss (ADVANCE)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Regelmaessige Abschlagszahlung auf Basis der Mindestpacht
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Intervall (only for ADVANCE) */}
            {periodType === "ADVANCE" && (
              <div className="space-y-4 ml-6 pl-4 border-l-2 border-muted">
                <div className="space-y-3">
                  <Label>Intervall</Label>
                  <RadioGroup
                    value={advanceInterval}
                    onValueChange={(v) => {
                      setAdvanceInterval(v as "YEARLY" | "QUARTERLY" | "MONTHLY");
                      setCreatedSettlementId(null);
                      setCalculationResult(null);
                      setInvoiceResult(null);
                    }}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="MONTHLY" id="interval-monthly" />
                      <Label htmlFor="interval-monthly" className="cursor-pointer">
                        Monatlich (1/12 des Jahresbetrags)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="QUARTERLY" id="interval-quarterly" />
                      <Label htmlFor="interval-quarterly" className="cursor-pointer">
                        Quartal (1/4 des Jahresbetrags)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="YEARLY" id="interval-yearly" />
                      <Label htmlFor="interval-yearly" className="cursor-pointer">
                        Jaehrlich (voller Jahresbetrag)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Quarter selector */}
                {advanceInterval === "QUARTERLY" && (
                  <div className="space-y-2">
                    <Label htmlFor="quarter-select">Quartal *</Label>
                    <Select
                      value={String(selectedQuarter)}
                      onValueChange={(v) => {
                        setSelectedQuarter(parseInt(v, 10));
                        setCreatedSettlementId(null);
                        setCalculationResult(null);
                        setInvoiceResult(null);
                      }}
                    >
                      <SelectTrigger id="quarter-select" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Q1 (Jan - Mrz)</SelectItem>
                        <SelectItem value="2">Q2 (Apr - Jun)</SelectItem>
                        <SelectItem value="3">Q3 (Jul - Sep)</SelectItem>
                        <SelectItem value="4">Q4 (Okt - Dez)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Month selector */}
                {advanceInterval === "MONTHLY" && (
                  <div className="space-y-2">
                    <Label htmlFor="month-select">Monat *</Label>
                    <Select
                      value={String(selectedMonth)}
                      onValueChange={(v) => {
                        setSelectedMonth(parseInt(v, 10));
                        setCreatedSettlementId(null);
                        setCalculationResult(null);
                        setInvoiceResult(null);
                      }}
                    >
                      <SelectTrigger id="month-select" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_NAMES.map((name, idx) => (
                          <SelectItem key={idx + 1} value={String(idx + 1)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lease Summary Card */}
        {selectedParkId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Aktive Pachtvertraege</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingLeases ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Pachtvertraege werden geladen...
                </div>
              ) : leaseSummary.leaseCount === 0 ? (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  Keine aktiven Pachtvertraege fuer diesen Park gefunden. Eine Abrechnung ist nicht moeglich.
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>
                    <strong>{leaseSummary.leaseCount}</strong> aktive Pachtvertraege
                    {leaseSummary.plotCount > 0 && (
                      <>
                        {" "}mit <strong>{leaseSummary.plotCount}</strong> Fluerstuecken
                      </>
                    )}
                    {leaseSummary.totalArea > 0 && (
                      <>
                        {" "}und <strong>{leaseSummary.totalArea.toLocaleString("de-DE")} m&#178;</strong> Gesamtflaeche
                      </>
                    )}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Existing Periods Card (collapsible) */}
        {selectedParkId && (
          <div className="space-y-2">
            <button
              onClick={() => setShowExisting(!showExisting)}
              className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
              aria-expanded={showExisting}
            >
              {showExisting ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Bisherige Abrechnungen fuer {year}
              {existingSettlements.length > 0 && (
                <Badge variant="secondary">{existingSettlements.length}</Badge>
              )}
            </button>

            {showExisting && (
              <Card>
                <CardContent className="pt-6">
                  {loadingExisting ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Abrechnungen werden geladen...
                    </div>
                  ) : existingSettlements.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Keine bisherigen Abrechnungen fuer diesen Park und dieses Jahr vorhanden.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Periode</TableHead>
                            <TableHead>Typ</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Betrag</TableHead>
                            <TableHead>Erstellt am</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {existingSettlements.map((settlement) => (
                            <TableRow key={settlement.id}>
                              <TableCell className="font-medium">
                                {getSettlementPeriodLabel(
                                  settlement.periodType,
                                  settlement.advanceInterval,
                                  settlement.month,
                                  settlement.year
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {settlement.periodType === "ADVANCE"
                                    ? "Vorschuss"
                                    : "Endabrechnung"}
                                </Badge>
                              </TableCell>
                              <TableCell>{getStatusBadge(settlement.status)}</TableCell>
                              <TableCell className="text-right">
                                {settlement.actualFeeEur
                                  ? formatEur(Number(settlement.actualFeeEur))
                                  : settlement.calculatedFeeEur
                                    ? formatEur(Number(settlement.calculatedFeeEur))
                                    : "-"}
                              </TableCell>
                              <TableCell>
                                {new Date(settlement.createdAt).toLocaleDateString("de-DE")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // Step 2: Umsatzdaten
  // =========================================================================

  function renderStep2() {
    // For ADVANCE: no revenue data needed
    if (periodType === "ADVANCE") {
      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                Vorschussberechnung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <p className="text-sm font-medium text-blue-800">
                  Vorschuesse basieren auf der Mindestpacht. Kein Umsatz erforderlich.
                </p>
                <p className="text-sm text-blue-700">
                  {advanceInterval === "YEARLY"
                    ? `Der Jahresvorschuss fuer ${year} wird aus der vollen Jahresmindestpacht berechnet.`
                    : advanceInterval === "QUARTERLY"
                      ? `Der Quartalsvorschuss Q${selectedQuarter} ${year} wird als 1/4 der Jahresmindestpacht berechnet.`
                      : `Der Monatsvorschuss ${MONTH_NAMES[selectedMonth - 1]} ${year} wird als 1/12 der Jahresmindestpacht berechnet.`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // FINAL: Revenue data needed
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Umsatzdaten fuer {year}
            </CardTitle>
            <CardDescription>
              Waehlen Sie die Datenquelle fuer den Gesamtumsatz des Parks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Datenquelle */}
            <div className="space-y-3">
              <Label>Datenquelle</Label>
              <RadioGroup
                value={revenueSource}
                onValueChange={(v) => setRevenueSource(v as "auto" | "manual")}
                className="space-y-3"
              >
                {/* Auto from energy settlement */}
                <div
                  className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    revenueSource === "auto"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => setRevenueSource("auto")}
                >
                  <RadioGroupItem value="auto" id="revenue-auto" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="revenue-auto" className="font-medium cursor-pointer">
                      Automatisch aus Energieabrechnung
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Daten aus abgeschlossenen Energieabrechnungen uebernehmen
                    </p>
                  </div>
                </div>

                {/* Manual entry */}
                <div
                  className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    revenueSource === "manual"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => setRevenueSource("manual")}
                >
                  <RadioGroupItem value="manual" id="revenue-manual" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="revenue-manual" className="font-medium cursor-pointer">
                      Manuelle Erfassung (EEG/DV pro Monat)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      12 Monate mit EEG-Produktion, EEG-Erloes, DV-Produktion, DV-Erloes
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* Auto Mode: Yearly Summary */}
        {revenueSource === "auto" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Jahresuebersicht {year}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEnergySettlements ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Energieabrechnungen werden geladen...
                </div>
              ) : autoRevenueData.count === 0 ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                  <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      Keine abgeschlossenen Energieabrechnungen vorhanden
                    </p>
                    <p className="text-xs">
                      Fuer die automatische Uebernahme muessen Energieabrechnungen mit Status
                      &quot;Fakturiert&quot; oder &quot;Abgeschlossen&quot; vorhanden sein.
                      Alternativ koennen Sie die Daten manuell erfassen.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Gesamterloes</p>
                    <p className="text-xl font-bold">{formatEur(autoRevenueData.totalRevenue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {autoRevenueData.count} Monatsabrechnung(en)
                    </p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">EEG-Anteil</p>
                    <p className="text-lg font-semibold">{formatEur(autoRevenueData.eegRevenue)}</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">DV-Anteil</p>
                    <p className="text-lg font-semibold">{formatEur(autoRevenueData.dvRevenue)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Manual Mode: 48-field monthly table */}
        {revenueSource === "manual" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Monatliche EEG/DV-Erfassung {year}</CardTitle>
              <CardDescription>
                Geben Sie fuer jeden Monat die EEG- und DV-Werte ein.
                {energySettlements.length > 0 && " Vorhandene Daten wurden vorausgefuellt."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Monat</TableHead>
                      <TableHead className="text-right">EEG kWh</TableHead>
                      <TableHead className="text-right">EEG EUR</TableHead>
                      <TableHead className="text-right">DV kWh</TableHead>
                      <TableHead className="text-right">DV EUR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MONTH_NAMES.map((name, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">{name}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={monthlyData[idx].eegProductionKwh}
                            onChange={(e) => {
                              const next = monthlyData.map((m) => ({ ...m }));
                              next[idx].eegProductionKwh = e.target.value;
                              setMonthlyData(next);
                            }}
                            placeholder="0"
                            className="w-28 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={monthlyData[idx].eegRevenueEur}
                            onChange={(e) => {
                              const next = monthlyData.map((m) => ({ ...m }));
                              next[idx].eegRevenueEur = e.target.value;
                              setMonthlyData(next);
                            }}
                            placeholder="0,00"
                            className="w-28 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={monthlyData[idx].dvProductionKwh}
                            onChange={(e) => {
                              const next = monthlyData.map((m) => ({ ...m }));
                              next[idx].dvProductionKwh = e.target.value;
                              setMonthlyData(next);
                            }}
                            placeholder="0"
                            className="w-28 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={monthlyData[idx].dvRevenueEur}
                            onChange={(e) => {
                              const next = monthlyData.map((m) => ({ ...m }));
                              next[idx].dvRevenueEur = e.target.value;
                              setMonthlyData(next);
                            }}
                            placeholder="0,00"
                            className="w-28 text-right"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="border-t-2 font-bold bg-muted/30">
                      <TableCell>Summe</TableCell>
                      <TableCell className="text-right text-sm">
                        {manualTotals.eegKwh.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatEur(manualTotals.eegEur)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {manualTotals.dvKwh.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatEur(manualTotals.dvEur)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Revenue Summary Card */}
        {effectiveRevenue > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Umsatz-Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/50 rounded-lg space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Gesamtumsatz:</span>{" "}
                  <span className="font-semibold text-lg">{formatEur(effectiveRevenue)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {revenueSource === "manual"
                    ? "Die Daten werden beim Fortfahren als Energieabrechnungen gespeichert."
                    : "Die genaue Aufteilung wird im naechsten Schritt berechnet (MAX-Regel)."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // =========================================================================
  // Step 3: Berechnung & Vorschau
  // =========================================================================

  function renderStep3() {
    return (
      <div className="space-y-6">
        {/* Calculate button */}
        {!calculationResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Berechnung starten
              </CardTitle>
              <CardDescription>
                {periodType === "FINAL"
                  ? `Jahresendabrechnung fuer ${year} mit ${formatEur(effectiveRevenue)} Umsatz`
                  : advanceInterval === "YEARLY"
                    ? `Jahresvorschuss fuer ${year}`
                    : advanceInterval === "QUARTERLY"
                      ? `Quartalsvorschuss Q${selectedQuarter} ${year}`
                      : `Monatsvorschuss ${MONTH_NAMES[selectedMonth - 1]} ${year}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleCalculate}
                disabled={calculating}
                size="lg"
                className="w-full sm:w-auto"
              >
                {calculating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Berechnung laeuft...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Berechnung starten
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Results: FINAL */}
        {calculationResult && periodType === "FINAL" && renderFinalResults()}

        {/* Results: ADVANCE */}
        {calculationResult && periodType === "ADVANCE" && renderAdvanceResults()}

        {/* Recalculate button */}
        {calculationResult && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleRecalculate}
              disabled={calculating}
            >
              {calculating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Neu berechnen
            </Button>
          </div>
        )}
      </div>
    );
  }

  function renderFinalResults() {
    const calc = calculationResult as FinalCalculation;
    if (!calc) return null;

    const hasNegativePayments = calc.leases.some((l) => l.finalPayment < 0);

    return (
      <Card>
        <CardHeader>
          <CardTitle>Berechnungsergebnis - Jahresendabrechnung {calc.year}</CardTitle>
          <CardDescription>
            {calc.parkName} | Umsatz: {formatEur(calc.totalRevenue)}
            {calc.revenuePhasePercentage !== null &&
              ` | Erloesphase: ${calc.revenuePhasePercentage}%`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasNegativePayments && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Achtung: Ueberzahlung bei mindestens einem Verpachter
                </p>
                <p className="text-xs">
                  Ein negativer Restbetrag bedeutet, dass mehr Vorschuesse gezahlt
                  wurden als die tatsaechliche Pacht betraegt.
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Verpachter</TableHead>
                  <TableHead className="text-right">Gesamt</TableHead>
                  <TableHead className="text-right">Vorschuesse (gezahlt)</TableHead>
                  <TableHead className="text-right">Restbetrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.leases.map((lease) => {
                  const grossAmount = Math.max(lease.totalMinimumRent, lease.totalRevenueShare);
                  return (
                    <TableRow key={lease.leaseId}>
                      <TableCell className="font-medium">{lease.lessorName}</TableCell>
                      <TableCell className="text-right">
                        {formatEur(grossAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEur(lease.alreadyPaidAdvances)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          lease.finalPayment < 0 ? "text-red-600" : ""
                        }`}
                      >
                        {formatEur(lease.finalPayment)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Summary row */}
                <TableRow className="border-t-2 font-bold">
                  <TableCell>Gesamt ({calc.totals.leaseCount} Vertraege)</TableCell>
                  <TableCell className="text-right">
                    {formatEur(
                      Math.max(calc.totals.totalMinimumRent, calc.totals.totalRevenueShare)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatEur(calc.totals.totalAdvancesPaid)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatEur(calc.totals.totalFinalPayment)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderAdvanceResults() {
    const calc = calculationResult as AdvanceCalculation;
    if (!calc) return null;

    const columnLabel =
      advanceInterval === "YEARLY"
        ? "Jahresvorschuss"
        : advanceInterval === "QUARTERLY"
          ? "Quartalsvorschuss"
          : "Monatsvorschuss";

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            Berechnungsergebnis - {columnLabel}{" "}
            {advanceInterval === "YEARLY"
              ? `${calc.year}`
              : advanceInterval === "QUARTERLY"
                ? `Q${selectedQuarter} ${calc.year}`
                : `${MONTH_NAMES[calc.month - 1]} ${calc.year}`}
          </CardTitle>
          <CardDescription>
            {calc.parkName}
            {calc.minimumRentPerTurbine !== null &&
              ` | Mindestpacht/WKA: ${formatEur(calc.minimumRentPerTurbine)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Verpachter</TableHead>
                  <TableHead className="text-right">Fluerstuecke</TableHead>
                  <TableHead className="text-right">{columnLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.leases.map((lease) => (
                  <TableRow key={lease.leaseId}>
                    <TableCell className="font-medium">{lease.lessorName}</TableCell>
                    <TableCell className="text-right">{lease.plotCount}</TableCell>
                    <TableCell className="text-right">
                      {formatEur(lease.monthlyMinimumRent)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Summary row */}
                <TableRow className="border-t-2 font-bold">
                  <TableCell>Gesamt ({calc.totals.leaseCount} Vertraege)</TableCell>
                  <TableCell />
                  <TableCell className="text-right">
                    {formatEur(calc.totals.totalMonthlyMinimumRent)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  // =========================================================================
  // Step 4: Abschluss & Gutschriften
  // =========================================================================

  function renderStep4() {
    const selectedPark = parks.find((p) => p.id === selectedParkId);

    return (
      <div className="space-y-6">
        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              Zusammenfassung
            </CardTitle>
            <CardDescription>
              Die Pachtabrechnung wurde erfolgreich berechnet und gespeichert.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Windpark</p>
                <p className="font-medium">{selectedPark?.name || "-"}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Zeitraum</p>
                <p className="font-medium">
                  {periodType === "FINAL"
                    ? `Jahresendabrechnung ${year}`
                    : advanceInterval === "YEARLY"
                      ? `Jahresvorschuss ${year}`
                      : advanceInterval === "QUARTERLY"
                        ? `Quartalsvorschuss Q${selectedQuarter} ${year}`
                        : `Monatsvorschuss ${MONTH_NAMES[selectedMonth - 1]} ${year}`}
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Typ</p>
                <p className="font-medium">
                  {periodType === "FINAL" ? "Jahresendabrechnung" : "Vorschuss"}
                </p>
              </div>
              {calculationResult && periodType === "FINAL" && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Betrag (Restbetrag)</p>
                  <p className="font-medium">
                    {formatEur(
                      (calculationResult as FinalCalculation).totals.totalFinalPayment
                    )}
                  </p>
                </div>
              )}
              {calculationResult && periodType === "ADVANCE" && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Betrag (Vorschuss)</p>
                  <p className="font-medium">
                    {formatEur(
                      (calculationResult as AdvanceCalculation).totals.totalMonthlyMinimumRent
                    )}
                  </p>
                </div>
              )}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Vertraege</p>
                <p className="font-medium">
                  {calculationResult
                    ? (calculationResult as FinalCalculation | AdvanceCalculation).totals.leaseCount
                    : "-"}
                </p>
              </div>
            </div>

            <Separator />

            {/* Generate Credit Notes */}
            {!invoiceResult ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
                  <Info className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Gutschriften erstellen</p>
                    <p className="text-xs">
                      Gutschriften werden als ENTWURF erstellt und koennen vor dem
                      Versand noch bearbeitet werden.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleCreateInvoices}
                  disabled={creatingInvoices || !createdSettlementId}
                >
                  {creatingInvoices ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {creatingInvoices ? "Wird erstellt..." : "Gutschriften erzeugen"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800">
                  <Check className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {invoiceResult.length} Gutschrift(en) erstellt
                    </p>
                    <p className="text-xs">
                      Alle Gutschriften wurden als Entwurf angelegt.
                    </p>
                  </div>
                </div>

                {invoiceResult.length > 0 && (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Gutschrift-Nr.</TableHead>
                          <TableHead>Empfaenger</TableHead>
                          <TableHead className="text-right">Betrag</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceResult.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell>
                              <Link
                                href={`/invoices/${inv.id}`}
                                className="text-primary underline hover:no-underline"
                              >
                                {inv.invoiceNumber}
                              </Link>
                            </TableCell>
                            <TableCell>{inv.recipientName}</TableCell>
                            <TableCell className="text-right">
                              {formatEur(Number(inv.grossAmount))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" asChild>
                <Link href="/leases/settlement">
                  Zur Uebersicht
                </Link>
              </Button>
              {createdSettlementId && (
                <Button variant="outline" asChild>
                  <Link href={`/leases/settlement/${createdSettlementId}`}>
                    Detail ansehen
                  </Link>
                </Button>
              )}
              <Button onClick={handleReset}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Neue Abrechnung
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =========================================================================
  // Step content router
  // =========================================================================

  function renderStepContent() {
    switch (currentStep) {
      case 0:
        return renderStep1();
      case 1:
        return renderStep2();
      case 2:
        return renderStep3();
      case 3:
        return renderStep4();
      default:
        return null;
    }
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/leases/settlement" aria-label="Zurueck zur Uebersicht">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Neue Pachtabrechnung</h1>
          <p className="text-muted-foreground">
            {periodType === "FINAL"
              ? "Jahresendabrechnung in 4 Schritten"
              : `${
                  advanceInterval === "YEARLY"
                    ? "Jahres"
                    : advanceInterval === "QUARTERLY"
                      ? "Quartals"
                      : "Monats"
                }vorschuss in 4 Schritten`}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="max-w-3xl mx-auto">
        <Stepper
          steps={STEPS}
          currentStep={currentStep}
          onStepClick={(step) => {
            // Only allow going back, not forward
            if (step < currentStep) {
              setCurrentStep(step);
            }
          }}
        />
      </div>

      {/* Step content */}
      <div className="max-w-3xl mx-auto">
        <StepContent>{renderStepContent()}</StepContent>

        {/* Navigation buttons (not on the last step which has its own buttons) */}
        {currentStep < STEPS.length - 1 && (
          <StepActions>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/leases/settlement">Abbrechen</Link>
              </Button>
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep((prev) => prev - 1)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Zurueck
                </Button>
              )}
            </div>

            <Button
              onClick={async () => {
                if (currentStep === 1 && periodType === "FINAL" && revenueSource === "manual") {
                  const saved = await saveMonthlyData();
                  if (!saved) return;
                }
                setCurrentStep((prev) => prev + 1);
              }}
              disabled={!canProceed() || savingMonthlyData}
            >
              {savingMonthlyData ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Speichert...
                </>
              ) : (
                <>
                  Weiter
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </StepActions>
        )}
      </div>
    </div>
  );
}
