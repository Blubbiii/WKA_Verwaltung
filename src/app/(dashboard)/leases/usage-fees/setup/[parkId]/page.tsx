"use client";

import { useState, use, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
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
  type LeaseSettlementMode,
  type ParkSetupData,
  type LeaseSetupInfo,
} from "@/types/billing";

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

function formatArea(sqm: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(sqm);
}

function formatPercent(pct: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pct);
}

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
  const t = useTranslations("leases.usageFeesSetup");
  const tMode = useTranslations("billing.settlementMode");
  const locale = useLocale();
  const intlLocale = locale === "en" ? "en-US" : "de-DE";

  const fetcher = (url: string) =>
    fetch(url).then((res) => {
      if (!res.ok) throw new Error(t("loadError"));
      return res.json();
    });

  function getLessorName(lessor: LeaseSetupInfo["lessor"]): string {
    if (lessor.companyName) return lessor.companyName;
    const parts = [lessor.firstName, lessor.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : t("unknownLessor");
  }

  const WIZARD_STEPS = [
    {
      id: "mode",
      title: t("stepMode"),
      description: t("stepModeDescription"),
    },
    {
      id: "owners",
      title: t("stepOwners"),
      description: t("stepOwnersDescription"),
    },
    {
      id: "review",
      title: t("stepReview"),
      description: t("stepReviewDescription"),
    },
  ];

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
  const setupUrl = `/api/leases/usage-fees/setup/${parkId}`;
  const {
    data: setupData,
    isLoading,
    error: isError,
  } = useQuery<ParkSetupData>({
    queryKey: [setupUrl],
    queryFn: () => fetcher(setupUrl),
  });

  // Initialize state from server data once loaded (replaces SWR onSuccess)
  useEffect(() => {
    if (!setupData) return;
    if (setupData.leaseSettlementMode) {
      setSettlementMode(setupData.leaseSettlementMode);
    }
    const assignments: Record<string, string | null> = {};
    setupData.leases.forEach((lease) => {
      assignments[lease.leaseId] = lease.directBillingFundId;
    });
    setDirectBillingAssignments(assignments);

  }, [setupData]);

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
      w.push(t("warningNoPhases"));
    }

    if (
      setupData.minimumRentPerTurbine === null ||
      setupData.minimumRentPerTurbine === 0
    ) {
      w.push(t("warningNoMinimumRent"));
    }

    if (setupData.leases.length === 0) {
      w.push(t("warningNoLeases"));
    }

    if (
      settlementMode === "OPERATOR_DIRECT" &&
      setupData.operatorFunds.length === 0
    ) {
      w.push(t("warningNoOperators"));
    }

    return w;
  }, [setupData, settlementMode, t]);

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
        throw new Error(err.message || t("saveErrorDetail"));
      }

      toast.success(t("saveSuccess"));
      router.push("/leases");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"));
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
          <h1 className="text-2xl font-bold">{t("notFoundTitle")}</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("notFoundDescription")}
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
            {t("titleWithPark", { parkName: setupData.parkName })}
          </h1>
          <p className="text-muted-foreground">
            {t("subtitle", { parkName: setupData.parkName })}
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
                {t("modeTitle")}
              </CardTitle>
              <CardDescription>{t("modeDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {setupData.billingEntityFund && (
                <div className="rounded-lg border p-4 bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-1">
                    {t("billingEntityLabel")}
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
                      {tMode("NETWORK_COMPANY")}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("networkModeDescription")}
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
                      {tMode("OPERATOR_DIRECT")}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("directModeDescription")}
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
                {t("ownersTitle")}
              </CardTitle>
              <CardDescription>{t("ownersDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colOwner")}</TableHead>
                      <TableHead>{t("colPlots")}</TableHead>
                      <TableHead className="text-right">
                        {t("colArea")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("colTurbines")}
                      </TableHead>
                      <TableHead className="w-[250px]">
                        {t("colBillingBy")}
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
                          {formatArea(lease.totalAreaSqm, intlLocale)}
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
                              <SelectValue
                                placeholder={t("selectCompanyPlaceholder")}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="network">
                                {t("networkModeLabel")}
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
        {/* STEP 3: Übersicht prüfen */}
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
                        {t("warningsTitle")}
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
                  {t("overviewTitle")}
                </CardTitle>
                <CardDescription>{t("overviewDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      {t("settlementModeLabel")}
                    </p>
                    <p className="font-medium">{tMode(settlementMode)}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      {t("networkEntityLabel")}
                    </p>
                    <p className="font-medium">
                      {setupData.billingEntityFund?.name || "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      {t("operatorsLabel")}
                    </p>
                    <p className="font-medium">
                      {t("operatorsCount", {
                        count: setupData.operatorFunds.length,
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      {t("revenuePhasesLabel")}
                    </p>
                    <p className="font-medium">
                      {t("phasesCount", {
                        count: setupData.revenuePhases.length,
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Table */}
            <Card>
              <CardHeader>
                <CardTitle>{t("leaseSummaryTitle")}</CardTitle>
                <CardDescription>
                  {t("leaseSummaryDescription", {
                    count: setupData.leases.length,
                    turbines: totalTurbines,
                    area: formatArea(totalArea, intlLocale),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colOwner")}</TableHead>
                        <TableHead>{t("colPlots")}</TableHead>
                        <TableHead className="text-right">
                          {t("colArea")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("colTurbines")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("colSealed")}
                        </TableHead>
                        {settlementMode === "OPERATOR_DIRECT" && (
                          <TableHead>{t("colBilling")}</TableHead>
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
                              {formatArea(lease.totalAreaSqm, intlLocale)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {lease.totalTurbineCount}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatArea(leaseSealedArea, intlLocale)}
                            </TableCell>
                            {settlementMode === "OPERATOR_DIRECT" && (
                              <TableCell>
                                <Badge variant="outline">
                                  {assignedFund
                                    ? assignedFund.name
                                    : t("networkModeLabel")}
                                </Badge>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">
                          {t("totalLabel")}
                        </TableCell>
                        <TableCell>
                          {setupData.leases.reduce(
                            (sum, l) => sum + l.plots.length,
                            0
                          )}{" "}
                          {t("plotsCountSuffix")}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatArea(totalArea, intlLocale)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {totalTurbines}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatArea(totalSealedArea, intlLocale)}
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
                  <CardTitle>{t("revenuePhasesTitle")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("colPhase")}</TableHead>
                          <TableHead>{t("colFromYear")}</TableHead>
                          <TableHead>{t("colToYear")}</TableHead>
                          <TableHead className="text-right">
                            {t("colRevenueShare")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {setupData.revenuePhases.map((phase) => (
                          <TableRow key={phase.phaseNumber}>
                            <TableCell className="font-medium">
                              {t("phaseNumber", { n: phase.phaseNumber })}
                            </TableCell>
                            <TableCell>{phase.startYear}</TableCell>
                            <TableCell>
                              {phase.endYear || t("unlimited")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatPercent(
                                phase.revenueSharePercentage,
                                intlLocale
                              )}
                              %
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
          {t("back")}
        </Button>

        {!isLastStep ? (
          <Button onClick={handleNext}>
            {t("continueBtn")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {t("saveSetup")}
          </Button>
        )}
      </StepActions>
    </div>
  );
}
