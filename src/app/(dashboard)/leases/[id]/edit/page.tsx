"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useTranslations, useLocale } from "next-intl";
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
import { PersonEditDialog } from "@/components/leases/PersonEditDialog";

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

export default function EditLeasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const t = useTranslations("leases.edit");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const intlLocale = locale === "en" ? "en-US" : "de-DE";

  // PlotArea type labels (localized)
  const AREA_TYPE_LABELS: Record<string, string> = {
    WEA_STANDORT: t("areaTypes.WEA_STANDORT"),
    POOL: t("areaTypes.POOL"),
    WEG: t("areaTypes.WEG"),
    KABEL: t("areaTypes.KABEL"),
    AUSGLEICH: t("areaTypes.AUSGLEICH"),
  };

  const AREA_TYPE_OPTIONS = [
    { id: "WEA_STANDORT", label: t("areaTypes.WEA_STANDORT"), unit: "m²" },
    { id: "POOL", label: t("areaTypes.POOL"), unit: "m²" },
    { id: "WEG", label: t("areaTypes.WEG"), unit: "m²" },
    { id: "KABEL", label: t("areaTypes.KABEL"), unit: "lfm" },
    { id: "AUSGLEICH", label: t("areaTypes.AUSGLEICH"), unit: "m²" },
  ];
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
            toast.error(t("notFoundError"));
            router.push("/leases");
            return;
          }
          throw new Error(t("loadError"));
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
          allPlots = plotsData.data || [];
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
      } catch {
        toast.error(t("loadErrorDetail"));
      } finally {
        setLoadingLease(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.id, router]);

  function getPlotLabel(plot: Plot): string {
    const parts = [
      plot.cadastralDistrict,
      plot.fieldNumber && plot.fieldNumber !== "0"
        ? t("plotLabelField", { n: plot.fieldNumber })
        : null,
      t("plotLabelPlot", { n: plot.plotNumber || "" }),
    ].filter(Boolean);
    return parts.join(", ");
  }

  function getLessorName(): string {
    if (!lease) return t("unknownValue");
    if (lease.lessor.personType === "legal") {
      return lease.lessor.companyName || t("unknownValue");
    }
    return (
      [lease.lessor.firstName, lease.lessor.lastName]
        .filter(Boolean)
        .join(" ") || t("unknownValue")
    );
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
        throw new Error(error.error || t("areaCreateError"));
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
      toast.success(t("areaCreateSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("areaCreateError")
      );
    } finally {
      setSavingArea(false);
    }
  }

  async function handleDeletePlotArea(plotId: string, areaId: string) {
    try {
      const response = await fetch(`/api/plots/${plotId}/areas/${areaId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(t("areaDeleteError"));

      setAvailablePlots((prev) =>
        prev.map((p) =>
          p.id === plotId
            ? { ...p, plotAreas: (p.plotAreas || []).filter((a) => a.id !== areaId) }
            : p
        )
      );
      toast.success(t("areaDeleteSuccess"));
    } catch {
      toast.error(t("areaDeleteError"));
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
        const err = await res.json().catch(() => ({ error: t("parkAssignError") }));
        throw new Error(err.error || t("parkAssignError"));
      }
      const updated = await res.json();
      setAvailablePlots((prev) =>
        prev.map((p) =>
          p.id === plotId
            ? { ...p, parkId: updated.park?.id || null, park: updated.park || null }
            : p
        )
      );
      toast.success(t("parkAssignSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("parkAssignError")
      );
    }
  }

  async function handleCreatePlot() {
    if (!newPlot.cadastralDistrict || !newPlot.plotNumber) {
      toast.error(t("plotValidationError"));
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
        throw new Error(error.error || t("plotCreateError"));
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
        throw new Error(err.error || t("plotAssignError"));
      }

      // Update local state
      setAvailablePlots((prev) => [...prev, { ...created, plotAreas: [] }]);
      setSelectedPlotIds((prev) => [...prev, created.id]);
      setShowCreatePlot(false);
      setNewPlot({ cadastralDistrict: "", fieldNumber: "", plotNumber: "", parkId: "", areaSqm: "" });
      toast.success(t("plotCreateSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("plotCreateError")
      );
    } finally {
      setCreatingPlot(false);
    }
  }

  function setEndDateYears(years: number) {
    if (!formData.startDate) {
      toast.error(t("startDateFirst"));
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
      toast.error(t("startDateRequired"));
      return;
    }

    if (selectedPlotIds.length === 0) {
      toast.error(t("plotsRequired"));
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
        throw new Error(error.error || t("saveErrorGeneric"));
      }

      toast.success(t("saveSuccess"));
      router.push(`/leases/${resolvedParams.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("saveError")
      );
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
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("lessorLabel", { name: getLessorName() })}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Flurstücke mit Teilflächen */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t("plotsCardTitle")}
            </CardTitle>
            <CardDescription>{t("plotsCardDescription")}</CardDescription>
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
                          <SelectValue placeholder={t("plotNoParkPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("plotNoPark")}</SelectItem>
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
                      {t("areaAdd")}
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
                            area.lengthM && <span className="text-sm">{Number(area.lengthM).toLocaleString(intlLocale)} lfm</span>
                          ) : (
                            area.areaSqm && <span className="text-sm">{Number(area.areaSqm).toLocaleString(intlLocale)} m²</span>
                          )}
                          {area.compensationFixedAmount && (
                            <span className="text-sm text-muted-foreground">
                              ({Number(area.compensationFixedAmount).toLocaleString(intlLocale, { style: "currency", currency: "EUR" })})
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
                      {t("areaNoAreas")}
                    </p>
                  )}

                  {/* Add area form */}
                  {addingAreaForPlot === plot.id && (
                    <div className="p-3 mt-2 border rounded-lg bg-muted/20 space-y-3">
                      <p className="text-sm font-medium">{t("areaNewTitle")}</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("areaTypeLabel")}</Label>
                          <Select
                            value={newArea.areaType}
                            onValueChange={(v) => setNewArea({ ...newArea, areaType: v, areaSqm: "", lengthM: "" })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AREA_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {newArea.areaType === "KABEL" ? t("areaLengthLabel") : t("areaSqmLabel")}
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
                            {t("areaSaveBtn")}
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
              <p className="text-sm text-muted-foreground">{t("noPlotsAssigned")}</p>
            )}

            {/* Add plots */}
            {showAddPlots ? (
              <div className="space-y-2 border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{t("addPlotExisting")}</Label>
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
                                {t("alreadyInLease", {
                                  name:
                                    plot.activeLease!.lessorName ||
                                    t("alreadyInLeaseUnknown"),
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    );
                  })}
                  {addablePlots.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("noMorePlots")}</p>
                  )}
                </div>
              </div>
            ) : showCreatePlot ? (
              <div className="space-y-3 border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{t("createNewPlot")}</Label>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreatePlot(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("cadastralDistrictLabel")}</Label>
                    <Input
                      className="h-9"
                      placeholder={t("cadastralDistrictPlaceholder")}
                      value={newPlot.cadastralDistrict}
                      onChange={(e) => setNewPlot({ ...newPlot, cadastralDistrict: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("fieldNumberLabel")}</Label>
                    <Input
                      className="h-9"
                      placeholder={t("fieldNumberPlaceholder")}
                      value={newPlot.fieldNumber}
                      onChange={(e) => setNewPlot({ ...newPlot, fieldNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("plotNumberLabel")}</Label>
                    <Input
                      className="h-9"
                      placeholder={t("plotNumberPlaceholder")}
                      value={newPlot.plotNumber}
                      onChange={(e) => setNewPlot({ ...newPlot, plotNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("parkLabel")}</Label>
                    <Select
                      value={newPlot.parkId || "none"}
                      onValueChange={(v) => setNewPlot({ ...newPlot, parkId: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={t("plotNoParkPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("plotNoPark")}</SelectItem>
                        {parks.map((park) => (
                          <SelectItem key={park.id} value={park.id}>
                            {park.shortName || park.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("areaPlotLabel")}</Label>
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
                    {t("createAndAssign")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreatePlot(false)}>
                    {t("cancelBtn")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddPlots(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addExistingPlot")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowCreatePlot(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("createNewPlot")}
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
              {t("lessorCardTitle")}
            </CardTitle>
            <CardDescription>{t("lessorCardDescription")}</CardDescription>
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
                {lease.lessor.personType === "legal" ? t("legalPerson") : t("naturalPerson")}
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
              {t("contractPartnerTitle")}
            </CardTitle>
            <CardDescription>{t("contractPartnerDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={formData.contractPartnerFundId || "none"}
              onValueChange={(v) =>
                setFormData({ ...formData, contractPartnerFundId: v === "none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("fundSelectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("fundNoneOption")}</SelectItem>
                {funds.map((fund) => (
                  <SelectItem key={fund.id} value={fund.id}>
                    {fund.name}{fund.legalForm ? ` ${fund.legalForm}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
              <Link href="/funds/new" target="_blank">
                <Plus className="mr-1 h-3 w-3" />
                {t("fundCreateNew")}
              </Link>
            </Button>
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
                    {t("fundOpen")}
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
            <CardTitle>{t("contractTermTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Vertragsabschluss */}
            <div className="space-y-2">
              <Label>{t("signedDateLabel")}</Label>
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
                      ? format(formData.signedDate, "dd.MM.yyyy", { locale: dateLocale })
                      : t("notSignedYet")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.signedDate}
                    onSelect={(date) => setFormData({ ...formData, signedDate: date })}
                    locale={dateLocale}
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
                <Label>{t("startDateLabel")}</Label>
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
                        ? format(formData.startDate, "dd.MM.yyyy", { locale: dateLocale })
                        : t("chooseDate")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.startDate}
                      onSelect={(date) => setFormData({ ...formData, startDate: date })}
                      locale={dateLocale}
                      captionLayout="dropdown"
                      startMonth={new Date(2015, 0)}
                      endMonth={new Date(2040, 11)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Vertragsende */}
              <div className="space-y-2">
                <Label>{t("endDateLabel")}</Label>
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
                        ? format(formData.endDate, "dd.MM.yyyy", { locale: dateLocale })
                        : t("unlimited")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.endDate}
                      onSelect={(date) => setFormData({ ...formData, endDate: date })}
                      locale={dateLocale}
                      captionLayout="dropdown"
                      startMonth={new Date(2020, 0)}
                      endMonth={new Date(2070, 11)}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEndDateYears(20)}>
                    {t("add20Years")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEndDateYears(25)}>
                    {t("add25Years")}
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
                <Label>{t("statusLabel")}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">{t("statusDraft")}</SelectItem>
                    <SelectItem value="ACTIVE">{t("statusActive")}</SelectItem>
                    <SelectItem value="EXPIRING">{t("statusExpiring")}</SelectItem>
                    <SelectItem value="EXPIRED">{t("statusExpired")}</SelectItem>
                    <SelectItem value="TERMINATED">{t("statusTerminated")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Verlängerungsoption */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("extensionOption")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("extensionOptionDescription")}
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
                  <Label>{t("extensionDetails")}</Label>
                  <Textarea
                    value={formData.extensionDetails}
                    onChange={(e) =>
                      setFormData({ ...formData, extensionDetails: e.target.value })
                    }
                    placeholder={t("extensionDetailsPlaceholder")}
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
            <CardTitle>{t("waitingMoneyTitle")}</CardTitle>
            <CardDescription>{t("waitingMoneyDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>{t("waitingMoneyAgreed")}</Label>
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
                  <Label>{t("waitingMoneyAmount")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.waitingMoneyAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, waitingMoneyAmount: e.target.value })
                    }
                    placeholder={t("waitingMoneyAmountPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("waitingMoneyUnitLabel")}</Label>
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
                      <SelectItem value="pauschal">{t("waitingMoneyUnitFlat")}</SelectItem>
                      <SelectItem value="ha">{t("waitingMoneyUnitPerHa")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("waitingMoneyScheduleLabel")}</Label>
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
                      <SelectItem value="once">{t("waitingMoneyScheduleOnce")}</SelectItem>
                      <SelectItem value="monthly">{t("waitingMoneyScheduleMonthly")}</SelectItem>
                      <SelectItem value="yearly">{t("waitingMoneyScheduleYearly")}</SelectItem>
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
            <CardTitle>{t("billingIntervalTitle")}</CardTitle>
            <CardDescription>{t("billingIntervalDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("intervalLabel")}</Label>
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
                  <SelectItem value="ANNUAL">{t("intervalAnnual")}</SelectItem>
                  <SelectItem value="QUARTERLY">{t("intervalQuarterly")}</SelectItem>
                  <SelectItem value="MONTHLY">{t("intervalMonthly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("linkedTurbineLabel")}</Label>
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
                  <SelectValue placeholder={t("noTurbineSelected")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noTurbineSelected")}</SelectItem>
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
                {t("linkedTurbineHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("paymentDayLabel")}</Label>
              <Input
                type="number"
                min={1}
                max={28}
                placeholder={t("paymentDayPlaceholder")}
                value={formData.paymentDay}
                onChange={(e) =>
                  setFormData({ ...formData, paymentDay: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("paymentDayHint")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notizen */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("notesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t("notesPlaceholder")}
              rows={4}
            />
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" asChild>
          <Link href={`/leases/${resolvedParams.id}`}>{t("cancelBtn")}</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          <Save className="mr-2 h-4 w-4" />
          {loading ? t("saving") : t("saveBtn")}
        </Button>
      </div>
    </div>
  );
}
