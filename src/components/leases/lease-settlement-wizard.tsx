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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

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
  totalProductionKwh: number;
  eegProductionKwh: number | null;
  eegRevenueEur: number | null;
  dvProductionKwh: number | null;
  dvRevenueEur: number | null;
  netOperatorReference: string | null;
  park?: { name: string };
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

interface SettlementPeriod {
  id: string;
  year: number;
  month: number | null;
  periodType: string;
  status: string;
  totalRevenue: string | null;
  totalMinimumRent: string | null;
  totalActualRent: string | null;
  createdAt: string;
  park?: { id: string; name: string };
  createdBy?: { firstName: string | null; lastName: string | null };
  _count?: { invoices: number };
}

type CalculationResult = AdvanceCalculation | FinalCalculation;

// ============================================================================
// Constants
// ============================================================================

const STEPS = [
  { id: "park", title: "Park & Jahr", description: "Grunddaten" },
  { id: "revenue", title: "Umsatzdaten", description: "Erlöse" },
  { id: "calculation", title: "Berechnung", description: "Vorschau" },
  { id: "summary", title: "Abschluss", description: "Zusammenfassung" },
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
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    OPEN: { label: "Offen", variant: "outline" },
    IN_PROGRESS: { label: "In Bearbeitung", variant: "default" },
    PENDING_REVIEW: { label: "Prüfung", variant: "secondary" },
    APPROVED: { label: "Genehmigt", variant: "default" },
    CLOSED: { label: "Abgeschlossen", variant: "secondary" },
  };
  const entry = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

// ============================================================================
// Main Component
// ============================================================================

export function LeaseSettlementWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1 state
  const [parks, setParks] = useState<Park[]>([]);
  const [loadingParks, setLoadingParks] = useState(true);
  const [selectedParkId, setSelectedParkId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [periodType, setPeriodType] = useState<"FINAL" | "ADVANCE">("FINAL");
  const [advanceInterval, setAdvanceInterval] = useState<"YEARLY" | "QUARTERLY" | "MONTHLY">("YEARLY");
  const [selectedMonth, setSelectedMonth] = useState<number>(1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(1);
  const [leases, setLeases] = useState<LeaseInfo[]>([]);
  const [loadingLeases, setLoadingLeases] = useState(false);

  // Step 2 state
  const [revenueSource, setRevenueSource] = useState<"auto" | "manual">("auto");
  const [energySettlements, setEnergySettlements] = useState<EnergySettlement[]>([]);
  const [loadingEnergySettlements, setLoadingEnergySettlements] = useState(false);
  const [savingMonthlyData, setSavingMonthlyData] = useState(false);

  // Monthly EEG/DV data (12 months × 4 fields = 48 fields)
  const [monthlyData, setMonthlyData] = useState<
    Array<{ eegProductionKwh: string; eegRevenueEur: string; dvProductionKwh: string; dvRevenueEur: string }>
  >(Array.from({ length: 12 }, () => ({
    eegProductionKwh: "", eegRevenueEur: "", dvProductionKwh: "", dvRevenueEur: "",
  })));

  // Revenue sources breakdown (EEG/Direktvermarktung) for Anlage page 2
  const [revenueSources, setRevenueSources] = useState<
    Array<{ category: string; productionKwh: string; revenueEur: string }>
  >([
    { category: "EEG-Vergütung", productionKwh: "", revenueEur: "" },
    { category: "Direktvermarktung", productionKwh: "", revenueEur: "" },
  ]);

  // Step 3 state
  const [createdPeriodId, setCreatedPeriodId] = useState<string | null>(null);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Step 4 state: Gutschriften-Generierung
  const [generatingInvoices, setGeneratingInvoices] = useState(false);
  const [generatedInvoices, setGeneratedInvoices] = useState<Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    recipientName: string;
    grossAmount: number;
  }> | null>(null);

  // History table state
  const [existingPeriods, setExistingPeriods] = useState<SettlementPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // =========================================================================
  // Data loading
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
        if (!cancelled) toast.error("Fehler beim Laden der Pachtverträge");
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
          `/api/energy/settlements?parkId=${selectedParkId}&year=${year}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          const all: EnergySettlement[] = data.settlements || data.data || [];
          setEnergySettlements(all);
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

  // Auto-populate revenueSources from EEG/DV data when auto mode
  // Pre-fill monthlyData from existing EnergySettlement records
  useEffect(() => {
    if (energySettlements.length === 0) return;

    setMonthlyData((prev) => {
      const next = [...prev];
      for (const es of energySettlements) {
        if (!es.month || es.month < 1 || es.month > 12) continue;
        const idx = es.month - 1;
        next[idx] = {
          eegProductionKwh: es.eegProductionKwh ? String(Number(es.eegProductionKwh)) : "",
          eegRevenueEur: es.eegRevenueEur ? String(Number(es.eegRevenueEur)) : "",
          dvProductionKwh: es.dvProductionKwh ? String(Number(es.dvProductionKwh)) : "",
          dvRevenueEur: es.dvRevenueEur ? String(Number(es.dvRevenueEur)) : "",
        };
      }
      return next;
    });
  }, [energySettlements]);

  // Auto-compute revenueSources from aggregated data (for PDF Anlage)
  useEffect(() => {
    const eegKwh = energySettlements.reduce((s, es) => s + Number(es.eegProductionKwh || 0), 0);
    const eegEur = energySettlements.reduce((s, es) => s + Number(es.eegRevenueEur || 0), 0);
    const dvKwh = energySettlements.reduce((s, es) => s + Number(es.dvProductionKwh || 0), 0);
    const dvEur = energySettlements.reduce((s, es) => s + Number(es.dvRevenueEur || 0), 0);

    const sources: Array<{ category: string; productionKwh: string; revenueEur: string }> = [];
    if (eegEur > 0 || eegKwh > 0) {
      sources.push({ category: "EEG-Vergütung", productionKwh: String(eegKwh), revenueEur: String(eegEur) });
    }
    if (dvEur > 0 || dvKwh > 0) {
      sources.push({ category: "Direktvermarktung", productionKwh: String(dvKwh), revenueEur: String(dvEur) });
    }
    if (sources.length === 0 && energySettlements.length > 0) {
      const totalKwh = energySettlements.reduce((s, es) => s + Number(es.totalProductionKwh || 0), 0);
      const totalEur = energySettlements.reduce((s, es) => s + Number(es.netOperatorRevenueEur || 0), 0);
      sources.push({ category: "Stromerlös gesamt", productionKwh: String(totalKwh), revenueEur: String(totalEur) });
    }
    if (sources.length > 0) {
      setRevenueSources(sources);
    }
  }, [energySettlements]);

  // Load existing settlement periods for the selected park
  const loadExistingPeriods = useCallback(async () => {
    if (!selectedParkId) return;
    setLoadingPeriods(true);
    try {
      const res = await fetch(
        `/api/admin/settlement-periods?parkId=${selectedParkId}`
      );
      if (res.ok) {
        const data = await res.json();
        setExistingPeriods(Array.isArray(data) ? data : data.periods || []);
      }
    } catch {
      // Non-critical, ignore
    } finally {
      setLoadingPeriods(false);
    }
  }, [selectedParkId]);

  useEffect(() => {
    if (selectedParkId) {
      loadExistingPeriods();
    }
  }, [selectedParkId, loadExistingPeriods]);

  // =========================================================================
  // Revenue source helpers
  // =========================================================================

  // Parse revenue sources into API format (filter out empty rows)
  function getValidRevenueSources(): Array<{ category: string; productionKwh: number; revenueEur: number }> | undefined {
    const valid = revenueSources
      .filter((s) => s.category && (parseFloat(s.revenueEur) > 0 || parseFloat(s.productionKwh) > 0))
      .map((s) => ({
        category: s.category,
        productionKwh: parseFloat(s.productionKwh) || 0,
        revenueEur: parseFloat(s.revenueEur) || 0,
      }));
    return valid.length > 0 ? valid : undefined;
  }

  // =========================================================================
  // Computed values
  // =========================================================================

  // Lease summary for step 1
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

  // Aggregated energy settlement values (for display)
  const autoEegRevenueEur = energySettlements.reduce((s, es) => s + Number(es.eegRevenueEur || 0), 0);
  const autoDvRevenueEur = energySettlements.reduce((s, es) => s + Number(es.dvRevenueEur || 0), 0);

  // Only use finalized settlements for auto mode
  const finalizedSettlements = energySettlements.filter(
    (es) => ["INVOICED", "CLOSED"].includes(es.status)
  );
  const finalizedTotalRevenue = finalizedSettlements.reduce(
    (s, es) => s + Number(es.netOperatorRevenueEur || 0), 0
  );

  // Manual mode: compute totals from 48 fields
  const manualTotals = monthlyData.reduce(
    (acc, m) => ({
      eegKwh: acc.eegKwh + (parseFloat(m.eegProductionKwh) || 0),
      eegEur: acc.eegEur + (parseFloat(m.eegRevenueEur) || 0),
      dvKwh: acc.dvKwh + (parseFloat(m.dvProductionKwh) || 0),
      dvEur: acc.dvEur + (parseFloat(m.dvRevenueEur) || 0),
    }),
    { eegKwh: 0, eegEur: 0, dvKwh: 0, dvEur: 0 }
  );
  const manualTotalRevenue = manualTotals.eegEur + manualTotals.dvEur;

  // Effective revenue for step 2
  const effectiveRevenue = (() => {
    if (periodType === "ADVANCE") return 0;
    if (revenueSource === "auto" && finalizedSettlements.length > 0) {
      return finalizedTotalRevenue;
    }
    if (revenueSource === "manual" && manualTotalRevenue > 0) {
      return manualTotalRevenue;
    }
    return 0;
  })();

  // =========================================================================
  // Validation
  // =========================================================================

  function canProceed(): boolean {
    switch (currentStep) {
      case 0:
        return !!selectedParkId && year > 0 && leaseSummary.leaseCount > 0;
      case 1:
        // For ADVANCE, revenue is not needed (only minimum rent)
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

  async function handleCalculate() {
    setCalculating(true);
    setCalculationResult(null);

    try {
      // Step A: Create LeaseSettlementPeriod
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
          createPayload.month = selectedQuarter;
        }
        // YEARLY: no month needed
      }

      // Link to first energy settlement for reference (optional FK)
      if (revenueSource === "auto" && energySettlements.length > 0) {
        createPayload.linkedEnergySettlementId = energySettlements[0].id;
      }

      const createRes = await fetch("/api/admin/settlement-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPayload),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || `HTTP ${createRes.status}`);
      }

      const period = await createRes.json();
      setCreatedPeriodId(period.id);

      // Step B: Trigger calculation
      const calcPayload: Record<string, unknown> = {
        saveResult: true,
      };

      if (periodType === "FINAL" && effectiveRevenue > 0) {
        calcPayload.totalRevenue = effectiveRevenue;
      }

      const calcRes = await fetch(
        `/api/admin/settlement-periods/${period.id}/calculate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(calcPayload),
        }
      );

      if (!calcRes.ok) {
        const err = await calcRes.json().catch(() => ({ error: "Berechnungsfehler" }));
        throw new Error(err.error || `HTTP ${calcRes.status}`);
      }

      const calcData = await calcRes.json();
      setCalculationResult(calcData.calculation);
      toast.success("Berechnung erfolgreich abgeschlossen");

      // Reload history
      loadExistingPeriods();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler bei der Berechnung"
      );
    } finally {
      setCalculating(false);
    }
  }

  // Save manual monthly data to EnergySettlement records via batch-upsert
  async function saveMonthlyData(): Promise<boolean> {
    const entries = monthlyData
      .map((m, i) => ({
        month: i + 1,
        eegProductionKwh: parseFloat(m.eegProductionKwh) || null,
        eegRevenueEur: parseFloat(m.eegRevenueEur) || null,
        dvProductionKwh: parseFloat(m.dvProductionKwh) || null,
        dvRevenueEur: parseFloat(m.dvRevenueEur) || null,
      }))
      .filter(
        (e) => e.eegRevenueEur || e.dvRevenueEur || e.eegProductionKwh || e.dvProductionKwh
      );

    if (entries.length === 0) return true; // Nothing to save

    setSavingMonthlyData(true);
    try {
      const res = await fetch("/api/energy/settlements/batch-upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkId: selectedParkId, year, entries }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      // Reload settlements from response so auto mode and revenueSources update
      if (result.settlements) {
        setEnergySettlements(result.settlements);
      }
      toast.success(result.message || "Monatsdaten gespeichert");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern der Monatsdaten"
      );
      return false;
    } finally {
      setSavingMonthlyData(false);
    }
  }

  function handleReset() {
    setCurrentStep(0);
    setSelectedParkId("");
    setYear(new Date().getFullYear() - 1);
    setPeriodType("FINAL");
    setAdvanceInterval("YEARLY");
    setSelectedMonth(1);
    setSelectedQuarter(1);
    setLeases([]);
    setRevenueSource("auto");
    setMonthlyData(Array.from({ length: 12 }, () => ({
      eegProductionKwh: "", eegRevenueEur: "", dvProductionKwh: "", dvRevenueEur: "",
    })));
    setRevenueSources([
      { category: "EEG-Vergütung", productionKwh: "", revenueEur: "" },
      { category: "Direktvermarktung", productionKwh: "", revenueEur: "" },
    ]);
    setCreatedPeriodId(null);
    setCalculationResult(null);
    setGeneratingInvoices(false);
    setGeneratedInvoices(null);
  }

  // =========================================================================
  // Step renderers
  // =========================================================================

  function renderStep1() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wind className="h-5 w-5" />
              Park und Abrechnungsjahr
            </CardTitle>
            <CardDescription>
              Waehlen Sie den Windpark und das Abrechnungsjahr
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Park selection */}
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
                    setCreatedPeriodId(null);
                    setCalculationResult(null);
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

            {/* Year */}
            <div className="space-y-2">
              <Label htmlFor="year-input">Abrechnungsjahr *</Label>
              <Input
                id="year-input"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => {
                  setYear(parseInt(e.target.value, 10) || 0);
                  setCreatedPeriodId(null);
                  setCalculationResult(null);
                }}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Pacht wird nachtraeglich abgerechnet - Standard ist das Vorjahr.
              </p>
            </div>

            <Separator />

            {/* Period type */}
            <div className="space-y-3">
              <Label>Abrechnungstyp</Label>
              <RadioGroup
                value={periodType}
                onValueChange={(v) => {
                  setPeriodType(v as "FINAL" | "ADVANCE");
                  setCreatedPeriodId(null);
                  setCalculationResult(null);
                }}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="FINAL" id="type-final" className="mt-0.5" />
                  <div>
                    <Label htmlFor="type-final" className="font-medium cursor-pointer">
                      Jahresendabrechnung (FINAL)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Berechnet die tatsaechliche Pacht basierend auf dem Jahresumsatz und
                      verrechnet bereits gezahlte Vorschüsse.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="ADVANCE" id="type-advance" className="mt-0.5" />
                  <div>
                    <Label htmlFor="type-advance" className="font-medium cursor-pointer">
                      Vorschuss (ADVANCE)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Vorschuss-Pachtzahlung basierend auf der Jahresmindestpacht.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Advance interval selector */}
            {periodType === "ADVANCE" && (
              <div className="space-y-4 ml-6 pl-4 border-l-2 border-muted">
                <div className="space-y-3">
                  <Label>Vorschuss-Intervall</Label>
                  <RadioGroup
                    value={advanceInterval}
                    onValueChange={(v) => {
                      setAdvanceInterval(v as "YEARLY" | "QUARTERLY" | "MONTHLY");
                      setCreatedPeriodId(null);
                      setCalculationResult(null);
                    }}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="YEARLY" id="interval-yearly" />
                      <Label htmlFor="interval-yearly" className="cursor-pointer">
                        Jahresvorschuss (voller Jahresbetrag)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="QUARTERLY" id="interval-quarterly" />
                      <Label htmlFor="interval-quarterly" className="cursor-pointer">
                        Quartalsvorschuss (1/4 des Jahresbetrags)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="MONTHLY" id="interval-monthly" />
                      <Label htmlFor="interval-monthly" className="cursor-pointer">
                        Monatsvorschuss (1/12 des Jahresbetrags)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Quarter selector for QUARTERLY */}
                {advanceInterval === "QUARTERLY" && (
                  <div className="space-y-2">
                    <Label htmlFor="quarter-select">Quartal *</Label>
                    <Select
                      value={String(selectedQuarter)}
                      onValueChange={(v) => {
                        setSelectedQuarter(parseInt(v, 10));
                        setCreatedPeriodId(null);
                        setCalculationResult(null);
                      }}
                    >
                      <SelectTrigger id="quarter-select" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1. Quartal (Jan-Mrz)</SelectItem>
                        <SelectItem value="2">2. Quartal (Apr-Jun)</SelectItem>
                        <SelectItem value="3">3. Quartal (Jul-Sep)</SelectItem>
                        <SelectItem value="4">4. Quartal (Okt-Dez)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Month selector for MONTHLY */}
                {advanceInterval === "MONTHLY" && (
                  <div className="space-y-2">
                    <Label htmlFor="month-select">Monat *</Label>
                    <Select
                      value={String(selectedMonth)}
                      onValueChange={(v) => {
                        setSelectedMonth(parseInt(v, 10));
                        setCreatedPeriodId(null);
                        setCalculationResult(null);
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

        {/* Leases summary */}
        {selectedParkId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pachtverträge</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingLeases ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Pachtverträge werden geladen...
                </div>
              ) : leaseSummary.leaseCount === 0 ? (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  Keine aktiven Pachtverträge für diesen Park gefunden.
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>
                    <strong>{leaseSummary.leaseCount}</strong> aktive
                    Pachtverträge mit{" "}
                    <strong>{leaseSummary.plotCount}</strong> Fluerstuecken und{" "}
                    <strong>
                      {leaseSummary.totalArea.toLocaleString("de-DE")} m²
                    </strong>{" "}
                    Gesamtflaeche
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  function renderStep2() {
    if (periodType === "ADVANCE") {
      // For ADVANCE, no revenue data is needed - only minimum rent
      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Vorschussberechnung
              </CardTitle>
              <CardDescription>
                Vorschüsse basieren auf der Mindestpacht - ein
                Umsatz ist hierfür nicht erforderlich.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-sm font-medium">
                  {advanceInterval === "YEARLY"
                    ? `Jahresvorschuss ${year}`
                    : advanceInterval === "QUARTERLY"
                      ? `Quartalsvorschuss ${selectedQuarter}. Quartal ${year}`
                      : `Monatsvorschuss ${MONTH_NAMES[selectedMonth - 1]} ${year}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {advanceInterval === "YEARLY"
                    ? "Der Jahresvorschuss entspricht der vollen Jahresmindestpacht und wird auf die Verpachter aufgeteilt."
                    : advanceInterval === "QUARTERLY"
                      ? "Der Quartalsvorschuss wird als 1/4 der Jahresmindestpacht berechnet und auf die Verpachter aufgeteilt."
                      : "Der Monatsvorschuss wird als 1/12 der Jahresmindestpacht berechnet und auf die Verpachter aufgeteilt."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Helper: update a monthly data field
    function updateMonthly(
      monthIdx: number,
      field: "eegProductionKwh" | "eegRevenueEur" | "dvProductionKwh" | "dvRevenueEur",
      value: string
    ) {
      setMonthlyData((prev) => {
        const next = [...prev];
        next[monthIdx] = { ...next[monthIdx], [field]: value };
        return next;
      });
    }

    // Check which months have finalized (non-editable) data
    const finalizedMonths = new Set(
      energySettlements
        .filter((es) => es.month && !["DRAFT"].includes(es.status))
        .map((es) => es.month!)
    );

    // FINAL: Revenue data needed
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Umsatzdaten {year}
            </CardTitle>
            <CardDescription>
              Monatliche EEG- und Direktvermarktungs-Erlöse als Grundlage für
              die Pachtberechnung.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={revenueSource}
              onValueChange={(v) => setRevenueSource(v as "auto" | "manual")}
              className="space-y-3"
            >
              {/* Auto from energy settlements */}
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="auto" id="revenue-auto" className="mt-0.5" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="revenue-auto" className="font-medium cursor-pointer">
                    Aus Energieabrechnungen übernehmen
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Verwendet die bereits erfassten und abgeschlossenen Stromabrechnungen.
                  </p>
                </div>
              </div>

              {/* Manual entry */}
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="manual" id="revenue-manual" className="mt-0.5" />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="revenue-manual" className="font-medium cursor-pointer">
                    Monatsdaten manuell erfassen
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Erfassen Sie die monatlichen EEG- und DV-Daten direkt. Die Daten
                    werden in die Datenbank gespeichert.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Auto mode: Yearly summary */}
        {revenueSource === "auto" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Jahresübersicht {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEnergySettlements ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Energieabrechnungen werden geladen...
                </div>
              ) : finalizedSettlements.length === 0 ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                  <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      Keine abgeschlossenen Energieabrechnungen gefunden
                    </p>
                    <p className="text-xs">
                      Für {year} liegen keine finalisierten Stromabrechnungen vor.
                      Bitte wechseln Sie zu &quot;Manuell erfassen&quot; oder erstellen
                      Sie zuerst die Stromabrechnungen.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Gesamterlös</p>
                      <p className="text-lg font-bold">{formatEur(finalizedTotalRevenue)}</p>
                    </div>
                    {autoEegRevenueEur > 0 && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">davon EEG</p>
                        <p className="text-lg font-medium">{formatEur(autoEegRevenueEur)}</p>
                      </div>
                    )}
                    {autoDvRevenueEur > 0 && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">davon Direktvermarktung</p>
                        <p className="text-lg font-medium">{formatEur(autoDvRevenueEur)}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Basierend auf {finalizedSettlements.length} abgeschlossenen
                    Energieabrechnung(en) für {year}.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Manual mode: 12 months × 4 fields = 48 input fields */}
        {revenueSource === "manual" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Monatliche Erträge {year}
              </CardTitle>
              <CardDescription>
                Erfassen Sie für jeden Monat die EEG- und DV-Einspeisung (kWh) sowie
                die jeweiligen Erlöse (EUR). Bereits vorhandene Daten sind vorausgefuellt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Monat</TableHead>
                      <TableHead className="text-right w-32">EEG kWh</TableHead>
                      <TableHead className="text-right w-32">EEG EUR</TableHead>
                      <TableHead className="text-right w-32">DV kWh</TableHead>
                      <TableHead className="text-right w-32">DV EUR</TableHead>
                      <TableHead className="text-right w-28">Gesamt EUR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MONTH_NAMES.map((name, idx) => {
                      const m = monthlyData[idx];
                      const isLocked = finalizedMonths.has(idx + 1);
                      const rowTotal =
                        (parseFloat(m.eegRevenueEur) || 0) +
                        (parseFloat(m.dvRevenueEur) || 0);

                      return (
                        <TableRow
                          key={idx}
                          className={isLocked ? "bg-muted/30" : undefined}
                        >
                          <TableCell className="font-medium text-sm">
                            {name}
                            {isLocked && (
                              <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                                fest
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              value={m.eegProductionKwh}
                              onChange={(e) => updateMonthly(idx, "eegProductionKwh", e.target.value)}
                              disabled={isLocked}
                              className="h-8 text-right tabular-nums text-sm"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={m.eegRevenueEur}
                              onChange={(e) => updateMonthly(idx, "eegRevenueEur", e.target.value)}
                              disabled={isLocked}
                              className="h-8 text-right tabular-nums text-sm"
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              value={m.dvProductionKwh}
                              onChange={(e) => updateMonthly(idx, "dvProductionKwh", e.target.value)}
                              disabled={isLocked}
                              className="h-8 text-right tabular-nums text-sm"
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={m.dvRevenueEur}
                              onChange={(e) => updateMonthly(idx, "dvRevenueEur", e.target.value)}
                              disabled={isLocked}
                              className="h-8 text-right tabular-nums text-sm"
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">
                            {rowTotal > 0 ? formatEur(rowTotal) : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals row */}
                    <TableRow className="border-t-2 font-bold bg-muted/30">
                      <TableCell>Gesamt</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {manualTotals.eegKwh > 0
                          ? manualTotals.eegKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {manualTotals.eegEur > 0 ? formatEur(manualTotals.eegEur) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {manualTotals.dvKwh > 0
                          ? manualTotals.dvKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {manualTotals.dvEur > 0 ? formatEur(manualTotals.dvEur) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {manualTotalRevenue > 0 ? formatEur(manualTotalRevenue) : "-"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {finalizedMonths.size > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Monate mit &quot;fest&quot;-Badge haben bereits finalisierte Stromabrechnungen
                  und können hier nicht geändert werden.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Revenue comparison */}
        {effectiveRevenue > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Vergleich: Mindestpacht vs. Umsatzbeteiligung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/50 rounded-lg space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Gesamtumsatz {year}:</span>{" "}
                  <span className="font-medium">{formatEur(effectiveRevenue)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Die genaue Aufteilung zwischen Mindestpacht und
                  Umsatzbeteiligung wird im nächsten Schritt berechnet
                  (MAX-Regel: es greift der jeweils hoehere Betrag).
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

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
                  ? `Jahresendabrechnung für ${year} mit ${formatEur(effectiveRevenue)} Umsatz`
                  : advanceInterval === "YEARLY"
                    ? `Jahresvorschuss für ${year}`
                    : advanceInterval === "QUARTERLY"
                      ? `Quartalsvorschuss für ${selectedQuarter}. Quartal ${year}`
                      : `Monatsvorschuss für ${MONTH_NAMES[selectedMonth - 1]} ${year}`}
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
                    Berechnung läuft...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Jetzt berechnen
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {calculationResult && periodType === "FINAL" && renderFinalResults()}
        {calculationResult && periodType === "ADVANCE" && renderAdvanceResults()}

        {/* Recalculate button */}
        {calculationResult && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setCalculationResult(null);
                setCreatedPeriodId(null);
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
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
              ` | Erlösphase: ${calc.revenuePhasePercentage}%`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasNegativePayments && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Achtung: Überzahlung bei mindestens einem Verpacheter
                </p>
                <p className="text-xs">
                  Ein negativer Restbetrag bedeutet, dass mehr Vorschüsse gezahlt
                  wurden als die tatsaechliche Pacht betraegt.
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Verpacheter</TableHead>
                  <TableHead className="text-right">Mindestpacht</TableHead>
                  <TableHead className="text-right">Umsatzbeteiligung</TableHead>
                  <TableHead className="text-right">Gez. Vorschüsse</TableHead>
                  <TableHead className="text-right">Restbetrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.leases.map((lease) => (
                  <TableRow key={lease.leaseId}>
                    <TableCell className="font-medium">{lease.lessorName}</TableCell>
                    <TableCell className="text-right">
                      {formatEur(lease.totalMinimumRent)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEur(lease.totalRevenueShare)}
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
                ))}
                {/* Sum row */}
                <TableRow className="border-t-2 font-bold">
                  <TableCell>Gesamt ({calc.totals.leaseCount} Verträge)</TableCell>
                  <TableCell className="text-right">
                    {formatEur(calc.totals.totalMinimumRent)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatEur(calc.totals.totalRevenueShare)}
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

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            Berechnungsergebnis - Vorschuss {
              advanceInterval === "YEARLY"
                ? `${calc.year}`
                : advanceInterval === "QUARTERLY"
                  ? `Q${calc.month} ${calc.year}`
                  : `${MONTH_NAMES[calc.month - 1]} ${calc.year}`
            }
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
                  <TableHead>Verpacheter</TableHead>
                  <TableHead className="text-right">Fluerstuecke</TableHead>
                  <TableHead className="text-right">
                    {advanceInterval === "YEARLY" ? "Jahresvorschuss" : advanceInterval === "QUARTERLY" ? "Quartalsvorschuss" : "Monatsvorschuss"}
                  </TableHead>
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
                {/* Sum row */}
                <TableRow className="border-t-2 font-bold">
                  <TableCell>Gesamt ({calc.totals.leaseCount} Verträge)</TableCell>
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

  function renderStep4() {
    const selectedPark = parks.find((p) => p.id === selectedParkId);

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              Abrechnung abgeschlossen
            </CardTitle>
            <CardDescription>
              Die Pachtabrechnung wurde erfolgreich berechnet und gespeichert.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Windpark</p>
                <p className="font-medium">{selectedPark?.name || "-"}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Periode</p>
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
              {calculationResult && periodType === "FINAL" && (
                <>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Gesamtumsatz</p>
                    <p className="font-medium">
                      {formatEur((calculationResult as FinalCalculation).totalRevenue)}
                    </p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Restbetrag gesamt</p>
                    <p className="font-medium">
                      {formatEur(
                        (calculationResult as FinalCalculation).totals.totalFinalPayment
                      )}
                    </p>
                  </div>
                </>
              )}
              {calculationResult && periodType === "ADVANCE" && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    {advanceInterval === "YEARLY" ? "Jahresvorschuss" : advanceInterval === "QUARTERLY" ? "Quartalsvorschuss" : "Monatsvorschuss"}
                  </p>
                  <p className="font-medium">
                    {formatEur(
                      (calculationResult as AdvanceCalculation).totals
                        .totalMonthlyMinimumRent
                    )}
                  </p>
                </div>
              )}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Verträge</p>
                <p className="font-medium">
                  {calculationResult
                    ? (calculationResult as FinalCalculation | AdvanceCalculation).totals
                        .leaseCount
                    : "-"}
                </p>
              </div>
            </div>

            <Separator />

            {/* Gutschriften-Generierung */}
            {!generatedInvoices ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg text-teal-800">
                  <Info className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Gutschriften erstellen</p>
                    <p className="text-xs">
                      Gutschriften werden als ENTWURF erstellt und können vor dem
                      Versand noch bearbeitet werden. MwSt-Saetze und Buchungskonten
                      werden aus den Park-Einstellungen übernommen.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={async () => {
                    if (!createdPeriodId) {
                      toast.error("Keine Abrechnungsperiode vorhanden");
                      return;
                    }
                    setGeneratingInvoices(true);
                    try {
                      const createBody: Record<string, unknown> = {
                        invoiceDate: new Date().toISOString(),
                      };
                      // Pass revenue sources for Anlage (page 2) if FINAL
                      if (periodType === "FINAL") {
                        const sources = getValidRevenueSources();
                        if (sources) createBody.revenueSources = sources;
                      }
                      const res = await fetch(
                        `/api/admin/settlement-periods/${createdPeriodId}/create-invoices`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(createBody),
                        }
                      );
                      if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || "Fehler beim Erstellen");
                      }
                      const result = await res.json();
                      setGeneratedInvoices(result.invoices || []);
                      toast.success(result.message || "Gutschriften erstellt");
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Fehler beim Erstellen der Gutschriften"
                      );
                    } finally {
                      setGeneratingInvoices(false);
                    }
                  }}
                  disabled={generatingInvoices || !createdPeriodId}
                >
                  {generatingInvoices ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {generatingInvoices ? "Wird erstellt..." : "Gutschriften erstellen"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800">
                  <Check className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {generatedInvoices.length} Gutschrift(en) erstellt
                    </p>
                    <p className="text-xs">
                      Alle Gutschriften wurden als Entwurf angelegt.
                    </p>
                  </div>
                </div>

                {generatedInvoices.length > 0 && (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Gutschrift-Nr.</TableHead>
                          <TableHead>Empfänger</TableHead>
                          <TableHead className="text-right">Bruttobetrag</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {generatedInvoices.map((inv) => (
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

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button onClick={handleReset}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Neue Abrechnung
              </Button>
              {generatedInvoices && generatedInvoices.length > 0 && (
                <Button variant="outline" asChild>
                  <Link href="/invoices">
                    <FileText className="mr-2 h-4 w-4" />
                    Zur Rechnungsübersicht
                  </Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/leases">
                  Zur Pachtübersicht
                </Link>
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
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/leases" aria-label="Zurück zur Pachtübersicht">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pachtabrechnung</h1>
          <p className="text-muted-foreground">
            {periodType === "FINAL"
              ? "Jahresendabrechnung in 4 Schritten"
              : `${advanceInterval === "YEARLY" ? "Jahres" : advanceInterval === "QUARTERLY" ? "Quartals" : "Monats"}vorschuss in 4 Schritten`}
          </p>
        </div>
      </div>

      {/* Stepper */}
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

      {/* Step content */}
      <StepContent>{renderStepContent()}</StepContent>

      {/* Navigation buttons (not on the last step which has its own buttons) */}
      {currentStep < STEPS.length - 1 && (
        <StepActions>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/leases">Abbrechen</Link>
            </Button>
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep((prev) => prev - 1)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück
              </Button>
            )}
          </div>

          <Button
            onClick={async () => {
              // Save manual monthly data before proceeding from Step 2
              if (currentStep === 1 && periodType === "FINAL" && revenueSource === "manual") {
                const saved = await saveMonthlyData();
                if (!saved) return; // Don't proceed if save failed
              }
              setCurrentStep((prev) => prev + 1);
            }}
            disabled={!canProceed() || savingMonthlyData}
          >
            {savingMonthlyData ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Speichern...
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

      {/* History section */}
      {selectedParkId && (
        <>
          <Separator className="mt-8" />
          <div className="space-y-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
              aria-expanded={showHistory}
            >
              {showHistory ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Bisherige Abrechnungen
              {existingPeriods.length > 0 && (
                <Badge variant="secondary">{existingPeriods.length}</Badge>
              )}
            </button>

            {showHistory && (
              <Card>
                <CardContent className="pt-6">
                  {loadingPeriods ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Abrechnungen werden geladen...
                    </div>
                  ) : existingPeriods.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Keine bisherigen Abrechnungen für diesen Park vorhanden.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Periode</TableHead>
                            <TableHead>Typ</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Gesamtumsatz</TableHead>
                            <TableHead className="text-right">Gesamtpacht</TableHead>
                            <TableHead>Erstellt am</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {existingPeriods.map((period) => (
                            <TableRow key={period.id}>
                              <TableCell className="font-medium">
                                {period.month
                                  ? `${MONTH_NAMES[period.month - 1]} ${period.year}`
                                  : `${period.year}`}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {period.periodType === "ADVANCE"
                                    ? "Vorschuss"
                                    : "Endabrechnung"}
                                </Badge>
                              </TableCell>
                              <TableCell>{getStatusBadge(period.status)}</TableCell>
                              <TableCell className="text-right">
                                {period.totalRevenue
                                  ? formatEur(Number(period.totalRevenue))
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                {period.totalActualRent
                                  ? formatEur(Number(period.totalActualRent))
                                  : period.totalMinimumRent
                                    ? formatEur(Number(period.totalMinimumRent))
                                    : "-"}
                              </TableCell>
                              <TableCell>
                                {new Date(period.createdAt).toLocaleDateString(
                                  "de-DE"
                                )}
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
        </>
      )}
    </div>
  );
}
