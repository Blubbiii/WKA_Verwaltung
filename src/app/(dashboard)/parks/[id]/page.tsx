"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Pencil,
  Wind,
  MapPin,
  Calendar,
  Building2,
  Zap,
  FileText,
  ScrollText,
  Plus,
  MoreHorizontal,
  Trash2,
  Euro,
  Percent,
  Settings,
  Save,
  Eye,
  Loader2,
  AlertTriangle,
  GitCompare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ParkMapContainer } from "@/components/maps";
import type { PlotFeature } from "@/components/maps";
import { TurbineDialogs, NetworkTopology } from "@/components/parks";
import { DocumentPreviewDialog } from "@/components/documents";

interface Turbine {
  id: string;
  designation: string;
  serialNumber: string | null;
  mastrNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  deviceType: "WEA" | "PARKRECHNER" | "NVP";
  ratedPowerKw: number | null;
  hubHeightM: number | null;
  rotorDiameterM: number | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  commissioningDate: string | null;
  warrantyEndDate: string | null;
  latitude: number | null;
  longitude: number | null;
  technischeBetriebsfuehrung: string | null;
  kaufmaennischeBetriebsfuehrung: string | null;
  netzgesellschaftFundId: string | null;
  netzgesellschaftFund: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null; childHierarchies?: { ownershipPercentage: number | null; childFundId: string }[] } | null;
  operatorHistory?: {
    id: string;
    operatorFundId: string;
    ownershipPercentage: number | null;
    operatorFund: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null };
  }[];
  // Per-turbine lease overrides
  minimumRent: number | null;
  weaSharePercentage: number | null;
  poolSharePercentage: number | null;
}

interface FundPark {
  fund: {
    id: string;
    name: string;
    legalForm: string | null;
    fundCategory?: { id: string; name: string; code: string; color: string | null } | null;
  };
  ownershipPercentage: number | null;
}

interface ContractDocument {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
}

interface Contract {
  id: string;
  title: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  status: string;
  annualValue: number | null;
  documents: ContractDocument[];
}

interface Document {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  createdAt: string;
}

interface RevenuePhase {
  id: string;
  phaseNumber: number;
  startYear: number;
  endYear: number | null;
  revenueSharePercentage: number;
  description: string | null;
}

interface CostAllocation {
  id: string;
  status: "DRAFT" | "INVOICED" | "CLOSED";
  totalUsageFeeEur: number;
  totalTaxableEur: number;
  totalExemptEur: number;
  periodLabel: string | null;
  createdAt: string;
  leaseRevenueSettlement: {
    id: string;
    year: number;
    status: string;
    park: { id: string; name: string; shortName: string | null };
  };
  _count: { items: number };
}

const allocationStatusColors: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  INVOICED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  CLOSED: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

const allocationStatusLabels: Record<string, string> = {
  DRAFT: "Entwurf",
  INVOICED: "Abgerechnet",
  CLOSED: "Abgeschlossen",
};

type DistributionMode = "PROPORTIONAL" | "SMOOTHED" | "TOLERATED";

interface Park {
  id: string;
  name: string;
  shortName: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  commissioningDate: string | null;
  totalCapacityKw: number | null;
  operatorFundId: string | null;
  operatorFund: {
    id: string;
    name: string;
    legalForm: string | null;
    fundCategory?: { id: string; name: string; code: string; color: string | null } | null;
  } | null;
  technischeBetriebsfuehrung: string | null;
  kaufmaennischeBetriebsfuehrung: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  // Pacht-Konfiguration
  minimumRentPerTurbine: number | null;
  weaSharePercentage: number | null;
  poolSharePercentage: number | null;
  wegCompensationPerSqm: number | null;
  ausgleichCompensationPerSqm: number | null;
  kabelCompensationPerM: number | null;
  // Stromabrechnung-Konfiguration (DULDUNG)
  defaultDistributionMode: DistributionMode;
  defaultTolerancePercent: number | null;
  billingEntityFundId: string | null;
  billingEntityFund: {
    id: string;
    name: string;
    legalForm: string | null;
    fundCategory?: { id: string; name: string; code: string; color: string | null } | null;
  } | null;
  revenuePhases: RevenuePhase[];
  // Relations
  turbines: Turbine[];
  fundParks: FundPark[];
  contracts: Contract[];
  documents: Document[];
  stats: {
    turbineCount: number;
    activeTurbineCount: number;
    calculatedCapacityKw: number;
    documentCount: number;
    contractCount: number;
    plotCount: number;
  };
}

const statusColors = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  INACTIVE:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ARCHIVED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const statusLabels = {
  ACTIVE: "Aktiv",
  INACTIVE: "Inaktiv",
  ARCHIVED: "Archiviert",
};

const contractTypeLabels: Record<string, string> = {
  LEASE: "Pacht",
  SERVICE: "Wartung",
  INSURANCE: "Versicherung",
  GRID_CONNECTION: "Netzanschluss",
  MARKETING: "Direktvermarktung",
  OTHER: "Sonstige",
};

export default function ParkDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [park, setPark] = useState<Park | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plotFeatures, setPlotFeatures] = useState<PlotFeature[]>([]);

  // Pacht-Konfiguration State
  const [leaseConfig, setLeaseConfig] = useState({
    minimumRentPerTurbine: "",
    weaSharePercentage: "",
    poolSharePercentage: "",
    wegCompensationPerSqm: "",
    ausgleichCompensationPerSqm: "",
    kabelCompensationPerM: "",
  });

  // Stromabrechnung-Konfiguration State (DULDUNG)
  const [energyConfig, setEnergyConfig] = useState({
    defaultDistributionMode: "SMOOTHED" as DistributionMode,
    defaultTolerancePercent: "",
    billingEntityFundId: "" as string,
  });
  const [availableFunds, setAvailableFunds] = useState<
    { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null }[]
  >([]);
  const [revenuePhases, setRevenuePhases] = useState<RevenuePhase[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  // Turbine dialog state
  const [isAddTurbineOpen, setIsAddTurbineOpen] = useState(false);
  const [isEditTurbineOpen, setIsEditTurbineOpen] = useState(false);
  const [isTurbineDetailOpen, setIsTurbineDetailOpen] = useState(false);
  const [selectedTurbine, setSelectedTurbine] = useState<Turbine | null>(null);

  // Delete turbine state
  const [deleteTurbineDialogOpen, setDeleteTurbineDialogOpen] = useState(false);
  const [turbineToDelete, setTurbineToDelete] = useState<Turbine | null>(null);
  const [isDeletingTurbine, setIsDeletingTurbine] = useState(false);

  // Fund assignment state
  const [isAddFundOpen, setIsAddFundOpen] = useState(false);
  const [addFundId, setAddFundId] = useState<string>("");
  const [addFundOwnership, setAddFundOwnership] = useState<string>("");
  const [isAddingFund, setIsAddingFund] = useState(false);
  const [removingFundId, setRemovingFundId] = useState<string | null>(null);

  // Document preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<{
    id: string;
    title: string;
    fileName: string;
    fileUrl: string;
    mimeType?: string | null;
  } | null>(null);

  // Plot assignment state
  const [isAssignPlotsOpen, setIsAssignPlotsOpen] = useState(false);
  const [unassignedPlots, setUnassignedPlots] = useState<{
    id: string;
    cadastralDistrict: string;
    fieldNumber: string;
    plotNumber: string;
    areaSqm: number | null;
    activeLease?: { lessorName: string | null } | null;
  }[]>([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<Set<string>>(new Set());
  const [assigningPlots, setAssigningPlots] = useState(false);

  // Lease assignment state
  const [isAssignLeasesOpen, setIsAssignLeasesOpen] = useState(false);
  const [availableLeases, setAvailableLeases] = useState<{
    id: string;
    status: string;
    lessorName: string;
    plotCount: number;
    unassignedCount: number;
    plots: { id: string; cadastralDistrict: string; plotNumber: string; parkId: string | null }[];
  }[]>([]);
  const [loadingLeases, setLoadingLeases] = useState(false);
  const [selectedLeaseIds, setSelectedLeaseIds] = useState<Set<string>>(new Set());
  const [assigningLeases, setAssigningLeases] = useState(false);

  // Cost allocation tab state
  const [activeTab, setActiveTab] = useState("overview");
  const [costAllocations, setCostAllocations] = useState<CostAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [allocationsLoaded, setAllocationsLoaded] = useState(false);

  useEffect(() => {
    fetchPark();
  }, [id]);

  async function fetchPark() {
    try {
      setLoading(true);
      const response = await fetch(`/api/parks/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError("Park nicht gefunden");
        } else {
          throw new Error("Fehler beim Laden");
        }
        return;
      }
      const data = await response.json();
      setPark(data);

      // Set lease configuration state
      setLeaseConfig({
        minimumRentPerTurbine: data.minimumRentPerTurbine?.toString() || "",
        weaSharePercentage: data.weaSharePercentage?.toString() || "",
        poolSharePercentage: data.poolSharePercentage?.toString() || "",
        wegCompensationPerSqm: data.wegCompensationPerSqm?.toString() || "",
        ausgleichCompensationPerSqm: data.ausgleichCompensationPerSqm?.toString() || "",
        kabelCompensationPerM: data.kabelCompensationPerM?.toString() || "",
      });
      setRevenuePhases(data.revenuePhases || []);

      // Set energy configuration state (DULDUNG)
      setEnergyConfig({
        defaultDistributionMode: data.defaultDistributionMode || "SMOOTHED",
        defaultTolerancePercent: data.defaultTolerancePercent?.toString() || "",
        billingEntityFundId: data.billingEntityFundId || "",
      });

      // Load available funds for billing entity selection
      try {
        const fundsRes = await fetch("/api/funds?limit=200");
        if (fundsRes.ok) {
          const fundsData = await fundsRes.json();
          setAvailableFunds(
            (fundsData.data ?? []).map((f: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null }) => ({
              id: f.id,
              name: f.name,
              legalForm: f.legalForm,
              fundCategory: f.fundCategory,
            }))
          );
        }
      } catch {
        // ignore
      }

      // Load plots with geometry for the map overlay
      try {
        const plotsRes = await fetch(`/api/plots?parkId=${id}&includeGeometry=true&limit=1000`);
        if (plotsRes.ok) {
          const plotsData = await plotsRes.json();
          const features: PlotFeature[] = ((plotsData.data ?? plotsData) as Array<{
            id: string;
            plotNumber: string;
            cadastralDistrict: string;
            fieldNumber: string;
            areaSqm: number | string | null;
            geometry: GeoJSON.Geometry | null;
            activeLease?: {
              leaseId: string;
              status: string;
              lessorName: string | null;
              lessor?: {
                id: string;
                firstName?: string | null;
                lastName?: string | null;
                companyName?: string | null;
              };
            } | null;
          }>)
            .map((plot) => {
              const al = plot.activeLease;
              return {
                id: plot.id,
                plotNumber: plot.plotNumber,
                cadastralDistrict: plot.cadastralDistrict,
                fieldNumber: plot.fieldNumber,
                areaSqm: plot.areaSqm ? Number(plot.areaSqm) : null,
                geometry: plot.geometry as GeoJSON.Geometry,
                lessorName: al?.lessorName || null,
                lessorId: al?.lessor?.id || null,
                leaseStatus: al?.status || null,
                leaseId: al?.leaseId || null,
              };
            })
            .filter((p): p is PlotFeature => p.geometry !== null);
          setPlotFeatures(features);
        }
      } catch {
        // Plot loading is non-critical, ignore errors
      }
    } catch {
      setError("Fehler beim Laden des Parks");
    } finally {
      setLoading(false);
    }
  }

  // Lazy-load cost allocations when tab is activated
  useEffect(() => {
    if (activeTab === "cost-allocation" && !allocationsLoaded) {
      fetchCostAllocations();
    }
  }, [activeTab, allocationsLoaded]);

  async function fetchCostAllocations() {
    try {
      setLoadingAllocations(true);
      const res = await fetch(`/api/leases/cost-allocation?parkId=${id}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setCostAllocations(data.data ?? []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingAllocations(false);
      setAllocationsLoaded(true);
    }
  }

  async function saveLeaseConfig() {
    setSavingConfig(true);
    try {
      // Save park configuration (incl. Pacht + Stromabrechnung/DULDUNG)
      const parkResponse = await fetch(`/api/parks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Pacht-Konfiguration
          minimumRentPerTurbine: leaseConfig.minimumRentPerTurbine ? parseFloat(leaseConfig.minimumRentPerTurbine) : null,
          weaSharePercentage: leaseConfig.weaSharePercentage ? parseFloat(leaseConfig.weaSharePercentage) : null,
          poolSharePercentage: leaseConfig.poolSharePercentage ? parseFloat(leaseConfig.poolSharePercentage) : null,
          wegCompensationPerSqm: leaseConfig.wegCompensationPerSqm ? parseFloat(leaseConfig.wegCompensationPerSqm) : null,
          ausgleichCompensationPerSqm: leaseConfig.ausgleichCompensationPerSqm ? parseFloat(leaseConfig.ausgleichCompensationPerSqm) : null,
          kabelCompensationPerM: leaseConfig.kabelCompensationPerM ? parseFloat(leaseConfig.kabelCompensationPerM) : null,
          // Stromabrechnung-Konfiguration (DULDUNG)
          defaultDistributionMode: energyConfig.defaultDistributionMode,
          defaultTolerancePercent: energyConfig.defaultTolerancePercent ? parseFloat(energyConfig.defaultTolerancePercent) : null,
          billingEntityFundId: energyConfig.billingEntityFundId || null,
        }),
      });

      if (!parkResponse.ok) {
        throw new Error("Fehler beim Speichern der Konfiguration");
      }

      // Save revenue phases
      const phasesResponse = await fetch(`/api/parks/${id}/revenue-phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(revenuePhases.map((p, idx) => ({
          phaseNumber: idx + 1,
          startYear: p.startYear,
          endYear: p.endYear,
          revenueSharePercentage: p.revenueSharePercentage,
          description: p.description,
        }))),
      });

      if (!phasesResponse.ok) {
        throw new Error("Fehler beim Speichern der Vergütungsphasen");
      }

      toast.success("Konfiguration gespeichert");
      fetchPark();
    } catch (error) {
      toast.error("Fehler beim Speichern");
    } finally {
      setSavingConfig(false);
    }
  }

  function addRevenuePhase() {
    const lastPhase = revenuePhases[revenuePhases.length - 1];
    const newStartYear = lastPhase ? (lastPhase.endYear || lastPhase.startYear) + 1 : 1;

    setRevenuePhases([
      ...revenuePhases,
      {
        id: `new-${Date.now()}`,
        phaseNumber: revenuePhases.length + 1,
        startYear: newStartYear,
        endYear: newStartYear + 9,
        revenueSharePercentage: 9,
        description: `Jahre ${newStartYear}-${newStartYear + 9}`,
      },
    ]);
  }

  function updateRevenuePhase(index: number, field: keyof RevenuePhase, value: string | number | null) {
    setRevenuePhases(phases =>
      phases.map((p, i) => i === index ? { ...p, [field]: value } : p)
    );
  }

  function removeRevenuePhase(index: number) {
    setRevenuePhases(phases => phases.filter((_, i) => i !== index));
  }

  async function handleDeleteTurbine() {
    if (!turbineToDelete) return;

    try {
      setIsDeletingTurbine(true);
      const response = await fetch(`/api/turbines/${turbineToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Löschen");
      }

      toast.success("Anlage wurde unwiderruflich gelöscht");
      fetchPark();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Löschen");
    } finally {
      setIsDeletingTurbine(false);
      setDeleteTurbineDialogOpen(false);
      setTurbineToDelete(null);
    }
  }

  async function handleAddFund() {
    if (!addFundId) return;
    try {
      setIsAddingFund(true);
      const body: Record<string, unknown> = { parkId: id };
      if (addFundOwnership) {
        body.ownershipPercentage = parseFloat(addFundOwnership);
      }
      const res = await fetch(`/api/funds/${addFundId}/parks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Zuordnen");
      }
      toast.success("Gesellschaft wurde zugeordnet");
      setAddFundId("");
      setAddFundOwnership("");
      setIsAddFundOpen(false);
      fetchPark();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Zuordnen");
    } finally {
      setIsAddingFund(false);
    }
  }

  async function handleRemoveFund(fundId: string) {
    try {
      setRemovingFundId(fundId);
      const res = await fetch(`/api/funds/${fundId}/parks?parkId=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Entfernen");
      }
      toast.success("Zuordnung wurde entfernt");
      fetchPark();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Entfernen");
    } finally {
      setRemovingFundId(null);
    }
  }

  async function openAssignPlotsDialog() {
    setIsAssignPlotsOpen(true);
    setSelectedUnassignedIds(new Set());
    setLoadingUnassigned(true);
    try {
      const res = await fetch("/api/plots?noPark=true&limit=500&includeLeases=true");
      if (res.ok) {
        const data = await res.json();
        setUnassignedPlots(data.data ?? data.plots ?? []);
      }
    } catch {
      toast.error("Fehler beim Laden der Flurstücke");
    } finally {
      setLoadingUnassigned(false);
    }
  }

  function toggleUnassignedPlot(plotId: string) {
    setSelectedUnassignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(plotId)) next.delete(plotId);
      else next.add(plotId);
      return next;
    });
  }

  async function handleAssignSelectedPlots() {
    if (selectedUnassignedIds.size === 0) return;
    setAssigningPlots(true);
    try {
      const results = await Promise.all(
        Array.from(selectedUnassignedIds).map((plotId) =>
          fetch(`/api/plots/${plotId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parkId: id }),
          })
        )
      );
      const failedCount = results.filter((r) => !r.ok).length;
      if (failedCount > 0) {
        toast.error(`${failedCount} Flurstücke konnten nicht zugeordnet werden`);
      } else {
        toast.success(`${selectedUnassignedIds.size} Flurstücke zugeordnet`);
      }
      setIsAssignPlotsOpen(false);
      fetchPark(); // Refresh park data + plot features
    } catch {
      toast.error("Fehler beim Zuordnen");
    } finally {
      setAssigningPlots(false);
    }
  }

  async function handleRemovePlotFromPark(plotId: string) {
    try {
      const res = await fetch(`/api/plots/${plotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkId: null }),
      });
      if (!res.ok) throw new Error("Fehler");
      toast.success("Flurstück vom Park entfernt");
      fetchPark();
    } catch {
      toast.error("Fehler beim Entfernen");
    }
  }

  async function openAssignLeasesDialog() {
    setIsAssignLeasesOpen(true);
    setSelectedLeaseIds(new Set());
    setLoadingLeases(true);
    try {
      const res = await fetch("/api/leases?limit=500");
      if (res.ok) {
        const data = await res.json();
        const leases = (data.data ?? []) as Array<{
          id: string;
          status: string;
          lessor: { firstName?: string | null; lastName?: string | null; companyName?: string | null; personType: string };
          plots: Array<{ id: string; cadastralDistrict: string; plotNumber: string; park: { id: string } | null }>;
        }>;

        // Filter: only leases that have at least one plot NOT assigned to this park
        const filtered = leases
          .map((lease) => {
            const unassigned = lease.plots.filter((p) => !p.park || p.park.id !== id);
            const lessorName = lease.lessor.personType === "legal"
              ? lease.lessor.companyName || "Unbekannt"
              : [lease.lessor.firstName, lease.lessor.lastName].filter(Boolean).join(" ") || "Unbekannt";
            return {
              id: lease.id,
              status: lease.status,
              lessorName,
              plotCount: lease.plots.length,
              unassignedCount: unassigned.length,
              plots: lease.plots.map((p) => ({
                id: p.id,
                cadastralDistrict: p.cadastralDistrict,
                plotNumber: p.plotNumber,
                parkId: p.park?.id || null,
              })),
            };
          })
          .filter((l) => l.unassignedCount > 0);

        setAvailableLeases(filtered);
      }
    } catch {
      toast.error("Fehler beim Laden der Verträge");
    } finally {
      setLoadingLeases(false);
    }
  }

  function toggleLeaseSelection(leaseId: string) {
    setSelectedLeaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(leaseId)) next.delete(leaseId);
      else next.add(leaseId);
      return next;
    });
  }

  async function handleAssignSelectedLeases() {
    if (selectedLeaseIds.size === 0) return;
    setAssigningLeases(true);
    try {
      // Collect all plot IDs from selected leases that are not yet in this park
      const plotIds: string[] = [];
      for (const lease of availableLeases) {
        if (!selectedLeaseIds.has(lease.id)) continue;
        for (const plot of lease.plots) {
          if (plot.parkId !== id) plotIds.push(plot.id);
        }
      }

      const results = await Promise.all(
        plotIds.map((plotId) =>
          fetch(`/api/plots/${plotId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parkId: id }),
          })
        )
      );
      const failedCount = results.filter((r) => !r.ok).length;
      if (failedCount > 0) {
        toast.error(`${failedCount} Flurstücke konnten nicht zugeordnet werden`);
      } else {
        toast.success(`${plotIds.length} Flurstücke aus ${selectedLeaseIds.size} Verträgen zugeordnet`);
      }
      setIsAssignLeasesOpen(false);
      fetchPark();
    } catch {
      toast.error("Fehler beim Zuordnen");
    } finally {
      setAssigningLeases(false);
    }
  }

  function formatCapacity(kw: number): string {
    if (kw >= 1000) {
      return `${(kw / 1000).toFixed(1)} MW`;
    }
    return `${kw.toFixed(0)} kW`;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !park) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg text-muted-foreground">{error}</p>
        <Button asChild className="mt-4">
          <Link href="/parks">Zurück zur Übersicht</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Zurück zur Übersicht">
            <Link href="/parks">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{park.name}</h1>
              <Badge
                variant="secondary"
                className={statusColors[park.status]}
              >
                {statusLabels[park.status]}
              </Badge>
            </div>
            {park.shortName && (
              <p className="text-muted-foreground">{park.shortName}</p>
            )}
          </div>
        </div>
        <Button asChild>
          <Link href={`/parks/${id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Bearbeiten
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Anlagen</CardTitle>
            <Wind className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {park.stats.activeTurbineCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {park.stats.turbineCount} gesamt
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leistung</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {park.stats.calculatedCapacityKw > 0
                ? formatCapacity(park.stats.calculatedCapacityKw)
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground">Installiert</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verträge</CardTitle>
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{park.stats.contractCount}</div>
            <p className="text-xs text-muted-foreground">Aktive Verträge</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dokumente</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{park.stats.documentCount}</div>
            <p className="text-xs text-muted-foreground">Abgelegt</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="funds">
            <Building2 className="mr-1 h-4 w-4" />
            Gesellschaften ({park.fundParks.length})
          </TabsTrigger>
          <TabsTrigger value="turbines">
            Anlagen ({park.stats.turbineCount})
          </TabsTrigger>
          <TabsTrigger value="lease-config">
            <Settings className="mr-1 h-4 w-4" />
            Konfiguration
          </TabsTrigger>
          <TabsTrigger value="cost-allocation">
            <GitCompare className="mr-1 h-4 w-4" />
            Kostenaufteilung
          </TabsTrigger>
          <TabsTrigger value="plots">
            <MapPin className="mr-1 h-4 w-4" />
            Flurstücke ({plotFeatures.length})
          </TabsTrigger>
          <TabsTrigger value="contracts">
            Verträge ({park.stats.contractCount})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Dokumente ({park.stats.documentCount})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6">
            {/* Netz-Topologie */}
            <NetworkTopology
              parkName={park.name}
              turbines={park.turbines}
              billingEntityFund={park.billingEntityFund}
            />

            {/* Map Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Standort
                </CardTitle>
                <CardDescription>
                  Übersichtskarte mit Parkstandort und Anlagen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ParkMapContainer
                  parkName={park.name}
                  parkLatitude={park.latitude}
                  parkLongitude={park.longitude}
                  turbines={park.turbines.map((t) => ({
                    id: t.id,
                    designation: t.designation,
                    latitude: t.latitude,
                    longitude: t.longitude,
                    status: t.status,
                    ratedPowerKw: t.ratedPowerKw,
                  }))}
                  plots={plotFeatures}
                  height="350px"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Funds Tab */}
        <TabsContent value="funds">
          <div className="grid gap-6">
            {/* Key Roles */}
            <Card>
              <CardHeader>
                <CardTitle>Schluesselrollen</CardTitle>
                <CardDescription>
                  Abrechnungsgesellschaft für diesen Park
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Abrechnungsgesellschaft (NB-Gutschrift)</p>
                  {park.billingEntityFund ? (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <Link href={`/funds/${park.billingEntityFund.id}`} className="font-medium text-primary hover:underline">
                        {park.billingEntityFund.name}
                        {park.billingEntityFund.legalForm && <span className="text-muted-foreground ml-1">({park.billingEntityFund.legalForm})</span>}
                      </Link>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Nicht festgelegt - <Link href={`/parks/${id}/edit`} className="text-primary hover:underline">Konfiguration</Link></p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Assigned Funds */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Zugeordnete Gesellschaften</CardTitle>
                  <CardDescription>
                    Alle Gesellschaften, die diesem Windpark zugeordnet sind
                  </CardDescription>
                </div>
                <Button onClick={() => { setAddFundId(""); setAddFundOwnership(""); setIsAddFundOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Gesellschaft zuordnen
                </Button>
              </CardHeader>
              <CardContent>
                {park.fundParks.length === 0 ? (
                  <div className="py-12 text-center">
                    <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">
                      Keine Gesellschaften zugeordnet
                    </p>
                    <Button className="mt-4" onClick={() => { setAddFundId(""); setAddFundOwnership(""); setIsAddFundOpen(true); }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Erste Gesellschaft zuordnen
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Gesellschaft</TableHead>
                        <TableHead>Kategorie</TableHead>
                        <TableHead className="text-right">Anteil (%)</TableHead>
                        <TableHead>Rolle</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {park.fundParks.map((fp) => (
                        <TableRow key={fp.fund.id}>
                          <TableCell>
                            <Link href={`/funds/${fp.fund.id}`} className="font-medium text-primary hover:underline">
                              {fp.fund.name}
                              {fp.fund.legalForm && <span className="text-muted-foreground ml-1">({fp.fund.legalForm})</span>}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {fp.fund.fundCategory ? (
                              <Badge variant="outline" style={fp.fund.fundCategory.color ? { borderColor: fp.fund.fundCategory.color, color: fp.fund.fundCategory.color } : undefined}>
                                {fp.fund.fundCategory.name}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fp.ownershipPercentage != null
                              ? `${Number(fp.ownershipPercentage).toFixed(2)}%`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {park.billingEntityFundId === fp.fund.id && (
                                <Badge variant="secondary" className="text-xs">Abrechnung</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveFund(fp.fund.id)}
                              disabled={removingFundId === fp.fund.id}
                              aria-label="Zuordnung entfernen"
                            >
                              {removingFundId === fp.fund.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Turbines Tab */}
        <TabsContent value="turbines">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Windkraftanlagen</CardTitle>
                <CardDescription>
                  Alle Anlagen in diesem Windpark
                </CardDescription>
              </div>
              <Button onClick={() => setIsAddTurbineOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Neue Anlage
              </Button>
            </CardHeader>
            <CardContent>
              {park.turbines.length === 0 ? (
                <div className="py-12 text-center">
                  <Zap className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    Keine Anlagen vorhanden
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setIsAddTurbineOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Erste Anlage hinzufügen
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bezeichnung</TableHead>
                      <TableHead>Hersteller / Modell</TableHead>
                      <TableHead className="text-right">Leistung</TableHead>
                      <TableHead className="text-right">Nabenhöhe</TableHead>
                      <TableHead>Netzgesellschaft</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {park.turbines.map((turbine) => (
                      <TableRow key={turbine.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {turbine.designation}
                            {turbine.deviceType && turbine.deviceType !== "WEA" && (
                              <Badge variant="outline" className="text-xs font-normal">
                                {turbine.deviceType === "NVP" ? "NVP" : "Parkrechner"}
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {turbine.manufacturer || turbine.model
                            ? `${turbine.manufacturer || ""} ${turbine.model || ""}`.trim()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {turbine.ratedPowerKw
                            ? formatCapacity(turbine.ratedPowerKw)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {turbine.hubHeightM ? `${turbine.hubHeightM} m` : "-"}
                        </TableCell>
                        <TableCell>
                          {turbine.netzgesellschaftFund?.name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={statusColors[turbine.status]}
                          >
                            {statusLabels[turbine.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Aktionen">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedTurbine(turbine);
                                  setIsTurbineDetailOpen(true);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Anzeigen
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedTurbine(turbine);
                                  setIsEditTurbineOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Bearbeiten
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setTurbineToDelete(turbine);
                                  setDeleteTurbineDialogOpen(true);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Löschen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lease Configuration Tab */}
        <TabsContent value="lease-config">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Grundeinstellungen */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Euro className="h-5 w-5" />
                  Pacht-Grundeinstellungen
                </CardTitle>
                <CardDescription>
                  Mindestpacht und Aufteilung zwischen WEA-Standort und Poolfläche
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="minimumRentPerTurbine">Mindestpacht pro WEA (€/Jahr)</Label>
                  <Input
                    id="minimumRentPerTurbine"
                    type="number"
                    step="0.01"
                    placeholder="z.B. 750000"
                    value={leaseConfig.minimumRentPerTurbine}
                    onChange={(e) => setLeaseConfig({ ...leaseConfig, minimumRentPerTurbine: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Gesamte Mindestpacht: {leaseConfig.minimumRentPerTurbine && park.stats.activeTurbineCount
                      ? formatCurrency(parseFloat(leaseConfig.minimumRentPerTurbine) * park.stats.activeTurbineCount)
                      : "-"} ({park.stats.activeTurbineCount} WEAs)
                  </p>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weaSharePercentage">WEA-Standort Anteil (%)</Label>
                    <Input
                      id="weaSharePercentage"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="z.B. 10"
                      value={leaseConfig.weaSharePercentage}
                      onChange={(e) => setLeaseConfig({ ...leaseConfig, weaSharePercentage: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="poolSharePercentage">Poolfläche Anteil (%)</Label>
                    <Input
                      id="poolSharePercentage"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="z.B. 90"
                      value={leaseConfig.poolSharePercentage}
                      onChange={(e) => setLeaseConfig({ ...leaseConfig, poolSharePercentage: e.target.value })}
                    />
                  </div>
                </div>
                {leaseConfig.weaSharePercentage && leaseConfig.poolSharePercentage && (
                  <p className={`text-sm ${parseFloat(leaseConfig.weaSharePercentage) + parseFloat(leaseConfig.poolSharePercentage) === 100 ? "text-green-600" : "text-red-600"}`}>
                    Summe: {(parseFloat(leaseConfig.weaSharePercentage) + parseFloat(leaseConfig.poolSharePercentage)).toFixed(1)}%
                    {parseFloat(leaseConfig.weaSharePercentage) + parseFloat(leaseConfig.poolSharePercentage) !== 100 && " (sollte 100% sein)"}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Entschädigungssätze */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5" />
                  Entschädigungssätze
                </CardTitle>
                <CardDescription>
                  Sätze für Weg-, Ausgleichsflächen und Kabeltrassen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wegCompensationPerSqm">Wegfläche (€/m²)</Label>
                  <Input
                    id="wegCompensationPerSqm"
                    type="number"
                    step="0.01"
                    placeholder="z.B. 2.50"
                    value={leaseConfig.wegCompensationPerSqm}
                    onChange={(e) => setLeaseConfig({ ...leaseConfig, wegCompensationPerSqm: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ausgleichCompensationPerSqm">Ausgleichsfläche (€/m²)</Label>
                  <Input
                    id="ausgleichCompensationPerSqm"
                    type="number"
                    step="0.01"
                    placeholder="z.B. 1.00"
                    value={leaseConfig.ausgleichCompensationPerSqm}
                    onChange={(e) => setLeaseConfig({ ...leaseConfig, ausgleichCompensationPerSqm: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kabelCompensationPerM">Kabeltrasse (€/m)</Label>
                  <Input
                    id="kabelCompensationPerM"
                    type="number"
                    step="0.01"
                    placeholder="z.B. 5.00"
                    value={leaseConfig.kabelCompensationPerM}
                    onChange={(e) => setLeaseConfig({ ...leaseConfig, kabelCompensationPerM: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Stromabrechnung-Konfiguration (DULDUNG) */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Stromabrechnung (DULDUNG)
                </CardTitle>
                <CardDescription>
                  Verteilungsmodus für die Erlösverteilung bei der Stromabrechnung
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label>Verteilungsmodus</Label>
                    <div className="space-y-2">
                      <div
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          energyConfig.defaultDistributionMode === "PROPORTIONAL"
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setEnergyConfig({ ...energyConfig, defaultDistributionMode: "PROPORTIONAL" })}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            energyConfig.defaultDistributionMode === "PROPORTIONAL"
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          }`} />
                          <span className="font-medium">Proportional (DULDUNG aus)</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground ml-6">
                          Erlösverteilung exakt nach Produktionsanteil jeder WKA
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          energyConfig.defaultDistributionMode === "SMOOTHED"
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setEnergyConfig({ ...energyConfig, defaultDistributionMode: "SMOOTHED" })}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            energyConfig.defaultDistributionMode === "SMOOTHED"
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          }`} />
                          <span className="font-medium">Geglättet (DULDUNG ein)</span>
                          <Badge variant="secondary" className="text-xs">Empfohlen</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground ml-6">
                          Produktionsschwankungen werden zwischen WKAs ausgeglichen
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          energyConfig.defaultDistributionMode === "TOLERATED"
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setEnergyConfig({ ...energyConfig, defaultDistributionMode: "TOLERATED" })}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            energyConfig.defaultDistributionMode === "TOLERATED"
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          }`} />
                          <span className="font-medium">Mit Toleranz</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground ml-6">
                          DULDUNG nur bei Abweichung über definierter Toleranzgrenze
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {/* Abrechnungsempfänger */}
                    <div className="space-y-2">
                      <Label>Abrechnungsempfänger (NB-Gutschrift)</Label>
                      <Select
                        value={energyConfig.billingEntityFundId || "__none"}
                        onValueChange={(v) =>
                          setEnergyConfig({
                            ...energyConfig,
                            billingEntityFundId: v === "__none" ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Gesellschaft waehlen..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">-- Nicht festgelegt --</SelectItem>
                          {availableFunds.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                              {f.legalForm ? ` (${f.legalForm})` : ""}
                              {f.fundCategory ? ` - ${f.fundCategory.name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Welche Gesellschaft (Netz GbR / Umspannwerk GmbH) empfaengt die Gutschrift vom Netzbetreiber?
                      </p>
                    </div>

                    {/* Toleranzgrenze */}
                    <div className="space-y-2">
                      <Label htmlFor="defaultTolerancePercent">Toleranzgrenze (%)</Label>
                      <Input
                        id="defaultTolerancePercent"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        placeholder="z.B. 5"
                        value={energyConfig.defaultTolerancePercent}
                        onChange={(e) => setEnergyConfig({ ...energyConfig, defaultTolerancePercent: e.target.value })}
                        disabled={energyConfig.defaultDistributionMode !== "TOLERATED"}
                      />
                      <p className="text-xs text-muted-foreground">
                        {energyConfig.defaultDistributionMode === "TOLERATED"
                          ? "Nur Abweichungen über dieser Grenze werden ausgeglichen"
                          : "Nur relevant bei Modus 'Mit Toleranz'"}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-sm font-medium">DULDUNGS-Formel:</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Ausgleich = (Ist-Produktion - Durchschnitt) x Vergütungssatz
                      </p>
                      <ul className="text-xs text-muted-foreground mt-2 list-disc list-inside space-y-1">
                        <li>Positiv = Abzug (WKA produzierte mehr als Durchschnitt)</li>
                        <li>Negativ = Zuschlag (WKA produzierte weniger)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Vergütungsphasen */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Vergütungsphasen (Umsatzbeteiligung)
                  </CardTitle>
                  <CardDescription>
                    Prozentuale Umsatzbeteiligung nach Betriebsjahren
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addRevenuePhase}>
                  <Plus className="mr-2 h-4 w-4" />
                  Phase hinzufügen
                </Button>
              </CardHeader>
              <CardContent>
                {revenuePhases.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <p>Keine Vergütungsphasen definiert</p>
                    <p className="text-sm">Klicken Sie auf &quot;Phase hinzufügen&quot; um Umsatzbeteiligungen zu konfigurieren</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Phase</TableHead>
                        <TableHead>Beschreibung</TableHead>
                        <TableHead className="w-[120px]">Von Jahr</TableHead>
                        <TableHead className="w-[120px]">Bis Jahr</TableHead>
                        <TableHead className="w-[150px]">Umsatzbeteiligung</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenuePhases.map((phase, index) => (
                        <TableRow key={phase.id}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>
                            <Input
                              value={phase.description || ""}
                              onChange={(e) => updateRevenuePhase(index, "description", e.target.value)}
                              placeholder={`Jahre ${phase.startYear}-${phase.endYear || "..."}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={phase.startYear}
                              onChange={(e) => updateRevenuePhase(index, "startYear", parseInt(e.target.value) || 1)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={phase.endYear || ""}
                              onChange={(e) => updateRevenuePhase(index, "endYear", e.target.value ? parseInt(e.target.value) : null)}
                              placeholder="∞"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={phase.revenueSharePercentage}
                                onChange={(e) => updateRevenuePhase(index, "revenueSharePercentage", parseFloat(e.target.value) || 0)}
                              />
                              <span className="text-muted-foreground">%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRevenuePhase(index)}
                              aria-label="Phase entfernen"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Speichern Button */}
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={saveLeaseConfig} disabled={savingConfig}>
                <Save className="mr-2 h-4 w-4" />
                {savingConfig ? "Wird gespeichert..." : "Konfiguration speichern"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Cost Allocation Tab */}
        <TabsContent value="cost-allocation">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="h-5 w-5" />
                Kostenaufteilung
              </CardTitle>
              <CardDescription>
                Verteilung der Nutzungsentgelte auf Betreibergesellschaften
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAllocations ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : costAllocations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GitCompare className="mx-auto h-10 w-10 mb-3 opacity-50" />
                  <p className="font-medium">Keine Kostenaufteilungen vorhanden</p>
                  <p className="text-sm mt-1">
                    Kostenaufteilungen werden automatisch bei der Abrechnung erstellt.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead>Jahr</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Gesamt</TableHead>
                      <TableHead className="text-right">Steuerpflichtig</TableHead>
                      <TableHead className="text-right">Steuerfrei</TableHead>
                      <TableHead className="text-right">Positionen</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costAllocations.map((alloc) => (
                      <TableRow
                        key={alloc.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/leases/cost-allocation/${alloc.id}`)}
                      >
                        <TableCell className="font-medium">
                          {alloc.periodLabel || "-"}
                        </TableCell>
                        <TableCell>
                          {alloc.leaseRevenueSettlement.year}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={allocationStatusColors[alloc.status] || ""}
                          >
                            {allocationStatusLabels[alloc.status] || alloc.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(alloc.totalUsageFeeEur)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(alloc.totalTaxableEur)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(alloc.totalExemptEur)}
                        </TableCell>
                        <TableCell className="text-right">
                          {alloc._count.items}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/leases/cost-allocation/${alloc.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plots Tab */}
        <TabsContent value="plots">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Flurstücke nach Vertrag</h3>
                <p className="text-sm text-muted-foreground">
                  {plotFeatures.length} Flurstücke in diesem Windpark
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={openAssignLeasesDialog}>
                  <ScrollText className="mr-2 h-4 w-4" />
                  Vertrag zuordnen
                </Button>
                <Button onClick={openAssignPlotsDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Flurstücke zuordnen
                </Button>
              </div>
            </div>

            {plotFeatures.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MapPin className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    Keine Flurstücke zugeordnet
                  </p>
                  <Button className="mt-4" onClick={openAssignPlotsDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Flurstücke zuordnen
                  </Button>
                </CardContent>
              </Card>
            ) : (() => {
              // Group plots by leaseId
              const leaseGroups = new Map<string | null, PlotFeature[]>();
              for (const plot of plotFeatures) {
                const key = plot.leaseId;
                const group = leaseGroups.get(key);
                if (group) group.push(plot);
                else leaseGroups.set(key, [plot]);
              }

              // Sort: leases first (by lessor name), then plots without lease at end
              const sortedEntries = Array.from(leaseGroups.entries()).sort(([a], [b]) => {
                if (a === null) return 1;
                if (b === null) return -1;
                return 0;
              });

              return sortedEntries.map(([leaseId, plots]) => {
                const firstPlot = plots[0];
                const totalArea = plots.reduce((sum, p) => sum + (p.areaSqm || 0), 0);

                return (
                  <Card key={leaseId || "__no_lease__"}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {leaseId ? (
                            <ScrollText className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                          )}
                          <div>
                            <CardTitle className="text-base">
                              {leaseId
                                ? `Vertrag: ${firstPlot.lessorName || "Unbekannt"}`
                                : "Ohne Vertrag"}
                            </CardTitle>
                            <CardDescription>
                              {plots.length} Flurstück{plots.length !== 1 ? "e" : ""}
                              {totalArea > 0 && ` · ${(totalArea / 10000).toFixed(2)} ha gesamt`}
                              {firstPlot.leaseStatus && (
                                <>
                                  {" · "}
                                  <Badge
                                    variant="secondary"
                                    className={
                                      firstPlot.leaseStatus === "ACTIVE"
                                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                        : firstPlot.leaseStatus === "DRAFT"
                                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                                    }
                                  >
                                    {firstPlot.leaseStatus === "ACTIVE"
                                      ? "Aktiv"
                                      : firstPlot.leaseStatus === "DRAFT"
                                      ? "Entwurf"
                                      : firstPlot.leaseStatus}
                                  </Badge>
                                </>
                              )}
                            </CardDescription>
                          </div>
                        </div>
                        {leaseId && (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/leases/${leaseId}/edit`}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              Vertrag bearbeiten
                            </Link>
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Gemarkung</TableHead>
                            <TableHead>Flur</TableHead>
                            <TableHead>Flurstück</TableHead>
                            <TableHead className="text-right">Fläche</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plots.map((plot) => (
                            <TableRow key={plot.id}>
                              <TableCell className="font-medium">{plot.cadastralDistrict}</TableCell>
                              <TableCell>{plot.fieldNumber || "-"}</TableCell>
                              <TableCell>{plot.plotNumber}</TableCell>
                              <TableCell className="text-right">
                                {plot.areaSqm
                                  ? `${(plot.areaSqm / 10000).toFixed(2)} ha`
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Aktionen">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {plot.leaseId && (
                                      <DropdownMenuItem onClick={() => router.push(`/leases/${plot.leaseId}`)}>
                                        <ScrollText className="mr-2 h-4 w-4" />
                                        Vertrag öffnen
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleRemovePlotFromPark(plot.id)}
                                      className="text-red-600"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Vom Park entfernen
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              });
            })()}
          </div>
        </TabsContent>

        {/* Contracts Tab */}
        <TabsContent value="contracts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Verträge</CardTitle>
                <CardDescription>
                  Aktive Verträge für diesen Windpark
                </CardDescription>
              </div>
              <Button asChild>
                <Link href={`/contracts/new?parkId=${id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Neuer Vertrag
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {park.contracts.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Keine Verträge vorhanden
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titel</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Laufzeit</TableHead>
                      <TableHead className="text-right">Jährlicher Wert</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {park.contracts.map((contract) => (
                      <TableRow
                        key={contract.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/contracts/${contract.id}`)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/contracts/${contract.id}`); } }}
                      >
                        <TableCell className="font-medium">
                          {contract.title}
                        </TableCell>
                        <TableCell>
                          {contractTypeLabels[contract.contractType] ||
                            contract.contractType}
                        </TableCell>
                        <TableCell>
                          {format(new Date(contract.startDate), "dd.MM.yyyy", {
                            locale: de,
                          })}
                          {contract.endDate
                            ? ` - ${format(new Date(contract.endDate), "dd.MM.yyyy", { locale: de })}`
                            : " - unbefristet"}
                        </TableCell>
                        <TableCell className="text-right">
                          {contract.annualValue
                            ? formatCurrency(contract.annualValue)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{contract.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {contract.documents.length > 0 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Vorschau"
                              title="Vorschau"
                              onClick={(e) => {
                                e.stopPropagation();
                                const doc = contract.documents[0];
                                setPreviewDocument({
                                  id: doc.id,
                                  title: doc.title,
                                  fileName: doc.fileName,
                                  fileUrl: doc.fileUrl,
                                  mimeType: doc.mimeType,
                                });
                                setPreviewOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Dokumente</CardTitle>
                <CardDescription>
                  Dokumente zu diesem Windpark
                </CardDescription>
              </div>
              <Button asChild>
                <Link href={`/documents/upload?parkId=${id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  Hochladen
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {park.documents.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Keine Dokumente vorhanden
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titel</TableHead>
                      <TableHead>Kategorie</TableHead>
                      <TableHead>Datei</TableHead>
                      <TableHead>Hochgeladen</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {park.documents.map((doc) => (
                      <TableRow
                        key={doc.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/documents/${doc.id}`);
                          }
                        }}
                      >
                        <TableCell className="font-medium">{doc.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.category}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {doc.fileName}
                        </TableCell>
                        <TableCell>
                          {format(new Date(doc.createdAt), "dd.MM.yyyy", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Vorschau"
                            title="Vorschau"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewDocument(doc);
                              setPreviewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={previewDocument}
      />

      {/* Turbine Dialogs */}
      <TurbineDialogs
        parkId={id}
        parkName={park.name}
        onSuccess={fetchPark}
        isAddOpen={isAddTurbineOpen}
        setIsAddOpen={setIsAddTurbineOpen}
        isEditOpen={isEditTurbineOpen}
        setIsEditOpen={setIsEditTurbineOpen}
        editingTurbine={selectedTurbine}
        isDetailOpen={isTurbineDetailOpen}
        setIsDetailOpen={setIsTurbineDetailOpen}
        viewingTurbine={selectedTurbine}
      />

      {/* Add Fund Dialog */}
      <AlertDialog open={isAddFundOpen} onOpenChange={setIsAddFundOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gesellschaft zuordnen</AlertDialogTitle>
            <AlertDialogDescription>
              Waehlen Sie eine Gesellschaft aus, die diesem Windpark zugeordnet werden soll.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Gesellschaft *</Label>
              <Select value={addFundId} onValueChange={setAddFundId}>
                <SelectTrigger>
                  <SelectValue placeholder="Gesellschaft auswaehlen..." />
                </SelectTrigger>
                <SelectContent>
                  {availableFunds
                    .filter((f) => !park.fundParks.some((fp) => fp.fund.id === f.id))
                    .map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}{f.legalForm ? ` (${f.legalForm})` : ""}
                        {f.fundCategory ? ` - ${f.fundCategory.name}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Eigentumsanteil (%, optional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="z.B. 33.33"
                value={addFundOwnership}
                onChange={(e) => setAddFundOwnership(e.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAddingFund}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddFund} disabled={isAddingFund || !addFundId}>
              {isAddingFund && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Zuordnen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Plots Dialog */}
      <AlertDialog open={isAssignPlotsOpen} onOpenChange={setIsAssignPlotsOpen}>
        <AlertDialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Flurstücke zuordnen</AlertDialogTitle>
            <AlertDialogDescription>
              Flurstücke ohne Parkzuordnung auswählen und diesem Windpark zuordnen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-y-auto py-2">
            {loadingUnassigned ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : unassignedPlots.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Alle Flurstücke sind bereits einem Park zugeordnet.
              </p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2 pb-2">
                  <span className="text-sm text-muted-foreground">
                    {unassignedPlots.length} Flurstücke verfügbar
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedUnassignedIds.size === unassignedPlots.length) {
                        setSelectedUnassignedIds(new Set());
                      } else {
                        setSelectedUnassignedIds(new Set(unassignedPlots.map((p) => p.id)));
                      }
                    }}
                  >
                    {selectedUnassignedIds.size === unassignedPlots.length
                      ? "Alle abwählen"
                      : "Alle auswählen"}
                  </Button>
                </div>
                {unassignedPlots.map((plot) => (
                  <label
                    key={plot.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedUnassignedIds.has(plot.id)}
                      onCheckedChange={() => toggleUnassignedPlot(plot.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {plot.cadastralDistrict}
                        {plot.fieldNumber && plot.fieldNumber !== "0" ? `, Flur ${plot.fieldNumber}` : ""}
                        , Flurstück {plot.plotNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {plot.areaSqm
                          ? `${(Number(plot.areaSqm) / 10000).toFixed(2)} ha`
                          : "Keine Fläche"}
                        {plot.activeLease?.lessorName && ` · ${plot.activeLease.lessorName}`}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assigningPlots}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAssignSelectedPlots}
              disabled={assigningPlots || selectedUnassignedIds.size === 0}
            >
              {assigningPlots && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedUnassignedIds.size > 0
                ? `${selectedUnassignedIds.size} Flurstücke zuordnen`
                : "Zuordnen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Leases Dialog */}
      <AlertDialog open={isAssignLeasesOpen} onOpenChange={setIsAssignLeasesOpen}>
        <AlertDialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Vertrag zuordnen</AlertDialogTitle>
            <AlertDialogDescription>
              Alle Flurstücke eines Vertrags diesem Windpark zuordnen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-y-auto py-2">
            {loadingLeases ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : availableLeases.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Alle Verträge sind bereits diesem Park zugeordnet.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground px-2 pb-2">
                  {availableLeases.length} Verträge mit nicht zugeordneten Flurstücken
                </p>
                {availableLeases.map((lease) => (
                  <label
                    key={lease.id}
                    className="flex items-center gap-3 p-3 rounded border hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedLeaseIds.has(lease.id)}
                      onCheckedChange={() => toggleLeaseSelection(lease.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{lease.lessorName}</p>
                        <Badge
                          variant="secondary"
                          className={
                            lease.status === "ACTIVE"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : lease.status === "DRAFT"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                          }
                        >
                          {lease.status === "ACTIVE" ? "Aktiv" : lease.status === "DRAFT" ? "Entwurf" : lease.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lease.unassignedCount} von {lease.plotCount} Flurstücken werden zugeordnet
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assigningLeases}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAssignSelectedLeases}
              disabled={assigningLeases || selectedLeaseIds.size === 0}
            >
              {assigningLeases && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedLeaseIds.size > 0
                ? `${selectedLeaseIds.size} Verträge zuordnen`
                : "Zuordnen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Turbine Confirmation Dialog */}
      <AlertDialog open={deleteTurbineDialogOpen} onOpenChange={setDeleteTurbineDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anlage unwiderruflich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Anlage &quot;{turbineToDelete?.designation}&quot; wirklich unwiderruflich löschen?
              Diese Aktion kann nicht rueckgaengig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTurbine}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTurbine}
              disabled={isDeletingTurbine}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingTurbine && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unwiderruflich löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
