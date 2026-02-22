"use client";

import { useState, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  AlertTriangle,
  Building2,
  Users,
  ClipboardCheck,
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import {
  SETTLEMENT_MODE_LABELS,
  type LeaseSettlementMode,
  type ParkSetupData,
  type LeaseSetupInfo,
} from "@/types/billing";

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Fehler beim Laden");
    return res.json();
  });

function formatArea(sqm: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(sqm);
}

function formatPercent(pct: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pct);
}

function getLessorName(lessor: LeaseSetupInfo["lessor"]): string {
  if (lessor.companyName) return lessor.companyName;
  const parts = [lessor.firstName, lessor.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unbekannt";
}

const WIZARD_STEPS = [
  {
    id: "mode",
    title: "Abrechnungsmodus",
    description: "Abrechnungsverfahren waehlen",
  },
  {
    id: "owners",
    title: "Eigentuemer zuordnen",
    description: "Direktabrechnung konfigurieren",
  },
  {
    id: "review",
    title: "Uebersicht",
    description: "Konfiguration pruefen",
  },
];

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function UsageFeeSetupPage({
  params,
}: {
  params: Promise<{ parkId: string }>;
}) {
  const { parkId } = use(params);
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [currentStep, setCurrentStep] = useState(0);
  const [settlementMode, setSettlementMode] =
    useState<LeaseSettlementMode>("NETWORK_COMPANY");
  const [directBillingAssignments, setDirectBillingAssignments] = useState<
    Record<string, string | null>
  >({});
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const {
    data: setupData,
    isLoading,
    error: isError,
  } = useSWR<ParkSetupData>(
    `/api/leases/usage-fees/setup/${parkId}`,
    fetcher,
    {
      onSuccess: (data) => {
        // Initialize state from server data
        if (data.leaseSettlementMode) {
          setSettlementMode(data.leaseSettlementMode);
        }
        // Initialize direct billing assignments from existing data
        const assignments: Record<string, string | null> = {};
        data.leases.forEach((lease) => {
          assignments[lease.leaseId] = lease.directBillingFundId;
        });
        setDirectBillingAssignments(assignments);
      },
    }
  );

  // ---------------------------------------------------------------------------
  // Derived Data
  // ---------------------------------------------------------------------------
  const warnings = useMemo(() => {
    if (!setupData) return [];
    const w: string[] = [];

    if (
      !setupData.revenuePhases ||
      setupData.revenuePhases.length === 0
    ) {
      w.push(
        "Keine Erloesphasen konfiguriert. Bitte legen Sie mindestens eine Erloesphase an."
      );
    }

    if (
      setupData.minimumRentPerTurbine === null ||
      setupData.minimumRentPerTurbine === 0
    ) {
      w.push(
        "Keine Mindestpacht pro WEA konfiguriert. Die Mindestgarantie kann nicht berechnet werden."
      );
    }

    if (setupData.leases.length === 0) {
      w.push(
        "Keine Pachtvertraege fuer diesen Park gefunden. Bitte legen Sie zuerst Pachtvertraege an."
      );
    }

    if (
      settlementMode === "OPERATOR_DIRECT" &&
      setupData.operatorFunds.length === 0
    ) {
      w.push(
        "Keine Betreibergesellschaften verfuegbar. Fuer Direktabrechnung werden Gesellschaften benoetigt."
      );
    }

    return w;
  }, [setupData, settlementMode]);

  const totalArea = useMemo(() => {
    if (!setupData) return 0;
    return setupData.leases.reduce((sum, l) => sum + l.totalAreaSqm, 0);
  }, [setupData]);

  const totalTurbines = useMemo(() => {
    if (!setupData) return 0;
    return setupData.leases.reduce((sum, l) => sum + l.totalTurbineCount, 0);
  }, [setupData]);

  const totalSealedArea = useMemo(() => {
    if (!setupData) return 0;
    return setupData.leases.reduce(
      (sum, l) =>
        sum + l.plots.reduce((ps, p) => ps + (p.sealedSqm || 0), 0),
      0
    );
  }, [setupData]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function handleDirectBillingChange(
    leaseId: string,
    fundId: string | null
  ) {
    setDirectBillingAssignments((prev) => ({
      ...prev,
      [leaseId]: fundId,
    }));
  }

  async function handleSave() {
    try {
      setSaving(true);

      const body = {
        leaseSettlementMode: settlementMode,
        directBillingAssignments:
          settlementMode === "OPERATOR_DIRECT"
            ? Object.entries(directBillingAssignments).map(
                ([leaseId, directBillingFundId]) => ({
                  leaseId,
                  directBillingFundId,
                })
              )
            : undefined,
      };

      const res = await fetch(`/api/leases/usage-fees/setup/${parkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.message || "Fehler beim Speichern der Konfiguration"
        );
      }

      toast.success("Einrichtung erfolgreich gespeichert");
      router.push("/leases");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  // Step 2 is only shown for OPERATOR_DIRECT mode
  const effectiveSteps =
    settlementMode === "OPERATOR_DIRECT"
      ? WIZARD_STEPS
      : [WIZARD_STEPS[0], WIZARD_STEPS[2]];

  const isLastStep = currentStep >= effectiveSteps.length - 1;

  function handleNext() {
    if (!isLastStep) {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }

  // Map current step index to the actual wizard step ID
  const currentStepId = effectiveSteps[currentStep]?.id;

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error / Not Found
  // ---------------------------------------------------------------------------
  if (isError || !setupData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/leases">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">
            Park-Einrichtung nicht gefunden
          </h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Die Konfigurationsdaten fuer diesen Park konnten nicht geladen
            werden.
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/leases">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            Nutzungsentgelt einrichten - {setupData.parkName}
          </h1>
          <p className="text-muted-foreground">
            Konfiguration der Pachtabrechnung fuer {setupData.parkName}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <Stepper
        steps={effectiveSteps}
        currentStep={currentStep}
        onStepClick={(step) => {
          if (step <= currentStep) setCurrentStep(step);
        }}
      />

      {/* Step Content */}
      <StepContent>
        {/* ================================================================= */}
        {/* STEP 1: Abrechnungsmodus waehlen */}
        {/* ================================================================= */}
        {currentStepId === "mode" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Abrechnungsmodus waehlen
              </CardTitle>
              <CardDescription>
                Bestimmen Sie, wie die Nutzungsentgelte fuer diesen Park
                abgerechnet werden sollen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {setupData.billingEntityFund && (
                <div className="rounded-lg border p-4 bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-1">
                    Abrechnungsgesellschaft (Netzgesellschaft):
                  </p>
                  <p className="font-medium">
                    {setupData.billingEntityFund.name}
                    {setupData.billingEntityFund.legalForm && (
                      <span className="text-muted-foreground ml-1">
                        ({setupData.billingEntityFund.legalForm})
                      </span>
                    )}
                  </p>
                </div>
              )}

              <RadioGroup
                value={settlementMode}
                onValueChange={(value) => {
                  setSettlementMode(value as LeaseSettlementMode);
                  // Reset to step 0 when mode changes
                  setCurrentStep(0);
                }}
                className="space-y-4"
              >
                {/* Option: Netzgesellschaft */}
                <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                  <RadioGroupItem
                    value="NETWORK_COMPANY"
                    id="mode-network"
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="mode-network"
                      className="text-base font-medium cursor-pointer"
                    >
                      {SETTLEMENT_MODE_LABELS.NETWORK_COMPANY}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Die Netzgesellschaft erstellt alle Rechnungen zentral
                      und verteilt die Kosten anschliessend auf die
                      Betreibergesellschaften. Dies ist der
                      Standard-Abrechnungsmodus.
                    </p>
                  </div>
                </div>

                {/* Option: Betreiber direkt */}
                <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                  <RadioGroupItem
                    value="OPERATOR_DIRECT"
                    id="mode-direct"
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="mode-direct"
                      className="text-base font-medium cursor-pointer"
                    >
                      {SETTLEMENT_MODE_LABELS.OPERATOR_DIRECT}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Einzelne Betreibergesellschaften rechnen die
                      Nutzungsentgelte fuer bestimmte Eigentuemer direkt ab.
                      Im naechsten Schritt koennen Sie die Zuordnung
                      vornehmen.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {/* ================================================================= */}
        {/* STEP 2: Eigentuemer zuordnen (only OPERATOR_DIRECT) */}
        {/* ================================================================= */}
        {currentStepId === "owners" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Eigentuemer zuordnen
              </CardTitle>
              <CardDescription>
                Ordnen Sie jedem Pachtvertrag die abrechnende Gesellschaft zu.
                Waehlen Sie &quot;Netzgesellschaft&quot; oder eine
                Betreibergesellschaft fuer die Direktabrechnung.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Eigentuemer</TableHead>
                      <TableHead>Flurstuecke</TableHead>
                      <TableHead className="text-right">
                        Flaeche (m2)
                      </TableHead>
                      <TableHead className="text-right">WEA</TableHead>
                      <TableHead className="w-[250px]">
                        Abrechnung durch
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {setupData.leases.map((lease) => (
                      <TableRow key={lease.leaseId}>
                        <TableCell className="font-medium">
                          {getLessorName(lease.lessor)}
                        </TableCell>
                        <TableCell>
                          {lease.plots
                            .map((p) => p.plotNumber)
                            .join(", ")}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatArea(lease.totalAreaSqm)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {lease.totalTurbineCount}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={
                              directBillingAssignments[lease.leaseId] ||
                              "network"
                            }
                            onValueChange={(value) =>
                              handleDirectBillingChange(
                                lease.leaseId,
                                value === "network" ? null : value
                              )
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Gesellschaft waehlen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="network">
                                Netzgesellschaft
                              </SelectItem>
                              {setupData.operatorFunds.map((fund) => (
                                <SelectItem
                                  key={fund.id}
                                  value={fund.id}
                                >
                                  {fund.name}
                                  {fund.legalForm
                                    ? ` (${fund.legalForm})`
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ================================================================= */}
        {/* STEP 3: Uebersicht pruefen */}
        {/* ================================================================= */}
        {currentStepId === "review" && (
          <div className="space-y-6">
            {/* Warnings */}
            {warnings.length > 0 && (
              <Card className="border-yellow-300 bg-yellow-50">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <p className="font-medium text-yellow-800">
                        Hinweise zur Konfiguration
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        {warnings.map((w, i) => (
                          <li
                            key={i}
                            className="text-sm text-yellow-700"
                          >
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mode Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Konfigurationsuebersicht
                </CardTitle>
                <CardDescription>
                  Pruefen Sie die Einstellungen bevor Sie speichern
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      Abrechnungsmodus
                    </p>
                    <p className="font-medium">
                      {SETTLEMENT_MODE_LABELS[settlementMode]}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      Netzgesellschaft
                    </p>
                    <p className="font-medium">
                      {setupData.billingEntityFund?.name || "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      Betreibergesellschaften
                    </p>
                    <p className="font-medium">
                      {setupData.operatorFunds.length} Gesellschaft(en)
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      Erloesphasen
                    </p>
                    <p className="font-medium">
                      {setupData.revenuePhases.length} Phase(n)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Table */}
            <Card>
              <CardHeader>
                <CardTitle>Pachtvertraege - Zusammenfassung</CardTitle>
                <CardDescription>
                  {setupData.leases.length} Pachtvertrag/Pachtvertraege mit{" "}
                  {totalTurbines} WEA auf {formatArea(totalArea)} m2
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Eigentuemer</TableHead>
                        <TableHead>Flurstuecke</TableHead>
                        <TableHead className="text-right">
                          Flaeche (m2)
                        </TableHead>
                        <TableHead className="text-right">WEA</TableHead>
                        <TableHead className="text-right">
                          Versiegelt (m2)
                        </TableHead>
                        {settlementMode === "OPERATOR_DIRECT" && (
                          <TableHead>Abrechnung</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {setupData.leases.map((lease) => {
                        const leaseSealedArea = lease.plots.reduce(
                          (sum, p) => sum + (p.sealedSqm || 0),
                          0
                        );
                        const assignedFundId =
                          directBillingAssignments[lease.leaseId];
                        const assignedFund = assignedFundId
                          ? setupData.operatorFunds.find(
                              (f) => f.id === assignedFundId
                            )
                          : null;

                        return (
                          <TableRow key={lease.leaseId}>
                            <TableCell className="font-medium">
                              {getLessorName(lease.lessor)}
                            </TableCell>
                            <TableCell>
                              {lease.plots
                                .map((p) => p.plotNumber)
                                .join(", ")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatArea(lease.totalAreaSqm)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {lease.totalTurbineCount}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatArea(leaseSealedArea)}
                            </TableCell>
                            {settlementMode === "OPERATOR_DIRECT" && (
                              <TableCell>
                                <Badge variant="outline">
                                  {assignedFund
                                    ? assignedFund.name
                                    : "Netzgesellschaft"}
                                </Badge>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">Gesamt</TableCell>
                        <TableCell>
                          {setupData.leases.reduce(
                            (sum, l) => sum + l.plots.length,
                            0
                          )}{" "}
                          Flurstuecke
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatArea(totalArea)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {totalTurbines}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatArea(totalSealedArea)}
                        </TableCell>
                        {settlementMode === "OPERATOR_DIRECT" && (
                          <TableCell />
                        )}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Phases */}
            {setupData.revenuePhases.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Erloesphasen</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Phase</TableHead>
                          <TableHead>Von (Jahr)</TableHead>
                          <TableHead>Bis (Jahr)</TableHead>
                          <TableHead className="text-right">
                            Erloesanteil (%)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {setupData.revenuePhases.map((phase) => (
                          <TableRow key={phase.phaseNumber}>
                            <TableCell className="font-medium">
                              Phase {phase.phaseNumber}
                            </TableCell>
                            <TableCell>{phase.startYear}</TableCell>
                            <TableCell>
                              {phase.endYear || "unbegrenzt"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatPercent(phase.revenueSharePercentage)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </StepContent>

      {/* Step Navigation */}
      <StepActions>
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurueck
        </Button>

        {!isLastStep ? (
          <Button onClick={handleNext}>
            Weiter
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Einrichtung speichern
          </Button>
        )}
      </StepActions>
    </div>
  );
}
