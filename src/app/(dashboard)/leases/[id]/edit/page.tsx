"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Save,
  CalendarIcon,
  User,
  Building2,
  MapPin,
  X,
  Plus,
  Check,
  Wind,
  Trash2,
  Loader2,
  AlertTriangle,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PersonEditDialog, type PersonData } from "@/components/leases/PersonEditDialog";

// Types
interface PlotArea {
  id: string;
  areaType: string;
  areaSqm: number | null;
  lengthM: number | null;
  compensationType: string;
  compensationFixedAmount: number | null;
  compensationPercentage: number | null;
  notes: string | null;
}

interface Plot {
  id: string;
  cadastralDistrict: string | null;
  fieldNumber: string | null;
  plotNumber: string | null;
  areaSqm: number | null;
  parkId?: string | null;
  park: {
    id: string;
    name: string;
    shortName: string | null;
  } | null;
  plotAreas?: PlotArea[];
  // Lease info (from ?includeLeases=true)
  leaseCount?: number;
  activeLease?: {
    leaseId: string;
    status: string;
    lessorName: string | null;
  } | null;
}

interface Turbine {
  id: string;
  designation: string;
  parkId: string;
}

interface Park {
  id: string;
  name: string;
  shortName: string | null;
}

interface Fund {
  id: string;
  name: string;
  legalForm: string | null;
}

interface Lease {
  id: string;
  signedDate: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  hasExtensionOption: boolean;
  extensionDetails: string | null;
  hasWaitingMoney: boolean;
  waitingMoneyAmount: number | null;
  waitingMoneyUnit: string | null;
  waitingMoneySchedule: string | null;
  billingInterval: string | null;
  linkedTurbineId: string | null;
  contractPartnerFundId: string | null;
  contractPartnerFund: Fund | null;
  paymentDay: number | null;
  notes: string | null;
  plots: Plot[];
  lessor: {
    id: string;
    personType: string;
    salutation: string | null;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
    bankIban: string | null;
    bankBic: string | null;
    bankName: string | null;
  };
}

// PlotArea type labels
const AREA_TYPE_LABELS: Record<string, string> = {
  WEA_STANDORT: "WEA-Standort",
  POOL: "Poolfläche",
  WEG: "Zuwegung",
  KABEL: "Kabeltrasse",
  AUSGLEICH: "Ausgleichsfläche",
};

const AREA_TYPE_OPTIONS = [
  { id: "WEA_STANDORT", label: "WEA-Standort", unit: "m²" },
  { id: "POOL", label: "Poolfläche", unit: "m²" },
  { id: "WEG", label: "Zuwegung", unit: "m²" },
  { id: "KABEL", label: "Kabeltrasse", unit: "lfm" },
  { id: "AUSGLEICH", label: "Ausgleichsfläche", unit: "m²" },
];

export default function EditLeasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingLease, setLoadingLease] = useState(true);
  const [lease, setLease] = useState<Lease | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    signedDate: undefined as Date | undefined,
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    status: "ACTIVE" as string,
    hasExtensionOption: false,
    extensionDetails: "",
    hasWaitingMoney: false,
    waitingMoneyAmount: "",
    waitingMoneyUnit: "pauschal" as "pauschal" | "ha",
    waitingMoneySchedule: "yearly" as "monthly" | "yearly" | "once",
    billingInterval: "ANNUAL" as "MONTHLY" | "QUARTERLY" | "ANNUAL",
    linkedTurbineId: "" as string,
    paymentDay: "" as string,
    contractPartnerFundId: "" as string,
    notes: "",
  });

  // Available plots for adding
  const [availablePlots, setAvailablePlots] = useState<Plot[]>([]);
  const [selectedPlotIds, setSelectedPlotIds] = useState<string[]>([]);
  const [showAddPlots, setShowAddPlots] = useState(false);
  const [turbines, setTurbines] = useState<Turbine[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);

  // Person edit dialog
  const [showPersonEdit, setShowPersonEdit] = useState(false);

  // PlotArea management
  const [addingAreaForPlot, setAddingAreaForPlot] = useState<string | null>(null);
  const [newArea, setNewArea] = useState({ areaType: "WEA_STANDORT", areaSqm: "", lengthM: "" });
  const [savingArea, setSavingArea] = useState(false);

  // New plot creation
  const [showCreatePlot, setShowCreatePlot] = useState(false);
  const [creatingPlot, setCreatingPlot] = useState(false);
  const [newPlot, setNewPlot] = useState({
    cadastralDistrict: "",
    fieldNumber: "",
    plotNumber: "",
    parkId: "",
    areaSqm: "",
  });

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch lease
        const leaseRes = await fetch(`/api/leases/${resolvedParams.id}`);
        if (!leaseRes.ok) {
          if (leaseRes.status === 404) {
            toast.error("Pachtvertrag nicht gefunden");
            router.push("/leases");
            return;
          }
          throw new Error("Fehler beim Laden");
        }
        const leaseData = await leaseRes.json();
        setLease(leaseData);

        // Set form data from lease
        setFormData({
          signedDate: leaseData.signedDate ? new Date(leaseData.signedDate) : undefined,
          startDate: leaseData.startDate ? new Date(leaseData.startDate) : undefined,
          endDate: leaseData.endDate ? new Date(leaseData.endDate) : undefined,
          status: leaseData.status || "ACTIVE",
          hasExtensionOption: leaseData.hasExtensionOption || false,
          extensionDetails: leaseData.extensionDetails || "",
          hasWaitingMoney: leaseData.hasWaitingMoney || false,
          waitingMoneyAmount: leaseData.waitingMoneyAmount ? String(leaseData.waitingMoneyAmount) : "",
          waitingMoneyUnit: (leaseData.waitingMoneyUnit as "pauschal" | "ha") || "pauschal",
          waitingMoneySchedule: (leaseData.waitingMoneySchedule as "monthly" | "yearly" | "once") || "yearly",
          billingInterval: (leaseData.billingInterval as "MONTHLY" | "QUARTERLY" | "ANNUAL") || "ANNUAL",
          linkedTurbineId: leaseData.linkedTurbineId || "",
          paymentDay: leaseData.paymentDay ? String(leaseData.paymentDay) : "",
          contractPartnerFundId: leaseData.contractPartnerFundId || "",
          notes: leaseData.notes || "",
        });

        // Set selected plot IDs
        const leasePlots: Plot[] = leaseData.plots || [];
        setSelectedPlotIds(leasePlots.map((p: Plot) => p.id));

        // Fetch available plots, turbines, and parks
        const [plotsRes, turbinesRes, parksRes, fundsRes] = await Promise.all([
          fetch("/api/plots?limit=500&includeLeases=true"),
          fetch("/api/turbines?limit=500"),
          fetch("/api/parks?limit=100"),
          fetch("/api/funds?limit=100&status=ACTIVE"),
        ]);

        let allPlots: Plot[] = [];
        if (plotsRes.ok) {
          const plotsData = await plotsRes.json();
          allPlots = plotsData.plots || plotsData.data || [];
        }

        // Ensure lease plots are always included in available plots
        const allPlotIds = new Set(allPlots.map((p) => p.id));
        for (const lp of leasePlots) {
          if (!allPlotIds.has(lp.id)) {
            allPlots.push(lp);
          }
        }

        // Load PlotAreas for each lease plot
        const plotsWithAreas = await Promise.all(
          allPlots.map(async (plot) => {
            if (leasePlots.some((lp: Plot) => lp.id === plot.id)) {
              try {
                const areasRes = await fetch(`/api/plots/${plot.id}/areas`);
                if (areasRes.ok) {
                  const areas = await areasRes.json();
                  return { ...plot, plotAreas: areas };
                }
              } catch { /* ignore */ }
            }
            return { ...plot, plotAreas: [] };
          })
        );
        setAvailablePlots(plotsWithAreas);

        if (turbinesRes.ok) {
          const turbinesData = await turbinesRes.json();
          setTurbines(turbinesData.turbines || turbinesData.data || []);
        }
        if (parksRes.ok) {
          const parksData = await parksRes.json();
          setParks(parksData.parks || parksData.data || []);
        }
        if (fundsRes.ok) {
          const fundsData = await fundsRes.json();
          setFunds(fundsData.data || []);
        }
      } catch (error) {
        toast.error("Fehler beim Laden des Pachtvertrags");
      } finally {
        setLoadingLease(false);
      }
    }

    fetchData();
  }, [resolvedParams.id, router]);

  function getPlotLabel(plot: Plot): string {
    const parts = [
      plot.cadastralDistrict,
      plot.fieldNumber && plot.fieldNumber !== "0" ? `Flur ${plot.fieldNumber}` : null,
      `Flurstück ${plot.plotNumber}`,
    ].filter(Boolean);
    return parts.join(", ");
  }

  function getLessorName(): string {
    if (!lease) return "-";
    if (lease.lessor.personType === "legal") {
      return lease.lessor.companyName || "-";
    }
    return [lease.lessor.firstName, lease.lessor.lastName].filter(Boolean).join(" ") || "-";
  }

  async function handleAddPlotArea(plotId: string) {
    setSavingArea(true);
    try {
      const payload: Record<string, unknown> = {
        areaType: newArea.areaType,
        compensationType: "ANNUAL",
      };
      if (newArea.areaType === "KABEL") {
        if (newArea.lengthM) payload.lengthM = parseFloat(newArea.lengthM);
      } else {
        if (newArea.areaSqm) payload.areaSqm = parseFloat(newArea.areaSqm);
      }

      const response = await fetch(`/api/plots/${plotId}/areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen");
      }

      const created = await response.json();
      // Update local state
      setAvailablePlots((prev) =>
        prev.map((p) =>
          p.id === plotId
            ? { ...p, plotAreas: [...(p.plotAreas || []), created] }
            : p
        )
      );
      setAddingAreaForPlot(null);
      setNewArea({ areaType: "WEA_STANDORT", areaSqm: "", lengthM: "" });
      toast.success("Teilfläche hinzugefügt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen");
    } finally {
      setSavingArea(false);
    }
  }

  async function handleDeletePlotArea(plotId: string, areaId: string) {
    try {
      const response = await fetch(`/api/plots/${plotId}/areas/${areaId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Fehler beim Löschen");

      setAvailablePlots((prev) =>
        prev.map((p) =>
          p.id === plotId
            ? { ...p, plotAreas: (p.plotAreas || []).filter((a) => a.id !== areaId) }
            : p
        )
      );
      toast.success("Teilfläche gelöscht");
    } catch {
      toast.error("Fehler beim Löschen der Teilfläche");
    }
  }

  async function handlePlotParkChange(plotId: string, newParkId: string | null) {
    try {
      const res = await fetch(`/api/plots/${plotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkId: newParkId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Fehler" }));
        throw new Error(err.error || "Fehler beim Zuordnen");
      }
      const updated = await res.json();
      setAvailablePlots((prev) =>
        prev.map((p) =>
          p.id === plotId
            ? { ...p, parkId: updated.park?.id || null, park: updated.park || null }
            : p
        )
      );
      toast.success("Park-Zuordnung aktualisiert");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Zuordnen");
    }
  }

  async function handleCreatePlot() {
    if (!newPlot.cadastralDistrict || !newPlot.plotNumber) {
      toast.error("Gemarkung und Flurstücknummer sind erforderlich");
      return;
    }
    setCreatingPlot(true);
    try {
      const payload: Record<string, unknown> = {
        cadastralDistrict: newPlot.cadastralDistrict,
        fieldNumber: newPlot.fieldNumber || "0",
        plotNumber: newPlot.plotNumber,
      };
      if (newPlot.parkId) payload.parkId = newPlot.parkId;
      if (newPlot.areaSqm) payload.areaSqm = parseFloat(newPlot.areaSqm);

      const response = await fetch("/api/plots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen");
      }

      const created = await response.json();

      // Immediately assign to this lease via API
      const assignRes = await fetch(`/api/leases/${resolvedParams.id}/plots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plotIds: [created.id] }),
      });
      if (!assignRes.ok) {
        const err = await assignRes.json();
        throw new Error(err.error || "Flurstück erstellt, aber Zuordnung fehlgeschlagen");
      }

      // Update local state
      setAvailablePlots((prev) => [...prev, { ...created, plotAreas: [] }]);
      setSelectedPlotIds((prev) => [...prev, created.id]);
      setShowCreatePlot(false);
      setNewPlot({ cadastralDistrict: "", fieldNumber: "", plotNumber: "", parkId: "", areaSqm: "" });
      toast.success("Flurstück erstellt und zugeordnet");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen");
    } finally {
      setCreatingPlot(false);
    }
  }

  function setEndDateYears(years: number) {
    if (!formData.startDate) {
      toast.error("Bitte zuerst Vertragsbeginn wählen");
      return;
    }
    const newEndDate = new Date(formData.startDate);
    newEndDate.setFullYear(newEndDate.getFullYear() + years);
    setFormData({ ...formData, endDate: newEndDate });
  }

  function togglePlot(plotId: string) {
    setSelectedPlotIds((prev) =>
      prev.includes(plotId)
        ? prev.filter((id) => id !== plotId)
        : [...prev, plotId]
    );
  }

  async function handleSubmit() {
    if (!formData.startDate) {
      toast.error("Vertragsbeginn ist erforderlich");
      return;
    }

    if (selectedPlotIds.length === 0) {
      toast.error("Mindestens ein Flurstück ist erforderlich");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        plotIds: selectedPlotIds,
        signedDate: formData.signedDate
          ? format(formData.signedDate, "yyyy-MM-dd")
          : null,
        startDate: format(formData.startDate, "yyyy-MM-dd"),
        endDate: formData.endDate
          ? format(formData.endDate, "yyyy-MM-dd")
          : null,
        status: formData.status,
        hasExtensionOption: formData.hasExtensionOption,
        extensionDetails: formData.extensionDetails || null,
        hasWaitingMoney: formData.hasWaitingMoney,
        waitingMoneyAmount: formData.waitingMoneyAmount
          ? parseFloat(formData.waitingMoneyAmount)
          : null,
        waitingMoneyUnit: formData.hasWaitingMoney
          ? formData.waitingMoneyUnit
          : null,
        waitingMoneySchedule: formData.hasWaitingMoney
          ? formData.waitingMoneySchedule
          : null,
        billingInterval: formData.billingInterval,
        linkedTurbineId: formData.linkedTurbineId || null,
        paymentDay: formData.paymentDay ? parseInt(formData.paymentDay, 10) : null,
        contractPartnerFundId: formData.contractPartnerFundId || null,
        notes: formData.notes || null,
      };

      const response = await fetch(`/api/leases/${resolvedParams.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Pachtvertrag erfolgreich aktualisiert");
      router.push(`/leases/${resolvedParams.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Aktualisieren");
    } finally {
      setLoading(false);
    }
  }

  if (loadingLease) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!lease) {
    return null;
  }

  // Get plots that are currently in the lease
  const currentPlots = availablePlots.filter((p) => selectedPlotIds.includes(p.id));
  // Get plots that can be added
  const addablePlots = availablePlots.filter((p) => !selectedPlotIds.includes(p.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/leases/${resolvedParams.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pachtvertrag bearbeiten</h1>
          <p className="text-muted-foreground">
            Verpächter: {getLessorName()}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Flurstücke mit Teilflächen */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Flurstücke & Teilflächen
            </CardTitle>
            <CardDescription>
              Flurstücke zuordnen und Teilflächen (Standort, Pool, Weg, etc.) verwalten
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current plots with areas */}
            {currentPlots.map((plot) => (
              <div key={plot.id} className="border rounded-lg overflow-hidden">
                {/* Plot header */}
                <div className="flex items-center justify-between p-3 bg-muted/30">
                  <div>
                    <p className="font-medium">{getPlotLabel(plot)}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {plot.areaSqm && (
                        <span>{(Number(plot.areaSqm) / 10000).toFixed(2)} ha</span>
                      )}
                      <span>·</span>
                      <Select
                        value={plot.parkId || plot.park?.id || "none"}
                        onValueChange={(v) => handlePlotParkChange(plot.id, v === "none" ? null : v)}
                      >
                        <SelectTrigger className="h-7 w-[180px] text-xs border-dashed">
                          <Wind className="h-3 w-3 mr-1 shrink-0" />
                          <SelectValue placeholder="Kein Park" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Kein Park</SelectItem>
                          {parks.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.shortName || p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingAreaForPlot(addingAreaForPlot === plot.id ? null : plot.id);
                        setNewArea({ areaType: "WEA_STANDORT", areaSqm: "", lengthM: "" });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Teilfläche
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => togglePlot(plot.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Existing PlotAreas */}
                <div className="p-3 space-y-2">
                  {(plot.plotAreas && plot.plotAreas.length > 0) ? (
                    plot.plotAreas.map((area) => (
                      <div
                        key={area.id}
                        className="flex items-center justify-between p-2 rounded border bg-background"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">
                            {AREA_TYPE_LABELS[area.areaType] || area.areaType}
                          </Badge>
                          {area.areaType === "KABEL" ? (
                            area.lengthM && <span className="text-sm">{Number(area.lengthM).toLocaleString("de-DE")} lfm</span>
                          ) : (
                            area.areaSqm && <span className="text-sm">{Number(area.areaSqm).toLocaleString("de-DE")} m²</span>
                          )}
                          {area.compensationFixedAmount && (
                            <span className="text-sm text-muted-foreground">
                              ({Number(area.compensationFixedAmount).toLocaleString("de-DE", { style: "currency", currency: "EUR" })})
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeletePlotArea(plot.id, area.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Keine Teilflächen — bitte hinzufügen
                    </p>
                  )}

                  {/* Add area form */}
                  {addingAreaForPlot === plot.id && (
                    <div className="p-3 mt-2 border rounded-lg bg-muted/20 space-y-3">
                      <p className="text-sm font-medium">Neue Teilfläche</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Typ</Label>
                          <Select
                            value={newArea.areaType}
                            onValueChange={(v) => setNewArea({ ...newArea, areaType: v, areaSqm: "", lengthM: "" })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AREA_TYPE_OPTIONS.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {newArea.areaType === "KABEL" ? "Länge (lfm)" : "Fläche (m²)"}
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-9"
                            placeholder="0"
                            value={newArea.areaType === "KABEL" ? newArea.lengthM : newArea.areaSqm}
                            onChange={(e) =>
                              newArea.areaType === "KABEL"
                                ? setNewArea({ ...newArea, lengthM: e.target.value })
                                : setNewArea({ ...newArea, areaSqm: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <Button
                            size="sm"
                            className="h-9"
                            onClick={() => handleAddPlotArea(plot.id)}
                            disabled={savingArea}
                          >
                            {savingArea ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-1" />
                            )}
                            Speichern
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9"
                            onClick={() => setAddingAreaForPlot(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {currentPlots.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine Flurstücke zugeordnet</p>
            )}

            {/* Add plots */}
            {showAddPlots ? (
              <div className="space-y-2 border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Bestehendes Flurstück zuordnen</Label>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddPlots(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {addablePlots.map((plot) => {
                    const hasOtherLease = plot.activeLease && plot.activeLease.leaseId !== resolvedParams.id;
                    return (
                      <div
                        key={plot.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded border cursor-pointer",
                          hasOtherLease
                            ? "hover:bg-amber-50 border-amber-200 dark:hover:bg-amber-950/20 dark:border-amber-800"
                            : "hover:bg-muted/50"
                        )}
                        onClick={() => togglePlot(plot.id)}
                      >
                        <div>
                          <p className="text-sm font-medium">{getPlotLabel(plot)}</p>
                          <div className="flex items-center gap-2">
                            {plot.park && (
                              <p className="text-xs text-muted-foreground">
                                {plot.park.shortName || plot.park.name}
                              </p>
                            )}
                            {hasOtherLease && (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                Bereits in Vertrag ({plot.activeLease!.lessorName || "unbekannt"})
                              </span>
                            )}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    );
                  })}
                  {addablePlots.length === 0 && (
                    <p className="text-sm text-muted-foreground">Keine weiteren Flurstücke verfügbar</p>
                  )}
                </div>
              </div>
            ) : showCreatePlot ? (
              <div className="space-y-3 border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Neues Flurstück erstellen</Label>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreatePlot(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Gemarkung *</Label>
                    <Input
                      className="h-9"
                      placeholder="z.B. Musterstadt"
                      value={newPlot.cadastralDistrict}
                      onChange={(e) => setNewPlot({ ...newPlot, cadastralDistrict: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Flur</Label>
                    <Input
                      className="h-9"
                      placeholder="z.B. 3"
                      value={newPlot.fieldNumber}
                      onChange={(e) => setNewPlot({ ...newPlot, fieldNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Flurstück-Nr. *</Label>
                    <Input
                      className="h-9"
                      placeholder="z.B. 123/4"
                      value={newPlot.plotNumber}
                      onChange={(e) => setNewPlot({ ...newPlot, plotNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Windpark</Label>
                    <Select
                      value={newPlot.parkId || "none"}
                      onValueChange={(v) => setNewPlot({ ...newPlot, parkId: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Kein Park" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kein Park</SelectItem>
                        {parks.map((park) => (
                          <SelectItem key={park.id} value={park.id}>
                            {park.shortName || park.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fläche (m²)</Label>
                    <Input
                      type="number"
                      className="h-9"
                      placeholder="0"
                      value={newPlot.areaSqm}
                      onChange={(e) => setNewPlot({ ...newPlot, areaSqm: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreatePlot}
                    disabled={creatingPlot}
                  >
                    {creatingPlot ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Erstellen & zuordnen
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreatePlot(false)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddPlots(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Bestehendes zuordnen
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowCreatePlot(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Neues Flurstück erstellen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verpächter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lease.lessor.personType === "legal" ? (
                <Building2 className="h-5 w-5" />
              ) : (
                <User className="h-5 w-5" />
              )}
              Verpächter
            </CardTitle>
            <CardDescription>
              Klicken um Name, Adresse oder Bankdaten zu bearbeiten
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              className="w-full text-left p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors cursor-pointer"
              onClick={() => setShowPersonEdit(true)}
            >
              <p className="font-medium text-primary underline-offset-4 hover:underline">
                {getLessorName()}
              </p>
              <p className="text-sm text-muted-foreground">
                {lease.lessor.personType === "legal" ? "Juristische Person" : "Natürliche Person"}
              </p>
              {(lease.lessor.street || lease.lessor.city) && (
                <p className="text-sm text-muted-foreground mt-1">
                  {[lease.lessor.street, lease.lessor.houseNumber].filter(Boolean).join(" ")}
                  {lease.lessor.street && lease.lessor.city ? ", " : ""}
                  {[lease.lessor.postalCode, lease.lessor.city].filter(Boolean).join(" ")}
                </p>
              )}
            </button>
          </CardContent>
        </Card>

        {/* Vertragspartner (Pächter-Gesellschaft) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Vertragspartner
            </CardTitle>
            <CardDescription>
              Gesellschaft auf Pächter-Seite
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={formData.contractPartnerFundId || "none"}
              onValueChange={(v) =>
                setFormData({ ...formData, contractPartnerFundId: v === "none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Keine Gesellschaft zugeordnet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Gesellschaft</SelectItem>
                {funds.map((fund) => (
                  <SelectItem key={fund.id} value={fund.id}>
                    {fund.name}{fund.legalForm ? ` ${fund.legalForm}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.contractPartnerFundId && (() => {
              const selected = funds.find((f) => f.id === formData.contractPartnerFundId);
              return selected ? (
                <div className="mt-3 p-3 bg-muted rounded-lg">
                  <p className="font-medium">
                    {selected.name}{selected.legalForm ? ` ${selected.legalForm}` : ""}
                  </p>
                  <Link
                    href={`/funds/${selected.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Gesellschaft öffnen →
                  </Link>
                </div>
              ) : null;
            })()}
          </CardContent>
        </Card>

        {/* Person edit dialog */}
        <PersonEditDialog
          open={showPersonEdit}
          onOpenChange={setShowPersonEdit}
          person={lease.lessor}
          onSaved={(updated) => {
            setLease({
              ...lease,
              lessor: { ...lease.lessor, ...updated },
            });
          }}
        />

        {/* Vertragslaufzeit */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vertragslaufzeit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Vertragsabschluss */}
            <div className="space-y-2">
              <Label>Vertragsabschluss (Datum der Unterschrift)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full md:w-[300px] justify-start text-left font-normal",
                      !formData.signedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.signedDate
                      ? format(formData.signedDate, "dd.MM.yyyy", { locale: de })
                      : "Noch nicht unterschrieben"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.signedDate}
                    onSelect={(date) => setFormData({ ...formData, signedDate: date })}
                    locale={de}
                    captionLayout="dropdown"
                    startMonth={new Date(2015, 0)}
                    endMonth={new Date(2040, 11)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Vertragsbeginn */}
              <div className="space-y-2">
                <Label>Vertragsbeginn (Baubeginn) *</Label>
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
                        ? format(formData.startDate, "dd.MM.yyyy", { locale: de })
                        : "Datum wählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.startDate}
                      onSelect={(date) => setFormData({ ...formData, startDate: date })}
                      locale={de}
                      captionLayout="dropdown"
                      startMonth={new Date(2015, 0)}
                      endMonth={new Date(2040, 11)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Vertragsende */}
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
                        ? format(formData.endDate, "dd.MM.yyyy", { locale: de })
                        : "Unbefristet"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.endDate}
                      onSelect={(date) => setFormData({ ...formData, endDate: date })}
                      locale={de}
                      captionLayout="dropdown"
                      startMonth={new Date(2020, 0)}
                      endMonth={new Date(2070, 11)}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEndDateYears(20)}>
                    +20 Jahre
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEndDateYears(25)}>
                    +25 Jahre
                  </Button>
                  {formData.endDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData({ ...formData, endDate: undefined })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Entwurf</SelectItem>
                    <SelectItem value="ACTIVE">Aktiv</SelectItem>
                    <SelectItem value="EXPIRING">Läuft aus</SelectItem>
                    <SelectItem value="EXPIRED">Abgelaufen</SelectItem>
                    <SelectItem value="TERMINATED">Gekündigt</SelectItem>
                  </SelectContent>
                </Select>
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
                  checked={formData.hasExtensionOption}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, hasExtensionOption: checked })
                  }
                />
              </div>
              {formData.hasExtensionOption && (
                <div className="space-y-2">
                  <Label>Details zur Verlängerung</Label>
                  <Textarea
                    value={formData.extensionDetails}
                    onChange={(e) =>
                      setFormData({ ...formData, extensionDetails: e.target.value })
                    }
                    placeholder="z.B. Automatische Verlängerung um 5 Jahre..."
                    rows={2}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Wartegeld */}
        <Card>
          <CardHeader>
            <CardTitle>Wartegeld</CardTitle>
            <CardDescription>
              Zahlung an Flächeneigentümer vor/während des Baus
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Wartegeld vereinbart</Label>
              <Switch
                checked={formData.hasWaitingMoney}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, hasWaitingMoney: checked })
                }
              />
            </div>
            {formData.hasWaitingMoney && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Betrag (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.waitingMoneyAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, waitingMoneyAmount: e.target.value })
                    }
                    placeholder="z.B. 500.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Einheit</Label>
                  <Select
                    value={formData.waitingMoneyUnit}
                    onValueChange={(v) =>
                      setFormData({ ...formData, waitingMoneyUnit: v as "pauschal" | "ha" })
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
                    value={formData.waitingMoneySchedule}
                    onValueChange={(v) =>
                      setFormData({ ...formData, waitingMoneySchedule: v as "monthly" | "yearly" | "once" })
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
          </CardContent>
        </Card>

        {/* Abrechnungsintervall */}
        <Card>
          <CardHeader>
            <CardTitle>Abrechnungsintervall</CardTitle>
            <CardDescription>
              Bestimmt wie oft Mindestpacht-Vorschuesse erstellt werden
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Intervall</Label>
              <Select
                value={formData.billingInterval}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
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
                value={formData.linkedTurbineId || "none"}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
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
                      const plot = availablePlots.find((p) => p.id === plotId);
                      if (plot?.park?.id) selectedParkIds.add(plot.park.id);
                      if (plot?.parkId) selectedParkIds.add(plot.parkId);
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
            <div className="space-y-2">
              <Label>Gutschrift-Stichtag (Tag im Monat)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                placeholder="Park-Standard verwenden"
                value={formData.paymentDay}
                onChange={(e) =>
                  setFormData({ ...formData, paymentDay: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Leer lassen = Standard-Stichtag des Parks verwenden
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notizen */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Zusätzliche Vertragsinformationen..."
              rows={4}
            />
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" asChild>
          <Link href={`/leases/${resolvedParams.id}`}>Abbrechen</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          <Save className="mr-2 h-4 w-4" />
          {loading ? "Wird gespeichert..." : "Änderungen speichern"}
        </Button>
      </div>
    </div>
  );
}
