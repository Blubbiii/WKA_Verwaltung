"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  CalendarIcon,
  Plus,
  User,
  Building2,
  MapPin,
  FileText,
  X,
  Wind,
  Check,
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
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Types
interface Person {
  id: string;
  personType: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
}

interface Park {
  id: string;
  name: string;
  shortName: string | null;
}

interface Turbine {
  id: string;
  designation: string;
  parkId: string;
}

interface ActiveLease {
  leaseId: string;
  status: string;
  lessorName: string;
}

interface Plot {
  id: string;
  cadastralDistrict: string;
  fieldNumber: string;
  plotNumber: string;
  areaSqm: number | null;
  county: string | null;
  municipality: string | null;
  parkId: string | null;
  park: Park | null;
  activeLease?: ActiveLease | null;
}

interface NewPlot {
  tempId: string;
  cadastralDistrict: string;
  fieldNumber: string;
  plotNumber: string;
  areaSqm: string;
  county: string;
  municipality: string;
  parkId: string;
  notes: string;
}

export default function NewLeaseWizardPage() {
  const router = useRouter();
  const t = useTranslations("leases.new");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const STEPS = [
    { id: "lessor", title: t("steps.lessor.title"), description: t("steps.lessor.description") },
    { id: "plots", title: t("steps.plots.title"), description: t("steps.plots.description") },
    { id: "contract", title: t("steps.contract.title"), description: t("steps.contract.description") },
    { id: "review", title: t("steps.review.title"), description: t("steps.review.description") },
  ];
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Data
  const [persons, setPersons] = useState<Person[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [existingPlots, setExistingPlots] = useState<Plot[]>([]);
  const [turbines, setTurbines] = useState<Turbine[]>([]);

  // Step 1: Lessor
  const [lessorMode, setLessorMode] = useState<"select" | "create">("select");
  const [selectedLessorId, setSelectedLessorId] = useState("");
  const [newLessor, setNewLessor] = useState({
    personType: "natural" as "natural" | "legal",
    firstName: "",
    lastName: "",
    companyName: "",
    email: "",
    phone: "",
    street: "",
    houseNumber: "",
    postalCode: "",
    city: "",
    bankIban: "",
    bankBic: "",
    bankName: "",
  });

  // Step 2: Plots
  const [selectedPlotIds, setSelectedPlotIds] = useState<string[]>([]);
  const [newPlots, setNewPlots] = useState<NewPlot[]>([]);
  const [showNewPlotForm, setShowNewPlotForm] = useState(false);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true); // Filter für verfügbare Flurstücke
  const [currentNewPlot, setCurrentNewPlot] = useState<NewPlot>({
    tempId: "",
    cadastralDistrict: "",
    fieldNumber: "0",
    plotNumber: "",
    areaSqm: "",
    county: "",
    municipality: "",
    parkId: "",
    notes: "",
  });

  // Step 3: Contract
  const [contractData, setContractData] = useState({
    signedDate: undefined as Date | undefined, // Vertragsabschluss (Unterschrift)
    startDate: undefined as Date | undefined, // Vertragsbeginn (Baubeginn)
    endDate: undefined as Date | undefined,
    hasExtensionOption: false,
    extensionDetails: "",
    hasWaitingMoney: false,
    waitingMoneyAmount: "",
    waitingMoneyUnit: "pauschal" as "pauschal" | "ha",
    waitingMoneySchedule: "yearly" as "monthly" | "yearly" | "once",
    billingInterval: "ANNUAL" as "MONTHLY" | "QUARTERLY" | "ANNUAL",
    linkedTurbineId: "" as string,
    notes: "",
  });

  // Load data
  useEffect(() => {
    async function fetchData() {
      try {
        const [personsRes, parksRes, plotsRes, turbinesRes] = await Promise.all([
          fetch("/api/persons?limit=500"),
          fetch("/api/parks?limit=100"),
          fetch("/api/plots?limit=500&includeLeases=true"),
          fetch("/api/turbines?limit=500"),
        ]);

        if (personsRes.ok) {
          const data = await personsRes.json();
          setPersons(data.persons || data.data || []);
        }
        if (parksRes.ok) {
          const data = await parksRes.json();
          setParks(data.parks || data.data || []);
        }
        if (plotsRes.ok) {
          const data = await plotsRes.json();
          setExistingPlots(data.plots || data.data || []);
        }
        if (turbinesRes.ok) {
          const data = await turbinesRes.json();
          setTurbines(data.turbines || data.data || []);
        }
      } catch {
        toast.error(t("loadDataError"));
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper functions
  function getPersonLabel(person: Person): string {
    if (person.personType === "legal") {
      return person.companyName || "-";
    }
    return [person.firstName, person.lastName].filter(Boolean).join(" ") || "-";
  }

  function getPlotLabel(plot: Plot | NewPlot): string {
    const parts = [
      plot.cadastralDistrict,
      plot.fieldNumber && plot.fieldNumber !== "0"
        ? t("plots.flur", { value: plot.fieldNumber })
        : null,
      t("plots.flurstueck", { value: plot.plotNumber }),
    ].filter(Boolean);
    return parts.join(", ");
  }

  function getSelectedLessor(): Person | null {
    if (lessorMode === "select") {
      return persons.find((p) => p.id === selectedLessorId) || null;
    }
    return null;
  }

  function getAllPlots(): (Plot | NewPlot)[] {
    const selected = existingPlots.filter((p) => selectedPlotIds.includes(p.id));
    return [...selected, ...newPlots];
  }

  // Validation
  function canProceed(): boolean {
    switch (currentStep) {
      case 0: // Lessor
        if (lessorMode === "select") {
          return !!selectedLessorId;
        }
        if (newLessor.personType === "natural") {
          return !!newLessor.firstName && !!newLessor.lastName;
        }
        return !!newLessor.companyName;

      case 1: // Plots
        return selectedPlotIds.length > 0 || newPlots.length > 0;

      case 2: // Contract
        return !!contractData.startDate;

      case 3: // Review
        return true;

      default:
        return false;
    }
  }

  // Add new plot to list
  function addNewPlot() {
    if (!currentNewPlot.cadastralDistrict || !currentNewPlot.plotNumber) {
      toast.error(t("plots.addPlotError"));
      return;
    }

    setNewPlots([
      ...newPlots,
      { ...currentNewPlot, tempId: `temp-${Date.now()}` },
    ]);
    setCurrentNewPlot({
      tempId: "",
      cadastralDistrict: "",
      fieldNumber: "0",
      plotNumber: "",
      areaSqm: "",
      county: "",
      municipality: "",
      parkId: "",
      notes: "",
    });
    setShowNewPlotForm(false);
    toast.success(t("plots.addPlotSuccess"));
  }

  function removeNewPlot(tempId: string) {
    setNewPlots(newPlots.filter((p) => p.tempId !== tempId));
  }

  function toggleExistingPlot(plotId: string) {
    setSelectedPlotIds((prev) =>
      prev.includes(plotId)
        ? prev.filter((id) => id !== plotId)
        : [...prev, plotId]
    );
  }

  // Submit
  async function handleSubmit() {
    setLoading(true);
    try {
      // Step 1: Create lessor if needed
      let lessorId = selectedLessorId;
      if (lessorMode === "create") {
        const lessorPayload = {
          personType: newLessor.personType,
          firstName: newLessor.personType === "natural" ? newLessor.firstName : undefined,
          lastName: newLessor.personType === "natural" ? newLessor.lastName : undefined,
          companyName: newLessor.personType === "legal" ? newLessor.companyName : undefined,
          email: newLessor.email || undefined,
          phone: newLessor.phone || undefined,
          street: newLessor.street || undefined,
          houseNumber: newLessor.houseNumber || undefined,
          postalCode: newLessor.postalCode || undefined,
          city: newLessor.city || undefined,
          bankIban: newLessor.bankIban || undefined,
          bankBic: newLessor.bankBic || undefined,
          bankName: newLessor.bankName || undefined,
        };

        const lessorRes = await fetch("/api/persons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lessorPayload),
        });

        if (!lessorRes.ok) {
          throw new Error(t("lessor.createError"));
        }

        const lessorData = await lessorRes.json();
        lessorId = lessorData.id;
      }

      // Step 2: Create new plots if needed
      const plotIds = [...selectedPlotIds];
      for (const newPlot of newPlots) {
        const plotPayload = {
          cadastralDistrict: newPlot.cadastralDistrict,
          fieldNumber: newPlot.fieldNumber || "0",
          plotNumber: newPlot.plotNumber,
          areaSqm: newPlot.areaSqm ? parseFloat(newPlot.areaSqm) : undefined,
          county: newPlot.county || undefined,
          municipality: newPlot.municipality || undefined,
          parkId: newPlot.parkId || undefined,
          notes: newPlot.notes || undefined,
        };

        const plotRes = await fetch("/api/plots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(plotPayload),
        });

        if (!plotRes.ok) {
          const errorData = await plotRes.json();
          throw new Error(errorData.error || t("plots.createError"));
        }

        const plotData = await plotRes.json();
        plotIds.push(plotData.id);
      }

      // Step 3: Create lease
      const leasePayload = {
        lessorId,
        plotIds,
        signedDate: contractData.signedDate
          ? format(contractData.signedDate, "yyyy-MM-dd")
          : undefined,
        startDate: contractData.startDate
          ? format(contractData.startDate, "yyyy-MM-dd")
          : undefined,
        endDate: contractData.endDate
          ? format(contractData.endDate, "yyyy-MM-dd")
          : undefined,
        hasExtensionOption: contractData.hasExtensionOption,
        extensionDetails: contractData.extensionDetails || undefined,
        hasWaitingMoney: contractData.hasWaitingMoney,
        waitingMoneyAmount: contractData.waitingMoneyAmount
          ? parseFloat(contractData.waitingMoneyAmount)
          : undefined,
        waitingMoneyUnit: contractData.hasWaitingMoney
          ? contractData.waitingMoneyUnit
          : undefined,
        waitingMoneySchedule: contractData.hasWaitingMoney
          ? contractData.waitingMoneySchedule
          : undefined,
        billingInterval: contractData.billingInterval,
        linkedTurbineId: contractData.linkedTurbineId || null,
        notes: contractData.notes || undefined,
      };

      const leaseRes = await fetch("/api/leases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leasePayload),
      });

      if (!leaseRes.ok) {
        const errorData = await leaseRes.json();
        throw new Error(errorData.error || t("actions.createError"));
      }

      const leaseData = await leaseRes.json();
      toast.success(t("actions.createSuccess"));
      router.push(`/leases/${leaseData.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("actions.genericError"));
    } finally {
      setLoading(false);
    }
  }

  // Render step content
  function renderStepContent() {
    switch (currentStep) {
      case 0:
        return renderLessorStep();
      case 1:
        return renderPlotsStep();
      case 2:
        return renderContractStep();
      case 3:
        return renderReviewStep();
      default:
        return null;
    }
  }

  // Step 1: Lessor
  function renderLessorStep() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t("lessor.cardTitle")}
            </CardTitle>
            <CardDescription>
              {t("lessor.cardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={lessorMode}
              onValueChange={(v) => setLessorMode(v as "select" | "create")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="select" id="select" />
                <Label htmlFor="select">{t("lessor.modeSelectExisting")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="create" id="create" />
                <Label htmlFor="create">{t("lessor.modeCreateNew")}</Label>
              </div>
            </RadioGroup>

            {lessorMode === "select" ? (
              <div className="space-y-2">
                <Label>{t("lessor.selectLabel")}</Label>
                <Select value={selectedLessorId} onValueChange={setSelectedLessorId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("lessor.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {persons.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        <div className="flex items-center gap-2">
                          {person.personType === "legal" ? (
                            <Building2 className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                          {getPersonLabel(person)}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedLessorId && (
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    {(() => {
                      const person = getSelectedLessor();
                      if (!person) return null;
                      return (
                        <div className="space-y-2 text-sm">
                          <p className="font-medium">{getPersonLabel(person)}</p>
                          {person.email && <p>{t("lessor.emailLine", { value: person.email })}</p>}
                          {person.phone && <p>{t("lessor.phoneLine", { value: person.phone })}</p>}
                          {(person.street || person.city) && (
                            <p>
                              {t("lessor.addressLine", {
                                value: [
                                  [person.street, person.houseNumber].filter(Boolean).join(" "),
                                  [person.postalCode, person.city].filter(Boolean).join(" "),
                                ].filter(Boolean).join(", "),
                              })}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("lessor.personType")}</Label>
                  <RadioGroup
                    value={newLessor.personType}
                    onValueChange={(v) =>
                      setNewLessor({ ...newLessor, personType: v as "natural" | "legal" })
                    }
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="natural" id="natural" />
                      <Label htmlFor="natural">{t("lessor.naturalPerson")}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="legal" id="legal" />
                      <Label htmlFor="legal">{t("lessor.legalPerson")}</Label>
                    </div>
                  </RadioGroup>
                </div>

                {newLessor.personType === "natural" ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("lessor.firstName")}</Label>
                      <Input
                        value={newLessor.firstName}
                        onChange={(e) =>
                          setNewLessor({ ...newLessor, firstName: e.target.value })
                        }
                        placeholder={t("lessor.firstNamePlaceholder")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("lessor.lastName")}</Label>
                      <Input
                        value={newLessor.lastName}
                        onChange={(e) =>
                          setNewLessor({ ...newLessor, lastName: e.target.value })
                        }
                        placeholder={t("lessor.lastNamePlaceholder")}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>{t("lessor.companyName")}</Label>
                    <Input
                      value={newLessor.companyName}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, companyName: e.target.value })
                      }
                      placeholder={t("lessor.companyNamePlaceholder")}
                    />
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("lessor.email")}</Label>
                    <Input
                      type="email"
                      value={newLessor.email}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, email: e.target.value })
                      }
                      placeholder={t("lessor.emailPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("lessor.phone")}</Label>
                    <Input
                      value={newLessor.phone}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, phone: e.target.value })
                      }
                      placeholder={t("lessor.phonePlaceholder")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-8 space-y-2">
                    <Label>{t("lessor.street")}</Label>
                    <Input
                      value={newLessor.street}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, street: e.target.value })
                      }
                      placeholder={t("lessor.streetPlaceholder")}
                    />
                  </div>
                  <div className="col-span-4 space-y-2">
                    <Label>{t("lessor.houseNumber")}</Label>
                    <Input
                      value={newLessor.houseNumber}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, houseNumber: e.target.value })
                      }
                      placeholder={t("lessor.houseNumberPlaceholder")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4 space-y-2">
                    <Label>{t("lessor.postalCode")}</Label>
                    <Input
                      value={newLessor.postalCode}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, postalCode: e.target.value })
                      }
                      placeholder={t("lessor.postalCodePlaceholder")}
                    />
                  </div>
                  <div className="col-span-8 space-y-2">
                    <Label>{t("lessor.city")}</Label>
                    <Input
                      value={newLessor.city}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, city: e.target.value })
                      }
                      placeholder={t("lessor.cityPlaceholder")}
                    />
                  </div>
                </div>

                <Separator />
                <p className="text-sm font-medium">{t("lessor.bankSection")}</p>

                <div className="space-y-2">
                  <Label>{t("lessor.iban")}</Label>
                  <Input
                    value={newLessor.bankIban}
                    onChange={(e) =>
                      setNewLessor({ ...newLessor, bankIban: e.target.value })
                    }
                    placeholder={t("lessor.ibanPlaceholder")}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("lessor.bic")}</Label>
                    <Input
                      value={newLessor.bankBic}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, bankBic: e.target.value })
                      }
                      placeholder={t("lessor.bicPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("lessor.bank")}</Label>
                    <Input
                      value={newLessor.bankName}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, bankName: e.target.value })
                      }
                      placeholder={t("lessor.bankPlaceholder")}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: Plots
  function renderPlotsStep() {
    // Filter plots based on availability
    const availablePlots = existingPlots.filter((plot) => !plot.activeLease);
    const plotsWithActiveLease = existingPlots.filter((plot) => plot.activeLease);
    const displayedPlots = showOnlyAvailable ? availablePlots : existingPlots;

    return (
      <div className="space-y-6">
        {/* Existing Plots */}
        {existingPlots.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                {t("plots.existingCardTitle")}
              </CardTitle>
              <CardDescription>
                {t("plots.existingCardDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{t("plots.filterAvailableLabel")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("plots.filterAvailableHint", {
                      available: availablePlots.length,
                      inLease: plotsWithActiveLease.length,
                    })}
                  </p>
                </div>
                <Switch
                  checked={showOnlyAvailable}
                  onCheckedChange={setShowOnlyAvailable}
                />
              </div>

              <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                {displayedPlots.map((plot) => {
                  const isSelected = selectedPlotIds.includes(plot.id);
                  const hasActiveLease = !!plot.activeLease;
                  return (
                    <div
                      key={plot.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors",
                        hasActiveLease
                          ? "border-orange-300 bg-orange-50 cursor-not-allowed opacity-75"
                          : isSelected
                            ? "border-primary bg-primary/5 cursor-pointer"
                            : "hover:bg-muted cursor-pointer"
                      )}
                      onClick={() => {
                        if (hasActiveLease) {
                          toast.error(
                            t("plots.activeLeaseError", {
                              name: plot.activeLease?.lessorName ?? "",
                            })
                          );
                          return;
                        }
                        toggleExistingPlot(plot.id);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-5 h-5 rounded border flex items-center justify-center",
                            hasActiveLease
                              ? "border-orange-400 bg-orange-100"
                              : isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground"
                          )}
                        >
                          {isSelected && !hasActiveLease && <Check className="h-3 w-3" />}
                        </div>
                        <div>
                          <p className="font-medium">{getPlotLabel(plot)}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {plot.areaSqm && (
                              <span>{(Number(plot.areaSqm) / 10000).toFixed(2)} ha</span>
                            )}
                            {plot.park && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Wind className="h-3 w-3" />
                                  {plot.park.shortName || plot.park.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {hasActiveLease && (
                        <Badge variant="outline" className="border-orange-400 text-orange-700 bg-orange-50">
                          {t("plots.activeLeaseBadge", {
                            name: plot.activeLease?.lessorName ?? "",
                          })}
                        </Badge>
                      )}
                    </div>
                  );
                })}
                {displayedPlots.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    {t("plots.noneFound")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* New Plots */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t("plots.newCardTitle")}
            </CardTitle>
            <CardDescription>
              {t("plots.newCardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* List of new plots */}
            {newPlots.length > 0 && (
              <div className="space-y-2">
                {newPlots.map((plot) => {
                  const park = parks.find((p) => p.id === plot.parkId);
                  return (
                    <div
                      key={plot.tempId}
                      className="flex items-center justify-between p-3 rounded-lg border bg-green-50 border-green-200"
                    >
                      <div>
                        <p className="font-medium">{getPlotLabel(plot)}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {plot.areaSqm && (
                            <span>{(parseFloat(plot.areaSqm) / 10000).toFixed(2)} ha</span>
                          )}
                          {park && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Wind className="h-3 w-3" />
                                {park.shortName || park.name}
                              </span>
                            </>
                          )}
                          <Badge variant="secondary" className="ml-2">{t("plots.badgeNew")}</Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNewPlot(plot.tempId)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* New plot form */}
            {showNewPlotForm ? (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("plots.cadastralDistrict")}</Label>
                    <Input
                      value={currentNewPlot.cadastralDistrict}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          cadastralDistrict: e.target.value,
                        })
                      }
                      placeholder={t("plots.cadastralDistrictPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("plots.fieldNumber")}</Label>
                    <Input
                      value={currentNewPlot.fieldNumber}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          fieldNumber: e.target.value,
                        })
                      }
                      placeholder={t("plots.fieldNumberPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("plots.plotNumber")}</Label>
                    <Input
                      value={currentNewPlot.plotNumber}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          plotNumber: e.target.value,
                        })
                      }
                      placeholder={t("plots.plotNumberPlaceholder")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("plots.county")}</Label>
                    <Input
                      value={currentNewPlot.county}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          county: e.target.value,
                        })
                      }
                      placeholder={t("plots.countyPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("plots.municipality")}</Label>
                    <Input
                      value={currentNewPlot.municipality}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          municipality: e.target.value,
                        })
                      }
                      placeholder={t("plots.municipalityPlaceholder")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("plots.areaSqm")}</Label>
                    <Input
                      type="number"
                      value={currentNewPlot.areaSqm}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          areaSqm: e.target.value,
                        })
                      }
                      placeholder={t("plots.areaSqmPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("plots.park")}</Label>
                    <Select
                      value={currentNewPlot.parkId}
                      onValueChange={(v) =>
                        setCurrentNewPlot({ ...currentNewPlot, parkId: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("plots.parkPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {parks.map((park) => (
                          <SelectItem key={park.id} value={park.id}>
                            {park.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>


                <div className="space-y-2">
                  <Label>{t("plots.notes")}</Label>
                  <Textarea
                    value={currentNewPlot.notes}
                    onChange={(e) =>
                      setCurrentNewPlot({
                        ...currentNewPlot,
                        notes: e.target.value,
                      })
                    }
                    placeholder={t("plots.notesPlaceholder")}
                    rows={2}
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="button" onClick={addNewPlot}>
                    <Check className="mr-2 h-4 w-4" />
                    {t("plots.addPlotButton")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNewPlotForm(false)}
                  >
                    {tCommon("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewPlotForm(true)}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("plots.showFormButton")}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        {(selectedPlotIds.length > 0 || newPlots.length > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("plots.summaryTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {selectedPlotIds.length + newPlots.length === 1
                  ? t("plots.summarySingular", { count: 1 })
                  : t("plots.summaryPlural", {
                      count: selectedPlotIds.length + newPlots.length,
                    })}
                {newPlots.length > 0 && (
                  <span className="text-green-600">
                    {t("plots.summaryNewSuffix", { count: newPlots.length })}
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Step 3: Contract
  function renderContractStep() {
    // Helper: Add years to start date for end date
    const setEndDateYears = (years: number) => {
      if (!contractData.startDate) {
        toast.error(t("contract.startDateRequired"));
        return;
      }
      const newEndDate = new Date(contractData.startDate);
      newEndDate.setFullYear(newEndDate.getFullYear() + years);
      setContractData({ ...contractData, endDate: newEndDate });
    };

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t("contract.cardTitle")}
            </CardTitle>
            <CardDescription>
              {t("contract.cardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Vertragsabschluss (Unterschrift) */}
            <div className="space-y-2">
              <Label>{t("contract.signedDateLabel")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !contractData.signedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {contractData.signedDate
                      ? format(contractData.signedDate, "dd.MM.yyyy", { locale: dateLocale })
                      : t("contract.signedDatePlaceholder")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={contractData.signedDate}
                    onSelect={(date) =>
                      setContractData({ ...contractData, signedDate: date })
                    }
                    locale={dateLocale}
                    captionLayout="dropdown"
                    startMonth={new Date(2015, 0)}
                    endMonth={new Date(2040, 11)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Vertragslaufzeit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("contract.startDateLabel")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !contractData.startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {contractData.startDate
                        ? format(contractData.startDate, "dd.MM.yyyy", { locale: dateLocale })
                        : t("contract.startDatePlaceholder")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={contractData.startDate}
                      onSelect={(date) =>
                        setContractData({ ...contractData, startDate: date })
                      }
                      locale={dateLocale}
                      captionLayout="dropdown"
                      startMonth={new Date(2015, 0)}
                      endMonth={new Date(2040, 11)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>{t("contract.endDateLabel")}</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal",
                          !contractData.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {contractData.endDate
                          ? format(contractData.endDate, "dd.MM.yyyy", { locale: dateLocale })
                          : t("contract.endDatePlaceholder")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={contractData.endDate}
                        onSelect={(date) =>
                          setContractData({ ...contractData, endDate: date })
                        }
                        locale={dateLocale}
                        captionLayout="dropdown"
                        startMonth={new Date(2020, 0)}
                        endMonth={new Date(2070, 11)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {/* Quick Buttons for +20/+25 Years */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEndDateYears(20)}
                  >
                    {t("contract.plus20Years")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEndDateYears(25)}
                  >
                    {t("contract.plus25Years")}
                  </Button>
                  {contractData.endDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setContractData({ ...contractData, endDate: undefined })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Verlängerungsoption */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("contract.extensionLabel")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("contract.extensionHint")}
                  </p>
                </div>
                <Switch
                  checked={contractData.hasExtensionOption}
                  onCheckedChange={(checked) =>
                    setContractData({ ...contractData, hasExtensionOption: checked })
                  }
                />
              </div>
              {contractData.hasExtensionOption && (
                <div className="space-y-2">
                  <Label>{t("contract.extensionDetailsLabel")}</Label>
                  <Textarea
                    value={contractData.extensionDetails}
                    onChange={(e) =>
                      setContractData({ ...contractData, extensionDetails: e.target.value })
                    }
                    placeholder={t("contract.extensionDetailsPlaceholder")}
                    rows={2}
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* Wartegeld */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("contract.waitingMoneyLabel")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("contract.waitingMoneyHint")}
                  </p>
                </div>
                <Switch
                  checked={contractData.hasWaitingMoney}
                  onCheckedChange={(checked) =>
                    setContractData({ ...contractData, hasWaitingMoney: checked })
                  }
                />
              </div>
              {contractData.hasWaitingMoney && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("contract.waitingMoneyAmountLabel")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={contractData.waitingMoneyAmount}
                      onChange={(e) =>
                        setContractData({ ...contractData, waitingMoneyAmount: e.target.value })
                      }
                      placeholder={t("contract.waitingMoneyAmountPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("contract.waitingMoneyUnitLabel")}</Label>
                    <Select
                      value={contractData.waitingMoneyUnit}
                      onValueChange={(v) =>
                        setContractData({
                          ...contractData,
                          waitingMoneyUnit: v as "pauschal" | "ha",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pauschal">{t("contract.waitingMoneyUnitFlat")}</SelectItem>
                        <SelectItem value="ha">{t("contract.waitingMoneyUnitHa")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("contract.waitingMoneyScheduleLabel")}</Label>
                    <Select
                      value={contractData.waitingMoneySchedule}
                      onValueChange={(v) =>
                        setContractData({
                          ...contractData,
                          waitingMoneySchedule: v as "monthly" | "yearly" | "once",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">{t("contract.waitingMoneyScheduleOnce")}</SelectItem>
                        <SelectItem value="monthly">{t("contract.waitingMoneyScheduleMonthly")}</SelectItem>
                        <SelectItem value="yearly">{t("contract.waitingMoneyScheduleYearly")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Abrechnungsintervall */}
            <div className="space-y-4">
              <div>
                <Label className="text-base">{t("contract.billingSectionTitle")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("contract.billingSectionHint")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("contract.billingIntervalLabel")}</Label>
                  <Select
                    value={contractData.billingInterval}
                    onValueChange={(v) =>
                      setContractData({
                        ...contractData,
                        billingInterval: v as "MONTHLY" | "QUARTERLY" | "ANNUAL",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ANNUAL">{t("contract.billingIntervalAnnual")}</SelectItem>
                      <SelectItem value="QUARTERLY">{t("contract.billingIntervalQuarterly")}</SelectItem>
                      <SelectItem value="MONTHLY">{t("contract.billingIntervalMonthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("contract.linkedTurbineLabel")}</Label>
                  <Select
                    value={contractData.linkedTurbineId || "none"}
                    onValueChange={(v) =>
                      setContractData({
                        ...contractData,
                        linkedTurbineId: v === "none" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("contract.linkedTurbinePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("contract.linkedTurbineNone")}</SelectItem>
                      {(() => {
                        // Finde Parks aus ausgewaehlten Plots
                        const selectedParkIds = new Set<string>();
                        selectedPlotIds.forEach((plotId) => {
                          const plot = existingPlots.find((p) => p.id === plotId);
                          if (plot?.parkId) selectedParkIds.add(plot.parkId);
                        });
                        newPlots.forEach((plot) => {
                          if (plot.parkId) selectedParkIds.add(plot.parkId);
                        });

                        // Filtere Turbines nach Parks
                        const filteredTurbines = selectedParkIds.size > 0
                          ? turbines.filter((t) => selectedParkIds.has(t.parkId))
                          : turbines;

                        return filteredTurbines.map((turbine) => {
                          const park = parks.find((p) => p.id === turbine.parkId);
                          return (
                            <SelectItem key={turbine.id} value={turbine.id}>
                              <span className="flex items-center gap-2">
                                <Wind className="h-4 w-4" />
                                {turbine.designation}
                                {park && (
                                  <span className="text-muted-foreground">
                                    ({park.shortName || park.name})
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        });
                      })()}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("contract.linkedTurbineHint")}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <Separator />

            {/* Notizen */}
            <div className="space-y-2">
              <Label>{t("contract.notesLabel")}</Label>
              <Textarea
                value={contractData.notes}
                onChange={(e) =>
                  setContractData({ ...contractData, notes: e.target.value })
                }
                placeholder={t("contract.notesPlaceholder")}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 4: Review
  function renderReviewStep() {
    const lessor = getSelectedLessor();
    const allPlots = getAllPlots();

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("review.summaryTitle")}</CardTitle>
            <CardDescription>
              {t("review.summaryDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Lessor */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t("review.lessorLabel")}
              </h3>
              <div className="p-3 bg-muted rounded-lg">
                {lessorMode === "select" && lessor ? (
                  <div>
                    <p className="font-medium">{getPersonLabel(lessor)}</p>
                    {lessor.email && (
                      <p className="text-sm text-muted-foreground">{lessor.email}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">
                      {newLessor.personType === "natural"
                        ? `${newLessor.firstName} ${newLessor.lastName}`
                        : newLessor.companyName}
                    </p>
                    {newLessor.email && (
                      <p className="text-sm text-muted-foreground">{newLessor.email}</p>
                    )}
                    <Badge variant="secondary" className="mt-1">{t("review.lessorWillBeCreated")}</Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Plots */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t("review.plotsLabel", { count: allPlots.length })}
              </h3>
              <div className="space-y-2">
                {allPlots.map((plot) => {
                  const isNew = "tempId" in plot;
                  const park = isNew
                    ? parks.find((p) => p.id === (plot as NewPlot).parkId)
                    : (plot as Plot).park;

                  return (
                    <div key={isNew ? (plot as NewPlot).tempId : (plot as Plot).id} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{getPlotLabel(plot)}</p>
                        {isNew && <Badge variant="secondary">{t("review.badgeNew")}</Badge>}
                      </div>
                      {park && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Wind className="h-3 w-3" />
                          {park.shortName || park.name}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contract */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t("review.contractLabel")}
              </h3>
              <div className="p-3 bg-muted rounded-lg space-y-4">
                {contractData.signedDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("review.signedDateLabel")}</p>
                    <p className="font-medium">
                      {format(contractData.signedDate, "dd.MM.yyyy", { locale: dateLocale })}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("review.termLabel")}</p>
                    <p className="font-medium">
                      {contractData.startDate
                        ? format(contractData.startDate, "dd.MM.yyyy", { locale: dateLocale })
                        : "-"}{" "}
                      -{" "}
                      {contractData.endDate
                        ? format(contractData.endDate, "dd.MM.yyyy", { locale: dateLocale })
                        : t("review.termIndefinite")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("review.extensionLabel")}</p>
                    <p className="font-medium">
                      {contractData.hasExtensionOption ? tCommon("yes") : tCommon("no")}
                    </p>
                    {contractData.hasExtensionOption && contractData.extensionDetails && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {contractData.extensionDetails}
                      </p>
                    )}
                  </div>
                </div>

                {contractData.hasWaitingMoney && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("review.waitingMoneyLabel")}</p>
                    <p className="font-medium">
                      {parseFloat(contractData.waitingMoneyAmount || "0").toLocaleString(
                        locale === "en" ? "en-US" : "de-DE",
                        {
                          style: "currency",
                          currency: "EUR",
                        }
                      )}{" "}
                      {contractData.waitingMoneyUnit === "ha"
                        ? t("review.waitingMoneyPerHa")
                        : t("review.waitingMoneyFlat")}
                      ,{" "}
                      {contractData.waitingMoneySchedule === "once"
                        ? t("review.waitingMoneyOnce")
                        : contractData.waitingMoneySchedule === "monthly"
                          ? t("review.waitingMoneyMonthly")
                          : t("review.waitingMoneyYearly")}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground">{t("review.billingLabel")}</p>
                  <p className="font-medium">
                    {contractData.billingInterval === "ANNUAL"
                      ? t("review.billingAnnual")
                      : contractData.billingInterval === "QUARTERLY"
                        ? t("review.billingQuarterly")
                        : t("review.billingMonthly")}
                  </p>
                  {contractData.linkedTurbineId && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Wind className="h-3 w-3" />
                      {t("review.linkedTurbineLabel", {
                        value:
                          turbines.find((tb) => tb.id === contractData.linkedTurbineId)
                            ?.designation || t("review.linkedTurbineFallback"),
                      })}
                    </p>
                  )}
                </div>


                {contractData.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("review.notesLabel")}</p>
                    <p className="text-sm">{contractData.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-muted-foreground">
            {t("pageDescription")}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <Stepper
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={(step) => {
          if (step < currentStep) {
            setCurrentStep(step);
          }
        }}
      />

      {/* Content */}
      <StepContent>{renderStepContent()}</StepContent>

      {/* Actions */}
      <StepActions>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentStep((prev) => prev - 1)}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("actions.back")}
          </Button>
        </div>

        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setCurrentStep((prev) => prev + 1)}
            disabled={!canProceed()}
          >
            {t("actions.next")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading || !canProceed()}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? t("actions.creating") : t("actions.create")}
          </Button>
        )}
      </StepActions>
    </div>
  );
}
