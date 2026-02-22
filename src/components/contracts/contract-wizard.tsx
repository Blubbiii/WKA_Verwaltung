"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, addYears } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  CalendarIcon,
  Plus,
  X,
  FileText,
  Clock,
  Users,
  Building2,
  User,
  Wind,
  Landmark,
  Info,
  Bell,
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

// ==========================================
// Types
// ==========================================

interface Person {
  id: string;
  personType: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
}

interface ParkOption {
  id: string;
  name: string;
  shortName: string | null;
}

interface FundOption {
  id: string;
  name: string;
}

interface ContractWizardState {
  // Step 1: Type & basics
  contractType: string;
  contractNumber: string;
  title: string;
  status: string;
  // Step 2: Duration & finances
  startDate: Date | null;
  endDate: Date | null;
  noticePeriodMonths: number | null;
  autoRenewal: boolean;
  renewalPeriodMonths: number | null;
  annualValue: number | null;
  paymentTerms: string;
  // Step 3: Assignments & reminders
  parkId: string;
  fundId: string;
  partnerId: string;
  reminderDays: number[];
}

// ==========================================
// Constants
// ==========================================

// Wizard steps definition
const STEPS = [
  {
    id: "type",
    title: "Vertragsart",
    description: "Art & Basisdaten",
  },
  {
    id: "duration",
    title: "Laufzeit & Finanzen",
    description: "Konditionen",
  },
  {
    id: "assignments",
    title: "Zuordnungen",
    description: "Partner & Erinnerungen",
  },
  {
    id: "review",
    title: "Zusammenfassung",
    description: "Pruefen & Speichern",
  },
];

// Contract type options mapped to the Prisma enum values
const CONTRACT_TYPE_OPTIONS = [
  {
    value: "LEASE",
    label: "Pachtvertrag",
    description: "Pachtvertrag fuer Grundstuecke/Flurstuecke",
    icon: Landmark,
  },
  {
    value: "SERVICE",
    label: "Betriebsfuehrungsvertrag",
    description:
      "Vertrag zur technischen oder kaufmaennischen Betriebsfuehrung",
    icon: Building2,
  },
  {
    value: "INSURANCE",
    label: "Versicherungsvertrag",
    description: "Versicherungsschutz fuer Anlagen und Betrieb",
    icon: FileText,
  },
  {
    value: "GRID_CONNECTION",
    label: "Netzanschlussvertrag",
    description: "Vertrag fuer Netzanschluss und Einspeisung",
    icon: Wind,
  },
  {
    value: "MARKETING",
    label: "Vermarktungsvertrag",
    description: "Direktvermarktung und Stromverkauf",
    icon: FileText,
  },
  {
    value: "OTHER",
    label: "Sonstiger Vertrag",
    description: "Wartungs-, Dienstleistungs- oder sonstige Vertraege",
    icon: FileText,
  },
];

// Status options for the contract
const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Entwurf" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "EXPIRED", label: "Abgelaufen" },
  { value: "TERMINATED", label: "Gekuendigt" },
];

// ==========================================
// Component
// ==========================================

export function ContractWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Dropdown data
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);

  // Reminder input
  const [newReminderInput, setNewReminderInput] = useState("");

  // Wizard state
  const [formData, setFormData] = useState<ContractWizardState>({
    contractType: "",
    contractNumber: "",
    title: "",
    status: "DRAFT",
    startDate: null,
    endDate: null,
    noticePeriodMonths: null,
    autoRenewal: false,
    renewalPeriodMonths: null,
    annualValue: null,
    paymentTerms: "",
    parkId: "",
    fundId: "",
    partnerId: "",
    reminderDays: [90, 30],
  });

  // Load dropdown data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [parksRes, fundsRes, personsRes] = await Promise.all([
          fetch("/api/parks?limit=100"),
          fetch("/api/funds?limit=100"),
          fetch("/api/persons?limit=500"),
        ]);

        if (parksRes.ok) {
          const data = await parksRes.json();
          setParks(
            (data.data || []).map(
              (p: { id: string; name: string; shortName: string | null }) => ({
                id: p.id,
                name: p.shortName || p.name,
                shortName: p.shortName,
              })
            )
          );
        }
        if (fundsRes.ok) {
          const data = await fundsRes.json();
          setFunds(
            (data.data || []).map((f: { id: string; name: string }) => ({
              id: f.id,
              name: f.name,
            }))
          );
        }
        if (personsRes.ok) {
          const data = await personsRes.json();
          setPersons(data.data || []);
        }
      } catch {
        toast.error("Fehler beim Laden der Stammdaten");
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
  }, []);

  // Helper: get display name for a person
  const getPersonLabel = useCallback((person: Person): string => {
    if (person.personType === "legal") {
      return person.companyName || "-";
    }
    return (
      [person.firstName, person.lastName].filter(Boolean).join(" ") || "-"
    );
  }, []);

  // Helper: get the selected partner object
  const getSelectedPartner = useCallback((): Person | null => {
    if (!formData.partnerId) return null;
    return persons.find((p) => p.id === formData.partnerId) || null;
  }, [formData.partnerId, persons]);

  // Helper: get the contract type label
  const getContractTypeLabel = useCallback((value: string): string => {
    return (
      CONTRACT_TYPE_OPTIONS.find((o) => o.value === value)?.label || value
    );
  }, []);

  // Helper: get status label
  const getStatusLabel = useCallback((value: string): string => {
    return STATUS_OPTIONS.find((o) => o.value === value)?.label || value;
  }, []);

  // Helper: set end date relative to start date
  function setEndDateYears(years: number) {
    if (!formData.startDate) {
      toast.error("Bitte zuerst Vertragsbeginn waehlen");
      return;
    }
    const newEndDate = addYears(formData.startDate, years);
    setFormData((prev) => ({ ...prev, endDate: newEndDate }));
  }

  // Reminder management
  function addReminder() {
    const days = parseInt(newReminderInput);
    if (isNaN(days) || days <= 0) {
      toast.error("Bitte eine gueltige Anzahl Tage eingeben");
      return;
    }
    if (formData.reminderDays.includes(days)) {
      toast.error("Diese Erinnerung existiert bereits");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      reminderDays: [...prev.reminderDays, days].sort((a, b) => b - a),
    }));
    setNewReminderInput("");
  }

  function removeReminder(days: number) {
    setFormData((prev) => ({
      ...prev,
      reminderDays: prev.reminderDays.filter((d) => d !== days),
    }));
  }

  // Step validation
  function canProceed(): boolean {
    switch (currentStep) {
      case 0: // Type & basics
        return !!formData.contractType && !!formData.title.trim();
      case 1: // Duration & finances
        return !!formData.startDate;
      case 2: // Assignments & reminders
        return true; // All fields optional
      case 3: // Review
        return true;
      default:
        return false;
    }
  }

  // Submit handler
  async function handleSubmit() {
    setLoading(true);
    try {
      const payload = {
        contractType: formData.contractType,
        contractNumber: formData.contractNumber || undefined,
        title: formData.title,
        status: formData.status,
        startDate: formData.startDate
          ? format(formData.startDate, "yyyy-MM-dd")
          : undefined,
        endDate: formData.endDate
          ? format(formData.endDate, "yyyy-MM-dd")
          : null,
        noticePeriodMonths: formData.noticePeriodMonths || null,
        autoRenewal: formData.autoRenewal,
        renewalPeriodMonths: formData.autoRenewal
          ? formData.renewalPeriodMonths
          : null,
        annualValue: formData.annualValue || null,
        paymentTerms: formData.paymentTerms || null,
        parkId:
          formData.parkId && formData.parkId !== "_none"
            ? formData.parkId
            : null,
        fundId:
          formData.fundId && formData.fundId !== "_none"
            ? formData.fundId
            : null,
        partnerId:
          formData.partnerId && formData.partnerId !== "_none"
            ? formData.partnerId
            : null,
        reminderDays: formData.reminderDays,
      };

      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen des Vertrags");
      }

      const contract = await response.json();
      toast.success("Vertrag erfolgreich erstellt");
      router.push(`/contracts/${contract.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen"
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // Step 1: Contract type & basic data
  // ==========================================
  function renderTypeStep() {
    const selectedType = CONTRACT_TYPE_OPTIONS.find(
      (o) => o.value === formData.contractType
    );

    return (
      <div className="space-y-6">
        {/* Contract Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Vertragsart
            </CardTitle>
            <CardDescription>
              Waehlen Sie die Art des Vertrags
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CONTRACT_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = formData.contractType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        contractType: option.value,
                      }))
                    }
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          isSelected
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                      />
                      <span className="font-medium text-sm">
                        {option.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Type description hint */}
            {selectedType && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {selectedType.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Basic Data */}
        <Card>
          <CardHeader>
            <CardTitle>Basisdaten</CardTitle>
            <CardDescription>
              Grundlegende Vertragsinformationen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Titel *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  placeholder="Bezeichnung des Vertrags"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractNumber">Vertragsnummer</Label>
                <Input
                  id="contractNumber"
                  value={formData.contractNumber}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      contractNumber: e.target.value,
                    }))
                  }
                  placeholder="z.B. V-2026-001"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, status: v }))
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // Step 2: Duration & finances
  // ==========================================
  function renderDurationStep() {
    return (
      <div className="space-y-6">
        {/* Duration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Vertragslaufzeit
            </CardTitle>
            <CardDescription>
              Beginn, Ende und Kuendigungsfristen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Start & End dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Start Date */}
              <div className="space-y-2">
                <Label>Vertragsbeginn *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.startDate
                        ? format(formData.startDate, "dd.MM.yyyy", {
                            locale: de,
                          })
                        : "Datum waehlen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.startDate ?? undefined}
                      onSelect={(date) =>
                        setFormData((prev) => ({
                          ...prev,
                          startDate: date ?? null,
                        }))
                      }
                      locale={de}
                      captionLayout="dropdown"
                      startMonth={new Date(2015, 0)}
                      endMonth={new Date(2050, 11)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label>Vertragsende</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.endDate
                        ? format(formData.endDate, "dd.MM.yyyy", {
                            locale: de,
                          })
                        : "Unbefristet"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.endDate ?? undefined}
                      onSelect={(date) =>
                        setFormData((prev) => ({
                          ...prev,
                          endDate: date ?? null,
                        }))
                      }
                      locale={de}
                      captionLayout="dropdown"
                      startMonth={new Date(2020, 0)}
                      endMonth={new Date(2070, 11)}
                    />
                  </PopoverContent>
                </Popover>

                {/* Convenience buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEndDateYears(5)}
                  >
                    +5 Jahre
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEndDateYears(10)}
                  >
                    +10 Jahre
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEndDateYears(20)}
                  >
                    +20 Jahre
                  </Button>
                  {formData.endDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, endDate: null }))
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Notice period */}
            <div className="space-y-2">
              <Label htmlFor="noticePeriodMonths">
                Kuendigungsfrist (Monate)
              </Label>
              <Input
                id="noticePeriodMonths"
                type="number"
                min="1"
                placeholder="z.B. 6"
                value={formData.noticePeriodMonths ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    noticePeriodMonths: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  }))
                }
              />
            </div>

            {/* Auto-renewal */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoRenewal">
                    Automatische Verlaengerung
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Vertrag verlaengert sich automatisch, wenn nicht gekuendigt
                    wird
                  </p>
                </div>
                <Switch
                  id="autoRenewal"
                  checked={formData.autoRenewal}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      autoRenewal: checked,
                    }))
                  }
                />
              </div>
              {formData.autoRenewal && (
                <div className="space-y-2">
                  <Label htmlFor="renewalPeriodMonths">
                    Verlaengerungszeitraum (Monate)
                  </Label>
                  <Input
                    id="renewalPeriodMonths"
                    type="number"
                    min="1"
                    placeholder="z.B. 12"
                    value={formData.renewalPeriodMonths ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        renewalPeriodMonths: e.target.value
                          ? parseInt(e.target.value)
                          : null,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Finances */}
        <Card>
          <CardHeader>
            <CardTitle>Finanzielles</CardTitle>
            <CardDescription>
              Jaehrlicher Wert und Zahlungsbedingungen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="annualValue">Jaehrlicher Wert (EUR)</Label>
                <Input
                  id="annualValue"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={formData.annualValue ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      annualValue: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentTerms">Zahlungsbedingungen</Label>
                <Textarea
                  id="paymentTerms"
                  value={formData.paymentTerms}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      paymentTerms: e.target.value,
                    }))
                  }
                  placeholder="z.B. Jaehrlich im Voraus zum 01.01."
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // Step 3: Assignments & reminders
  // ==========================================
  function renderAssignmentsStep() {
    const selectedPartner = getSelectedPartner();

    return (
      <div className="space-y-6">
        {/* Park, Fund, Partner */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Zuordnungen
            </CardTitle>
            <CardDescription>
              Verknuepfen Sie den Vertrag mit Windpark, Gesellschaft und
              Vertragspartner
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Park */}
              <div className="space-y-2">
                <Label htmlFor="parkId">Windpark</Label>
                <Select
                  value={formData.parkId || "_none"}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      parkId: v === "_none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger id="parkId">
                    <SelectValue placeholder="Kein Windpark" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Kein Windpark</SelectItem>
                    {parks.map((park) => (
                      <SelectItem key={park.id} value={park.id}>
                        {park.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fund */}
              <div className="space-y-2">
                <Label htmlFor="fundId">Gesellschaft</Label>
                <Select
                  value={formData.fundId || "_none"}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      fundId: v === "_none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger id="fundId">
                    <SelectValue placeholder="Keine Gesellschaft" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Keine Gesellschaft</SelectItem>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Partner */}
              <div className="space-y-2">
                <Label htmlFor="partnerId">Vertragspartner</Label>
                <Select
                  value={formData.partnerId || "_none"}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      partnerId: v === "_none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger id="partnerId">
                    <SelectValue placeholder="Kein Partner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Kein Partner</SelectItem>
                    {persons.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        <span className="flex items-center gap-2">
                          {person.personType === "legal" ? (
                            <Building2 className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                          {getPersonLabel(person)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Partner details */}
            {selectedPartner && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-medium mb-2">
                  Partner-Details
                </h4>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {getPersonLabel(selectedPartner)}
                  </p>
                  {selectedPartner.companyName &&
                    selectedPartner.personType === "legal" && (
                      <p className="text-muted-foreground">
                        {selectedPartner.companyName}
                      </p>
                    )}
                  {selectedPartner.email && (
                    <p className="text-muted-foreground">
                      E-Mail: {selectedPartner.email}
                    </p>
                  )}
                  {selectedPartner.phone && (
                    <p className="text-muted-foreground">
                      Telefon: {selectedPartner.phone}
                    </p>
                  )}
                  {(selectedPartner.street || selectedPartner.city) && (
                    <p className="text-muted-foreground">
                      Adresse:{" "}
                      {[
                        selectedPartner.street,
                        selectedPartner.postalCode,
                        selectedPartner.city,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reminders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Erinnerungen
            </CardTitle>
            <CardDescription>
              Erinnerungen vor Vertragsende (nur relevant bei befristeten
              Vertraegen)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!formData.endDate && (
              <p className="text-sm text-muted-foreground italic">
                Erinnerungen werden nur bei befristeten Vertraegen mit
                Enddatum ausgeloest.
              </p>
            )}

            {/* Current reminders */}
            <div className="flex flex-wrap gap-2">
              {formData.reminderDays.map((days) => (
                <Badge key={days} variant="secondary" className="gap-1">
                  {days} Tage vorher
                  <button
                    type="button"
                    onClick={() => removeReminder(days)}
                    className="ml-1 hover:text-destructive"
                    aria-label={`Erinnerung ${days} Tage entfernen`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {formData.reminderDays.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Keine Erinnerungen konfiguriert
                </p>
              )}
            </div>

            {/* Add reminder */}
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                placeholder="Tage"
                value={newReminderInput}
                onChange={(e) => setNewReminderInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addReminder();
                  }
                }}
                className="w-32"
                aria-label="Erinnerung in Tagen"
              />
              <Button type="button" variant="outline" onClick={addReminder}>
                <Plus className="mr-2 h-4 w-4" />
                Hinzufuegen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // Step 4: Review
  // ==========================================
  function renderReviewStep() {
    const selectedPartner = getSelectedPartner();
    const selectedPark = parks.find((p) => p.id === formData.parkId);
    const selectedFund = funds.find((f) => f.id === formData.fundId);

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Zusammenfassung</CardTitle>
            <CardDescription>
              Bitte ueberpruefen Sie die Angaben vor dem Speichern
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Type & Basics */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Vertragsart & Basisdaten
              </h3>
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Vertragsart
                    </p>
                    <p className="font-medium">
                      {getContractTypeLabel(formData.contractType)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="font-medium">
                      {getStatusLabel(formData.status)}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Titel</p>
                  <p className="font-medium">{formData.title}</p>
                </div>
                {formData.contractNumber && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Vertragsnummer
                    </p>
                    <p className="font-medium">{formData.contractNumber}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Duration & Finances */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Laufzeit & Finanzen
              </h3>
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Vertragsbeginn
                    </p>
                    <p className="font-medium">
                      {formData.startDate
                        ? format(formData.startDate, "dd.MM.yyyy", {
                            locale: de,
                          })
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Vertragsende
                    </p>
                    <p className="font-medium">
                      {formData.endDate
                        ? format(formData.endDate, "dd.MM.yyyy", {
                            locale: de,
                          })
                        : "Unbefristet"}
                    </p>
                  </div>
                </div>

                {formData.noticePeriodMonths && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Kuendigungsfrist
                    </p>
                    <p className="font-medium">
                      {formData.noticePeriodMonths} Monate
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground">
                    Automatische Verlaengerung
                  </p>
                  <p className="font-medium">
                    {formData.autoRenewal
                      ? `Ja${
                          formData.renewalPeriodMonths
                            ? ` (${formData.renewalPeriodMonths} Monate)`
                            : ""
                        }`
                      : "Nein"}
                  </p>
                </div>

                {formData.annualValue !== null &&
                  formData.annualValue !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Jaehrlicher Wert
                      </p>
                      <p className="font-medium">
                        {formData.annualValue.toLocaleString("de-DE", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </p>
                    </div>
                  )}

                {formData.paymentTerms && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Zahlungsbedingungen
                    </p>
                    <p className="text-sm">{formData.paymentTerms}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Assignments */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Zuordnungen
              </h3>
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Windpark</p>
                    <p className="font-medium">
                      {selectedPark ? selectedPark.name : "Keiner"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Gesellschaft
                    </p>
                    <p className="font-medium">
                      {selectedFund ? selectedFund.name : "Keine"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Vertragspartner
                    </p>
                    <p className="font-medium">
                      {selectedPartner
                        ? getPersonLabel(selectedPartner)
                        : "Keiner"}
                    </p>
                  </div>
                </div>

                {/* Partner details in review */}
                {selectedPartner && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      {selectedPartner.email && (
                        <p>E-Mail: {selectedPartner.email}</p>
                      )}
                      {selectedPartner.phone && (
                        <p>Telefon: {selectedPartner.phone}</p>
                      )}
                      {(selectedPartner.street || selectedPartner.city) && (
                        <p>
                          {[
                            selectedPartner.street,
                            selectedPartner.postalCode,
                            selectedPartner.city,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Reminders */}
            {formData.reminderDays.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Erinnerungen
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {formData.reminderDays.map((days) => (
                      <Badge key={days} variant="outline">
                        {days} Tage vor Vertragsende
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // Render step content
  // ==========================================
  function renderStepContent() {
    switch (currentStep) {
      case 0:
        return renderTypeStep();
      case 1:
        return renderDurationStep();
      case 2:
        return renderAssignmentsStep();
      case 3:
        return renderReviewStep();
      default:
        return null;
    }
  }

  // ==========================================
  // Loading state
  // ==========================================
  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // ==========================================
  // Main render
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/contracts">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Zurueck zur Vertragsuebersicht</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Neuer Vertrag
          </h1>
          <p className="text-muted-foreground">
            Erstellen Sie einen neuen Vertrag in{" "}
            {STEPS.length - 1} Schritten
          </p>
        </div>
      </div>

      {/* Stepper */}
      <Stepper
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={(step) => {
          // Only allow navigating back to completed steps
          if (step < currentStep) {
            setCurrentStep(step);
          }
        }}
      />

      {/* Step Content */}
      <StepContent>{renderStepContent()}</StepContent>

      {/* Step Actions */}
      <StepActions>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentStep((prev) => prev - 1)}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurueck
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
            {loading ? "Wird erstellt..." : "Vertrag erstellen"}
          </Button>
        )}
      </StepActions>
    </div>
  );
}
