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
  MapPin,
  Building2,
  Settings2,
  ChevronDown,
  ChevronUp,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Types
interface Fund {
  id: string;
  name: string;
  legalForm: string | null;
  fundCategory: {
    id: string;
    name: string;
    code: string;
    color: string | null;
  } | null;
}

type ParkStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type DistributionMode = "PROPORTIONAL" | "SMOOTHED" | "TOLERATED";
type LeaseSettlementMode = "NETWORK_COMPANY" | "OPERATOR_DIRECT";

// Wizard Steps
const STEPS = [
  { id: "basics", title: "Stammdaten", description: "Name & Grunddaten" },
  { id: "location", title: "Standort & Betreiber", description: "Adresse & Gesellschaften" },
  { id: "billing", title: "Abrechnung", description: "Verteilung & Vergütung" },
];

// Distribution mode display labels
const DISTRIBUTION_MODE_LABELS: Record<DistributionMode, { label: string; description: string }> = {
  PROPORTIONAL: {
    label: "Proportional",
    description: "Direkte Aufteilung nach kWh-Anteil",
  },
  SMOOTHED: {
    label: "Geglättet",
    description: "Ausgleich von Standortunterschieden",
  },
  TOLERATED: {
    label: "Mit Duldung",
    description: "Kleine Abweichungen werden toleriert",
  },
};

// Lease settlement mode labels
const LEASE_SETTLEMENT_MODE_LABELS: Record<LeaseSettlementMode, { label: string; description: string }> = {
  NETWORK_COMPANY: {
    label: "Standard (Netzgesellschaft)",
    description: "Abrechnung über die Netzgesellschaft",
  },
  OPERATOR_DIRECT: {
    label: "Betreiber direkt",
    description: "Direkte Abrechnung durch den Betreiber",
  },
};

export function ParkWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [showCompensation, setShowCompensation] = useState(false);

  // Fund data for dropdowns
  const [funds, setFunds] = useState<Fund[]>([]);

  // Step 1: Stammdaten
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ParkStatus>("ACTIVE");
  const [commissioningDate, setCommissioningDate] = useState<Date | undefined>(undefined);
  const [totalCapacityKw, setTotalCapacityKw] = useState("");

  // Step 2: Standort & Betreiber
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("Deutschland");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [operatorFundId, setOperatorFundId] = useState("");
  const [billingEntityFundId, setBillingEntityFundId] = useState("");
  const [technischeBetriebsführung, setTechnischeBetriebsführung] = useState("");
  const [kaufmaennischeBetriebsführung, setKaufmaennischeBetriebsführung] = useState("");

  // Step 3: Abrechnungs-Konfiguration
  const [defaultDistributionMode, setDefaultDistributionMode] = useState<DistributionMode>("PROPORTIONAL");
  const [defaultTolerancePercent, setDefaultTolerancePercent] = useState("");
  const [minimumRentPerTurbine, setMinimumRentPerTurbine] = useState("");
  const [weaSharePercentage, setWeaSharePercentage] = useState("10");
  const [poolSharePercentage, setPoolSharePercentage] = useState("90");
  const [leaseSettlementMode, setLeaseSettlementMode] = useState<LeaseSettlementMode>("NETWORK_COMPANY");
  const [wegCompensationPerSqm, setWegCompensationPerSqm] = useState("");
  const [ausgleichCompensationPerSqm, setAusgleichCompensationPerSqm] = useState("");
  const [kabelCompensationPerM, setKabelCompensationPerM] = useState("");

  // Load funds for dropdowns
  useEffect(() => {
    async function fetchFunds() {
      try {
        const res = await fetch("/api/funds?limit=500&status=ACTIVE");
        if (res.ok) {
          const data = await res.json();
          setFunds(data.data || []);
        }
      } catch {
        toast.error("Fehler beim Laden der Gesellschaften");
      } finally {
        setLoadingFunds(false);
      }
    }
    fetchFunds();
  }, []);

  // Validation per step
  function canProceed(): boolean {
    switch (currentStep) {
      case 0: // Stammdaten - only name is required
        return name.trim().length > 0;
      case 1: // Standort - all optional
        return true;
      case 2: // Abrechnung - all optional, review included
        return true;
      default:
        return false;
    }
  }

  // Helper: get fund label
  function getFundLabel(fund: Fund): string {
    const parts = [fund.name];
    if (fund.legalForm) parts.push(fund.legalForm);
    return parts.join(" ");
  }

  // Helper: get fund by id
  function getFundById(id: string): Fund | undefined {
    return funds.find((f) => f.id === id);
  }

  // Helper: format number for display
  function formatCurrency(value: string): string {
    const num = parseFloat(value);
    if (isNaN(num)) return "-";
    return num.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  // Helper: format percentage
  function formatPercent(value: string): string {
    const num = parseFloat(value);
    if (isNaN(num)) return "-";
    return `${num.toLocaleString("de-DE")} %`;
  }

  // Compute share sum warning
  const shareSum = (parseFloat(weaSharePercentage) || 0) + (parseFloat(poolSharePercentage) || 0);
  const shareSumWarning = weaSharePercentage && poolSharePercentage && Math.abs(shareSum - 100) > 0.01;

  // Submit handler
  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        shortName: shortName.trim() || null,
        description: description.trim() || null,
        status,
        commissioningDate: commissioningDate
          ? format(commissioningDate, "yyyy-MM-dd")
          : null,
        totalCapacityKw: totalCapacityKw ? parseFloat(totalCapacityKw) : null,

        // Location
        street: street.trim() || null,
        houseNumber: houseNumber.trim() || null,
        city: city.trim() || null,
        postalCode: postalCode.trim() || null,
        country: country.trim() || "Deutschland",
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,

        // Operator
        operatorFundId: operatorFundId || null,
        billingEntityFundId: billingEntityFundId || null,
        technischeBetriebsführung: technischeBetriebsführung.trim() || null,
        kaufmaennischeBetriebsführung: kaufmaennischeBetriebsführung.trim() || null,

        // Billing config
        defaultDistributionMode,
        defaultTolerancePercent: defaultTolerancePercent
          ? parseFloat(defaultTolerancePercent)
          : null,
        minimumRentPerTurbine: minimumRentPerTurbine
          ? parseFloat(minimumRentPerTurbine)
          : null,
        weaSharePercentage: weaSharePercentage
          ? parseFloat(weaSharePercentage)
          : null,
        poolSharePercentage: poolSharePercentage
          ? parseFloat(poolSharePercentage)
          : null,
        leaseSettlementMode,

        // Compensation rates
        wegCompensationPerSqm: wegCompensationPerSqm
          ? parseFloat(wegCompensationPerSqm)
          : null,
        ausgleichCompensationPerSqm: ausgleichCompensationPerSqm
          ? parseFloat(ausgleichCompensationPerSqm)
          : null,
        kabelCompensationPerM: kabelCompensationPerM
          ? parseFloat(kabelCompensationPerM)
          : null,
      };

      const res = await fetch("/api/parks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Fehler beim Erstellen des Parks");
      }

      const park = await res.json();
      toast.success("Windpark erfolgreich erstellt");
      router.push(`/parks/${park.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen"
      );
    } finally {
      setLoading(false);
    }
  }

  // Render step content
  function renderStepContent() {
    switch (currentStep) {
      case 0:
        return renderStammdaten();
      case 1:
        return renderStandort();
      case 2:
        return renderAbrechnung();
      default:
        return null;
    }
  }

  // ==========================================
  // Step 1: Stammdaten
  // ==========================================
  function renderStammdaten() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Stammdaten
            </CardTitle>
            <CardDescription>
              Grundlegende Informationen zum Windpark. Nur der Name ist ein Pflichtfeld.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name + Kurzbezeichnung */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="park-name">Name *</Label>
                <Input
                  id="park-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Windpark Nordsee I"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="park-shortname">Kurzbezeichnung</Label>
                <Input
                  id="park-shortname"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="z.B. WP-NS1"
                />
              </div>
            </div>

            {/* Beschreibung */}
            <div className="space-y-2">
              <Label htmlFor="park-description">Beschreibung</Label>
              <Textarea
                id="park-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Beschreibung des Windparks..."
                rows={3}
              />
            </div>

            {/* Status + Inbetriebnahme + Leistung */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="park-status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as ParkStatus)}
                >
                  <SelectTrigger id="park-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Aktiv</SelectItem>
                    <SelectItem value="INACTIVE">Inaktiv</SelectItem>
                    <SelectItem value="ARCHIVED">Archiviert</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Inbetriebnahme-Datum</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !commissioningDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {commissioningDate
                        ? format(commissioningDate, "dd.MM.yyyy", { locale: de })
                        : "Datum waehlen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={commissioningDate}
                      onSelect={setCommissioningDate}
                      locale={de}
                      captionLayout="dropdown"
                      startMonth={new Date(1990, 0)}
                      endMonth={new Date(2040, 11)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="park-capacity">Gesamtleistung (kW)</Label>
                <Input
                  id="park-capacity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalCapacityKw}
                  onChange={(e) => setTotalCapacityKw(e.target.value)}
                  placeholder="z.B. 30000"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // Step 2: Standort & Betreiber
  // ==========================================
  function renderStandort() {
    return (
      <div className="space-y-6">
        {/* Address Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Standort
            </CardTitle>
            <CardDescription>
              Adresse und Koordinaten des Windparks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-8 space-y-2">
                <Label htmlFor="park-street">Strasse</Label>
                <Input
                  id="park-street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Musterstrasse"
                />
              </div>
              <div className="col-span-4 space-y-2">
                <Label htmlFor="park-houseNumber">Hausnummer</Label>
                <Input
                  id="park-houseNumber"
                  value={houseNumber}
                  onChange={(e) => setHouseNumber(e.target.value)}
                  placeholder="1a"
                />
              </div>
              <div className="col-span-4 space-y-2">
                <Label htmlFor="park-postalCode">PLZ</Label>
                <Input
                  id="park-postalCode"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="z.B. 26831"
                />
              </div>
              <div className="col-span-8 space-y-2">
                <Label htmlFor="park-city">Stadt</Label>
                <Input
                  id="park-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="z.B. Bunde"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="park-country">Land</Label>
              <Input
                id="park-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Deutschland"
              />
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="park-lat">Breitengrad</Label>
                <Input
                  id="park-lat"
                  type="number"
                  step="0.00000001"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="z.B. 53.1800"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="park-lng">Laengengrad</Label>
                <Input
                  id="park-lng"
                  type="number"
                  step="0.00000001"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="z.B. 7.2700"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operator Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Betreiber & Verwaltung
            </CardTitle>
            <CardDescription>
              Gesellschaften und Betriebsführung
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Betreiber-Gesellschaft</Label>
                <Select
                  value={operatorFundId || "none"}
                  onValueChange={(v) => setOperatorFundId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Gesellschaft waehlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine Zuordnung</SelectItem>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        <span className="flex items-center gap-2">
                          {fund.fundCategory?.color && (
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{ backgroundColor: fund.fundCategory.color }}
                            />
                          )}
                          {getFundLabel(fund)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Abrechnungs-Gesellschaft</Label>
                <Select
                  value={billingEntityFundId || "none"}
                  onValueChange={(v) => setBillingEntityFundId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Gesellschaft waehlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keine Zuordnung</SelectItem>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        <span className="flex items-center gap-2">
                          {fund.fundCategory?.color && (
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{ backgroundColor: fund.fundCategory.color }}
                            />
                          )}
                          {getFundLabel(fund)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Netz GbR / Umspannwerk GmbH, die die NB-Gutschrift empfaengt
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="park-tbf">Technische Betriebsführung</Label>
                <Input
                  id="park-tbf"
                  value={technischeBetriebsführung}
                  onChange={(e) => setTechnischeBetriebsführung(e.target.value)}
                  placeholder="z.B. Enercon Service GmbH"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="park-kbf">Kaufmaennische Betriebsführung</Label>
                <Input
                  id="park-kbf"
                  value={kaufmaennischeBetriebsführung}
                  onChange={(e) => setKaufmaennischeBetriebsführung(e.target.value)}
                  placeholder="z.B. WPM Verwaltung GmbH"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // Step 3: Abrechnungs-Konfiguration + Review
  // ==========================================
  function renderAbrechnung() {
    return (
      <div className="space-y-6">
        {/* Distribution Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Verteilungsmodus
            </CardTitle>
            <CardDescription>
              Wie werden Erträge auf die Betreibergesellschaften verteilt?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Verteilungsmodus</Label>
              <Select
                value={defaultDistributionMode}
                onValueChange={(v) => setDefaultDistributionMode(v as DistributionMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DISTRIBUTION_MODE_LABELS) as DistributionMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      <div className="flex flex-col">
                        <span>{DISTRIBUTION_MODE_LABELS[mode].label}</span>
                        <span className="text-xs text-muted-foreground">
                          {DISTRIBUTION_MODE_LABELS[mode].description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tolerance percent for TOLERATED mode */}
            {defaultDistributionMode === "TOLERATED" && (
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <Label htmlFor="park-tolerance">Toleranzgrenze (%)</Label>
                <Input
                  id="park-tolerance"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={defaultTolerancePercent}
                  onChange={(e) => setDefaultTolerancePercent(e.target.value)}
                  placeholder="z.B. 5"
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Abweichungen unterhalb dieser Grenze werden ignoriert (in Prozent)
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lease shares and rent */}
        <Card>
          <CardHeader>
            <CardTitle>Pacht-Konfiguration</CardTitle>
            <CardDescription>
              Anteile und Mindestpacht für die Pachtberechnung
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="park-wea-share">WEA-Anteil (%)</Label>
                <Input
                  id="park-wea-share"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={weaSharePercentage}
                  onChange={(e) => setWeaSharePercentage(e.target.value)}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="park-pool-share">Pool-Anteil (%)</Label>
                <Input
                  id="park-pool-share"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={poolSharePercentage}
                  onChange={(e) => setPoolSharePercentage(e.target.value)}
                  placeholder="90"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="park-min-rent">Mindestpacht pro WEA (EUR)</Label>
                <Input
                  id="park-min-rent"
                  type="number"
                  step="0.01"
                  min="0"
                  value={minimumRentPerTurbine}
                  onChange={(e) => setMinimumRentPerTurbine(e.target.value)}
                  placeholder="z.B. 15000"
                />
              </div>
            </div>

            {/* Share sum hint */}
            <div
              className={cn(
                "flex items-start gap-2 p-3 rounded-lg text-sm",
                shareSumWarning
                  ? "bg-orange-50 border border-orange-200 text-orange-800"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                WEA-Anteil + Pool-Anteil ={" "}
                <span className="font-medium">
                  {isNaN(shareSum) ? "-" : `${shareSum.toLocaleString("de-DE")} %`}
                </span>
                {shareSumWarning
                  ? " -- Die Summe sollte 100% ergeben."
                  : " (sollte zusammen 100% ergeben)"}
              </span>
            </div>

            <Separator />

            {/* Lease settlement mode */}
            <div className="space-y-2">
              <Label>Pacht-Abrechnungsmodus</Label>
              <Select
                value={leaseSettlementMode}
                onValueChange={(v) => setLeaseSettlementMode(v as LeaseSettlementMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LEASE_SETTLEMENT_MODE_LABELS) as LeaseSettlementMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      <div className="flex flex-col">
                        <span>{LEASE_SETTLEMENT_MODE_LABELS[mode].label}</span>
                        <span className="text-xs text-muted-foreground">
                          {LEASE_SETTLEMENT_MODE_LABELS[mode].description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Compensation rates - collapsible */}
        <Collapsible open={showCompensation} onOpenChange={setShowCompensation}>
          <Card>
            <CardHeader className="cursor-pointer" onClick={() => setShowCompensation(!showCompensation)}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between w-full">
                  <div>
                    <CardTitle className="text-base">Vergütungssaetze pro Nutzungsart</CardTitle>
                    <CardDescription>
                      Optionale Vergütungssaetze für Zuwegung, Kabeltrasse und Ausgleichsflaechen
                    </CardDescription>
                  </div>
                  {showCompensation ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="park-weg-comp">Zuwegung (EUR/m2/a)</Label>
                    <Input
                      id="park-weg-comp"
                      type="number"
                      step="0.01"
                      min="0"
                      value={wegCompensationPerSqm}
                      onChange={(e) => setWegCompensationPerSqm(e.target.value)}
                      placeholder="z.B. 0.50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="park-kabel-comp">Kabeltrasse (EUR/m/a)</Label>
                    <Input
                      id="park-kabel-comp"
                      type="number"
                      step="0.01"
                      min="0"
                      value={kabelCompensationPerM}
                      onChange={(e) => setKabelCompensationPerM(e.target.value)}
                      placeholder="z.B. 5.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="park-ausgleich-comp">Ausgleichsflaeche (EUR/m2/a)</Label>
                    <Input
                      id="park-ausgleich-comp"
                      type="number"
                      step="0.01"
                      min="0"
                      value={ausgleichCompensationPerSqm}
                      onChange={(e) => setAusgleichCompensationPerSqm(e.target.value)}
                      placeholder="z.B. 0.10"
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Review Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Zusammenfassung</CardTitle>
            <CardDescription>
              Bitte überprüfen Sie die Angaben vor dem Speichern
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stammdaten */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Stammdaten
              </h3>
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{name || "-"}</span>
                  {shortName && (
                    <Badge variant="secondary">{shortName}</Badge>
                  )}
                </div>
                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>
                    Status:{" "}
                    <Badge
                      variant={
                        status === "ACTIVE"
                          ? "default"
                          : status === "INACTIVE"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {status === "ACTIVE"
                        ? "Aktiv"
                        : status === "INACTIVE"
                          ? "Inaktiv"
                          : "Archiviert"}
                    </Badge>
                  </span>
                  {commissioningDate && (
                    <span>
                      Inbetriebnahme:{" "}
                      {format(commissioningDate, "dd.MM.yyyy", { locale: de })}
                    </span>
                  )}
                  {totalCapacityKw && (
                    <span>
                      Leistung: {parseFloat(totalCapacityKw).toLocaleString("de-DE")} kW
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Standort */}
            {(street || houseNumber || city || postalCode || latitude || longitude) && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Standort
                </h3>
                <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                  {(street || houseNumber || city || postalCode) && (
                    <p>
                      {[[street, houseNumber].filter(Boolean).join(" "), postalCode, city, country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  {(latitude || longitude) && (
                    <p className="text-muted-foreground">
                      Koordinaten: {latitude || "-"}, {longitude || "-"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Betreiber */}
            {(operatorFundId || billingEntityFundId || technischeBetriebsführung || kaufmaennischeBetriebsführung) && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Betreiber & Verwaltung
                </h3>
                <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                  {operatorFundId && (
                    <p>
                      Betreiber:{" "}
                      <span className="font-medium">
                        {getFundById(operatorFundId)
                          ? getFundLabel(getFundById(operatorFundId)!)
                          : "-"}
                      </span>
                    </p>
                  )}
                  {billingEntityFundId && (
                    <p>
                      Abrechnungs-Gesellschaft:{" "}
                      <span className="font-medium">
                        {getFundById(billingEntityFundId)
                          ? getFundLabel(getFundById(billingEntityFundId)!)
                          : "-"}
                      </span>
                    </p>
                  )}
                  {technischeBetriebsführung && (
                    <p>TBF: {technischeBetriebsführung}</p>
                  )}
                  {kaufmaennischeBetriebsführung && (
                    <p>KBF: {kaufmaennischeBetriebsführung}</p>
                  )}
                </div>
              </div>
            )}

            {/* Abrechnung */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Abrechnungs-Konfiguration
              </h3>
              <div className="p-3 bg-muted rounded-lg space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>
                    <span className="text-muted-foreground">Verteilungsmodus:</span>
                  </div>
                  <div className="font-medium">
                    {DISTRIBUTION_MODE_LABELS[defaultDistributionMode].label}
                  </div>

                  {defaultDistributionMode === "TOLERATED" && defaultTolerancePercent && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Toleranzgrenze:</span>
                      </div>
                      <div className="font-medium">
                        {formatPercent(defaultTolerancePercent)}
                      </div>
                    </>
                  )}

                  <div>
                    <span className="text-muted-foreground">WEA-Anteil:</span>
                  </div>
                  <div className="font-medium">
                    {weaSharePercentage ? formatPercent(weaSharePercentage) : "-"}
                  </div>

                  <div>
                    <span className="text-muted-foreground">Pool-Anteil:</span>
                  </div>
                  <div className="font-medium">
                    {poolSharePercentage ? formatPercent(poolSharePercentage) : "-"}
                  </div>

                  {minimumRentPerTurbine && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Mindestpacht/WEA:</span>
                      </div>
                      <div className="font-medium">
                        {formatCurrency(minimumRentPerTurbine)}
                      </div>
                    </>
                  )}

                  <div>
                    <span className="text-muted-foreground">Abrechnungsmodus:</span>
                  </div>
                  <div className="font-medium">
                    {LEASE_SETTLEMENT_MODE_LABELS[leaseSettlementMode].label}
                  </div>
                </div>

                {/* Compensation rates if set */}
                {(wegCompensationPerSqm || kabelCompensationPerM || ausgleichCompensationPerSqm) && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-muted-foreground text-xs font-medium mb-1">
                      Vergütungssaetze
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {wegCompensationPerSqm && (
                        <>
                          <div><span className="text-muted-foreground">Zuwegung:</span></div>
                          <div className="font-medium">{formatCurrency(wegCompensationPerSqm)}/m2/a</div>
                        </>
                      )}
                      {kabelCompensationPerM && (
                        <>
                          <div><span className="text-muted-foreground">Kabeltrasse:</span></div>
                          <div className="font-medium">{formatCurrency(kabelCompensationPerM)}/m/a</div>
                        </>
                      )}
                      {ausgleichCompensationPerSqm && (
                        <>
                          <div><span className="text-muted-foreground">Ausgleichsflaeche:</span></div>
                          <div className="font-medium">{formatCurrency(ausgleichCompensationPerSqm)}/m2/a</div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state for funds
  if (loadingFunds) {
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
          <Link href="/parks">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Zurück zu Parks</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Neuer Windpark</h1>
          <p className="text-muted-foreground">
            Erstellen Sie einen neuen Windpark in 3 Schritten
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
            {loading ? "Wird erstellt..." : "Windpark erstellen"}
          </Button>
        )}
      </StepActions>
    </div>
  );
}
