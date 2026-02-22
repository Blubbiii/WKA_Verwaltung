"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
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
import { Checkbox } from "@/components/ui/checkbox";
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

// Wizard Steps
const STEPS = [
  { id: "lessor", title: "Verpächter", description: "Vertragspartner" },
  { id: "plots", title: "Flurstücke", description: "Grundstücke" },
  { id: "contract", title: "Vertragsdaten", description: "Konditionen" },
  { id: "review", title: "Übersicht", description: "Prüfen & Speichern" },
];

export default function NewLeaseWizardPage() {
  const router = useRouter();
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
    usageTypes: [] as Array<{ id: string; sizeSqm: string }>,
    billingInterval: "ANNUAL" as "MONTHLY" | "QUARTERLY" | "ANNUAL",
    linkedTurbineId: "" as string,
    notes: "",
  });

  // Available usage types (PlotAreaType)
  const USAGE_TYPES = [
    { id: "WEA_STANDORT", label: "WEA-Standort", description: "Standortfläche für Windkraftanlage", unit: "m²" },
    { id: "POOL", label: "Poolfläche", description: "Pool-Fläche mit Ertragsanteil", unit: "m²" },
    { id: "WEG", label: "Zuwegung", description: "Zufahrtswege zur Anlage", unit: "m²" },
    { id: "KABEL", label: "Kabeltrasse", description: "Erdkabel und Leitungen", unit: "lfm" },
    { id: "AUSGLEICH", label: "Ausgleichsfläche", description: "Ökologische Ausgleichsflächen", unit: "m²" },
  ];

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
      } catch (error) {
        toast.error("Fehler beim Laden der Daten");
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
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
      plot.fieldNumber && plot.fieldNumber !== "0" ? `Flur ${plot.fieldNumber}` : null,
      `Flurstück ${plot.plotNumber}`,
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
      toast.error("Gemarkung und Flurstücknummer sind erforderlich");
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
    toast.success("Flurstück hinzugefügt");
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
          throw new Error("Fehler beim Erstellen des Verpächters");
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
          throw new Error(errorData.error || "Fehler beim Erstellen des Flurstücks");
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
        usageTypes: contractData.usageTypes.map((u) => u.id),
        usageTypesWithSize: contractData.usageTypes,
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
        throw new Error(errorData.error || "Fehler beim Erstellen des Pachtvertrags");
      }

      const leaseData = await leaseRes.json();
      toast.success("Pachtvertrag erfolgreich erstellt");
      router.push(`/leases/${leaseData.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen");
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
              Verpächter auswählen oder anlegen
            </CardTitle>
            <CardDescription>
              Wählen Sie einen bestehenden Verpächter oder legen Sie einen neuen an
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
                <Label htmlFor="select">Bestehenden auswählen</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="create" id="create" />
                <Label htmlFor="create">Neuen anlegen</Label>
              </div>
            </RadioGroup>

            {lessorMode === "select" ? (
              <div className="space-y-2">
                <Label>Verpächter *</Label>
                <Select value={selectedLessorId} onValueChange={setSelectedLessorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Verpächter auswählen..." />
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
                          {person.email && <p>E-Mail: {person.email}</p>}
                          {person.phone && <p>Telefon: {person.phone}</p>}
                          {(person.street || person.city) && (
                            <p>
                              Adresse: {[
                                [person.street, person.houseNumber].filter(Boolean).join(" "),
                                [person.postalCode, person.city].filter(Boolean).join(" "),
                              ].filter(Boolean).join(", ")}
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
                  <Label>Personentyp</Label>
                  <RadioGroup
                    value={newLessor.personType}
                    onValueChange={(v) =>
                      setNewLessor({ ...newLessor, personType: v as "natural" | "legal" })
                    }
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="natural" id="natural" />
                      <Label htmlFor="natural">Natürliche Person</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="legal" id="legal" />
                      <Label htmlFor="legal">Juristische Person</Label>
                    </div>
                  </RadioGroup>
                </div>

                {newLessor.personType === "natural" ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Vorname *</Label>
                      <Input
                        value={newLessor.firstName}
                        onChange={(e) =>
                          setNewLessor({ ...newLessor, firstName: e.target.value })
                        }
                        placeholder="Max"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nachname *</Label>
                      <Input
                        value={newLessor.lastName}
                        onChange={(e) =>
                          setNewLessor({ ...newLessor, lastName: e.target.value })
                        }
                        placeholder="Mustermann"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Firmenname *</Label>
                    <Input
                      value={newLessor.companyName}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, companyName: e.target.value })
                      }
                      placeholder="Musterfirma GmbH"
                    />
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>E-Mail</Label>
                    <Input
                      type="email"
                      value={newLessor.email}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, email: e.target.value })
                      }
                      placeholder="email@beispiel.de"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefon</Label>
                    <Input
                      value={newLessor.phone}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, phone: e.target.value })
                      }
                      placeholder="+49 123 456789"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-8 space-y-2">
                    <Label>Straße</Label>
                    <Input
                      value={newLessor.street}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, street: e.target.value })
                      }
                      placeholder="Musterstraße"
                    />
                  </div>
                  <div className="col-span-4 space-y-2">
                    <Label>Hausnummer</Label>
                    <Input
                      value={newLessor.houseNumber}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, houseNumber: e.target.value })
                      }
                      placeholder="123"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4 space-y-2">
                    <Label>PLZ</Label>
                    <Input
                      value={newLessor.postalCode}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, postalCode: e.target.value })
                      }
                      placeholder="12345"
                    />
                  </div>
                  <div className="col-span-8 space-y-2">
                    <Label>Ort</Label>
                    <Input
                      value={newLessor.city}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, city: e.target.value })
                      }
                      placeholder="Musterstadt"
                    />
                  </div>
                </div>

                <Separator />
                <p className="text-sm font-medium">Bankverbindung</p>

                <div className="space-y-2">
                  <Label>IBAN</Label>
                  <Input
                    value={newLessor.bankIban}
                    onChange={(e) =>
                      setNewLessor({ ...newLessor, bankIban: e.target.value })
                    }
                    placeholder="DE89 3704 0044 0532 0130 00"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>BIC</Label>
                    <Input
                      value={newLessor.bankBic}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, bankBic: e.target.value })
                      }
                      placeholder="COBADEFFXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank</Label>
                    <Input
                      value={newLessor.bankName}
                      onChange={(e) =>
                        setNewLessor({ ...newLessor, bankName: e.target.value })
                      }
                      placeholder="Commerzbank"
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
                Bestehende Flurstücke auswählen
              </CardTitle>
              <CardDescription>
                Wählen Sie Flurstücke aus, die bereits im System erfasst sind
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Nur verfügbare Flurstücke</Label>
                  <p className="text-xs text-muted-foreground">
                    {availablePlots.length} verfügbar, {plotsWithActiveLease.length} in aktiven Verträgen
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
                            `Dieses Flurstück ist noch in einem aktiven Vertrag mit ${plot.activeLease?.lessorName}`
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
                          Vertrag mit {plot.activeLease?.lessorName}
                        </Badge>
                      )}
                    </div>
                  );
                })}
                {displayedPlots.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    Keine Flurstücke gefunden
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
              Neue Flurstücke anlegen
            </CardTitle>
            <CardDescription>
              Legen Sie neue Flurstücke an, die noch nicht im System sind
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
                          <Badge variant="secondary" className="ml-2">Neu</Badge>
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
                    <Label>Gemarkung *</Label>
                    <Input
                      value={currentNewPlot.cadastralDistrict}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          cadastralDistrict: e.target.value,
                        })
                      }
                      placeholder="z.B. Musterstadt"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Flur</Label>
                    <Input
                      value={currentNewPlot.fieldNumber}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          fieldNumber: e.target.value,
                        })
                      }
                      placeholder="0 wenn nicht vorhanden"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Flurstück *</Label>
                    <Input
                      value={currentNewPlot.plotNumber}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          plotNumber: e.target.value,
                        })
                      }
                      placeholder="z.B. 123/4"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Landkreis</Label>
                    <Input
                      value={currentNewPlot.county}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          county: e.target.value,
                        })
                      }
                      placeholder="z.B. Landkreis Beispiel"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Gemeinde</Label>
                    <Input
                      value={currentNewPlot.municipality}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          municipality: e.target.value,
                        })
                      }
                      placeholder="z.B. Gemeinde Muster"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fläche (m²)</Label>
                    <Input
                      type="number"
                      value={currentNewPlot.areaSqm}
                      onChange={(e) =>
                        setCurrentNewPlot({
                          ...currentNewPlot,
                          areaSqm: e.target.value,
                        })
                      }
                      placeholder="z.B. 10000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Windpark</Label>
                    <Select
                      value={currentNewPlot.parkId}
                      onValueChange={(v) =>
                        setCurrentNewPlot({ ...currentNewPlot, parkId: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Windpark zuordnen..." />
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
                  <Label>Notizen</Label>
                  <Textarea
                    value={currentNewPlot.notes}
                    onChange={(e) =>
                      setCurrentNewPlot({
                        ...currentNewPlot,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Zusätzliche Informationen..."
                    rows={2}
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="button" onClick={addNewPlot}>
                    <Check className="mr-2 h-4 w-4" />
                    Flurstück hinzufügen
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNewPlotForm(false)}
                  >
                    Abbrechen
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
                Neues Flurstück anlegen
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        {(selectedPlotIds.length > 0 || newPlots.length > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedPlotIds.length + newPlots.length}
                </span>{" "}
                Flurstück{selectedPlotIds.length + newPlots.length !== 1 ? "e" : ""}{" "}
                ausgewählt
                {newPlots.length > 0 && (
                  <span className="text-green-600">
                    {" "}
                    ({newPlots.length} neu)
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
    const toggleUsageType = (typeId: string) => {
      setContractData((prev) => {
        const existing = prev.usageTypes.find((t) => t.id === typeId);
        if (existing) {
          return {
            ...prev,
            usageTypes: prev.usageTypes.filter((t) => t.id !== typeId),
          };
        }
        return {
          ...prev,
          usageTypes: [...prev.usageTypes, { id: typeId, sizeSqm: "" }],
        };
      });
    };

    const updateUsageTypeSize = (typeId: string, sizeSqm: string) => {
      setContractData((prev) => ({
        ...prev,
        usageTypes: prev.usageTypes.map((t) =>
          t.id === typeId ? { ...t, sizeSqm } : t
        ),
      }));
    };

    const isUsageTypeSelected = (typeId: string) =>
      contractData.usageTypes.some((t) => t.id === typeId);

    const getUsageTypeSize = (typeId: string) =>
      contractData.usageTypes.find((t) => t.id === typeId)?.sizeSqm || "";

    // Helper: Add years to start date for end date
    const setEndDateYears = (years: number) => {
      if (!contractData.startDate) {
        toast.error("Bitte zuerst Vertragsbeginn wählen");
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
              Vertragsdaten
            </CardTitle>
            <CardDescription>
              Geben Sie die Laufzeit und Nutzungsart des Pachtvertrags ein
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Vertragsabschluss (Unterschrift) */}
            <div className="space-y-2">
              <Label>Vertragsabschluss (Datum der Unterschrift)</Label>
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
                      ? format(contractData.signedDate, "dd.MM.yyyy", { locale: de })
                      : "Noch nicht unterschrieben"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={contractData.signedDate}
                    onSelect={(date) =>
                      setContractData({ ...contractData, signedDate: date })
                    }
                    locale={de}
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
                <Label>Vertragsbeginn (Baubeginn) *</Label>
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
                        ? format(contractData.startDate, "dd.MM.yyyy", { locale: de })
                        : "Datum wählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={contractData.startDate}
                      onSelect={(date) =>
                        setContractData({ ...contractData, startDate: date })
                      }
                      locale={de}
                      captionLayout="dropdown"
                      startMonth={new Date(2015, 0)}
                      endMonth={new Date(2040, 11)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Vertragsende</Label>
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
                          ? format(contractData.endDate, "dd.MM.yyyy", { locale: de })
                          : "Unbefristet"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={contractData.endDate}
                        onSelect={(date) =>
                          setContractData({ ...contractData, endDate: date })
                        }
                        locale={de}
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
                    +20 Jahre
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEndDateYears(25)}
                  >
                    +25 Jahre
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
                  <Label>Verlängerungsoption</Label>
                  <p className="text-sm text-muted-foreground">
                    Besteht eine Option zur Vertragsverlängerung?
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
                  <Label>Details zur Verlängerung</Label>
                  <Textarea
                    value={contractData.extensionDetails}
                    onChange={(e) =>
                      setContractData({ ...contractData, extensionDetails: e.target.value })
                    }
                    placeholder="z.B. Automatische Verlängerung um 5 Jahre, wenn nicht 12 Monate vor Ablauf gekündigt wird..."
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
                  <Label>Wartegeld</Label>
                  <p className="text-sm text-muted-foreground">
                    Zahlung an Flächeneigentümer vor/während des Baus
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
                    <Label>Betrag (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={contractData.waitingMoneyAmount}
                      onChange={(e) =>
                        setContractData({ ...contractData, waitingMoneyAmount: e.target.value })
                      }
                      placeholder="z.B. 500.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Einheit</Label>
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
                        <SelectItem value="pauschal">Pauschal</SelectItem>
                        <SelectItem value="ha">€ pro ha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Zahlungsrhythmus</Label>
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
                        <SelectItem value="once">Einmalig</SelectItem>
                        <SelectItem value="monthly">Monatlich</SelectItem>
                        <SelectItem value="yearly">Jährlich</SelectItem>
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
                <Label className="text-base">Abrechnungsintervall</Label>
                <p className="text-sm text-muted-foreground">
                  Bestimmt wie oft Mindestpacht-Vorschuesse erstellt werden
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Intervall</Label>
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
                      <SelectItem value="ANNUAL">Jaehrlich</SelectItem>
                      <SelectItem value="QUARTERLY">Quartalsweise</SelectItem>
                      <SelectItem value="MONTHLY">Monatlich</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Verknuepfte WKA (optional)</Label>
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
                      <SelectValue placeholder="Keine spezifische WKA" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine spezifische WKA</SelectItem>
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
                    Optional: Mindestpacht an spezifische WKA binden
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Nutzungsart */}
            <div className="space-y-4">
              <div>
                <Label className="text-base">Nutzungsart der Flaechen</Label>
                <p className="text-sm text-muted-foreground">
                  Waehlen Sie die Art der Flaechennutzung und geben Sie die jeweilige Groesse ein
                </p>
              </div>
              <div className="space-y-3">
                {USAGE_TYPES.map((type) => {
                  const isSelected = isUsageTypeSelected(type.id);
                  return (
                    <div
                      key={type.id}
                      className={cn(
                        "p-3 rounded-lg border transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      {/* Toggle Button - Custom Implementation statt Radix Checkbox */}
                      <button
                        type="button"
                        className="flex items-start space-x-3 w-full text-left"
                        onClick={() => toggleUsageType(type.id)}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                            isSelected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground"
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <div className="flex-1 space-y-1">
                          <span className="text-sm font-medium leading-none">
                            {type.label}
                          </span>
                          <p className="text-xs text-muted-foreground">{type.description}</p>
                        </div>
                      </button>
                      {/* Size input when selected */}
                      {isSelected && (
                        <div className="mt-3 ml-7">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">
                              {type.unit === "lfm" ? "Länge:" : "Fläche:"}
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="w-32 h-8 text-sm"
                              value={getUsageTypeSize(type.id)}
                              onChange={(e) => updateUsageTypeSize(type.id, e.target.value)}
                              placeholder="0"
                            />
                            <span className="text-xs text-muted-foreground">{type.unit}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Notizen */}
            <div className="space-y-2">
              <Label>Notizen</Label>
              <Textarea
                value={contractData.notes}
                onChange={(e) =>
                  setContractData({ ...contractData, notes: e.target.value })
                }
                placeholder="Zusätzliche Vertragsinformationen..."
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
            <CardTitle>Zusammenfassung</CardTitle>
            <CardDescription>
              Bitte überprüfen Sie die Angaben vor dem Speichern
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Lessor */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Verpächter
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
                    <Badge variant="secondary" className="mt-1">Wird neu angelegt</Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Plots */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Flurstücke ({allPlots.length})
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
                        {isNew && <Badge variant="secondary">Neu</Badge>}
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
                Vertragsdaten
              </h3>
              <div className="p-3 bg-muted rounded-lg space-y-4">
                {contractData.signedDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vertragsabschluss</p>
                    <p className="font-medium">
                      {format(contractData.signedDate, "dd.MM.yyyy", { locale: de })}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Laufzeit (ab Baubeginn)</p>
                    <p className="font-medium">
                      {contractData.startDate
                        ? format(contractData.startDate, "dd.MM.yyyy", { locale: de })
                        : "-"}{" "}
                      -{" "}
                      {contractData.endDate
                        ? format(contractData.endDate, "dd.MM.yyyy", { locale: de })
                        : "unbefristet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Verlängerungsoption</p>
                    <p className="font-medium">
                      {contractData.hasExtensionOption ? "Ja" : "Nein"}
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
                    <p className="text-xs text-muted-foreground">Wartegeld</p>
                    <p className="font-medium">
                      {parseFloat(contractData.waitingMoneyAmount || "0").toLocaleString("de-DE", {
                        style: "currency",
                        currency: "EUR",
                      })}{" "}
                      {contractData.waitingMoneyUnit === "ha" ? "pro ha" : "pauschal"},{" "}
                      {contractData.waitingMoneySchedule === "once"
                        ? "einmalig"
                        : contractData.waitingMoneySchedule === "monthly"
                          ? "monatlich"
                          : "jaehrlich"}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground">Abrechnungsintervall</p>
                  <p className="font-medium">
                    {contractData.billingInterval === "ANNUAL"
                      ? "Jaehrlich"
                      : contractData.billingInterval === "QUARTERLY"
                        ? "Quartalsweise"
                        : "Monatlich"}
                  </p>
                  {contractData.linkedTurbineId && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Wind className="h-3 w-3" />
                      Verknuepft mit: {turbines.find((t) => t.id === contractData.linkedTurbineId)?.designation || "WKA"}
                    </p>
                  )}
                </div>

                {contractData.usageTypes.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Nutzungsart</p>
                    <div className="space-y-1">
                      {contractData.usageTypes.map((usage) => {
                        const type = USAGE_TYPES.find((t) => t.id === usage.id);
                        const isLfm = type?.unit === "lfm";
                        const sizeValue = usage.sizeSqm ? parseFloat(usage.sizeSqm) : null;
                        return (
                          <div key={usage.id} className="flex items-center gap-2">
                            <Badge variant="outline">{type?.label || usage.id}</Badge>
                            {sizeValue && (
                              <span className="text-xs text-muted-foreground">
                                {isLfm
                                  ? `${sizeValue.toLocaleString("de-DE")} lfm`
                                  : `${(sizeValue / 10000).toFixed(2)} ha (${sizeValue.toLocaleString("de-DE")} m²)`
                                }
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {contractData.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notizen</p>
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
          <h1 className="text-3xl font-bold tracking-tight">Neuer Pachtvertrag</h1>
          <p className="text-muted-foreground">
            Erstellen Sie einen neuen Pachtvertrag in 4 Schritten
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
            Abbrechen
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentStep((prev) => prev - 1)}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
        </div>

        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setCurrentStep((prev) => prev + 1)}
            disabled={!canProceed()}
          >
            Weiter
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading || !canProceed()}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? "Wird erstellt..." : "Pachtvertrag erstellen"}
          </Button>
        )}
      </StepActions>
    </div>
  );
}
