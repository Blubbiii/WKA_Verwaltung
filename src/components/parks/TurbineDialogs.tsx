"use client";

import { useState, useEffect } from "react";
import { format, parse, isValid } from "date-fns";
import { de } from "date-fns/locale";
import {
  Building2,
  CalendarIcon,
  Loader2,
  Zap,
  MapPin,
  Wrench,
  FileText,
  Plus,
  Upload,
  Download,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { DocumentPreviewDialog } from "@/components/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Turbine {
  id: string;
  designation: string;
  serialNumber: string | null;
  mastrNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  deviceType?: "WEA" | "PARKRECHNER" | "NVP";
  ratedPowerKw: number | null;
  hubHeightM: number | null;
  rotorDiameterM: number | null;
  commissioningDate: string | null;
  warrantyEndDate: string | null;
  latitude: number | null;
  longitude: number | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  technischeBetriebsfuehrung: string | null;
  kaufmaennischeBetriebsfuehrung: string | null;
  netzgesellschaftFundId: string | null;
  netzgesellschaftFund: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null } | null;
  operatorHistory?: { id: string; operatorFundId: string; operatorFund: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null } }[];
  // Per-turbine lease overrides
  minimumRent: number | null;
  weaSharePercentage: number | null;
  poolSharePercentage: number | null;
}

interface ServiceEvent {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  status: string;
  _count?: {
    documents: number;
  };
}

interface TurbineDocument {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  category: string;
  createdAt: string;
}

interface TurbineDetail extends Turbine {
  serviceEvents: ServiceEvent[];
  documents: TurbineDocument[];
  _count?: {
    serviceEvents: number;
    documents: number;
    contracts: number;
  };
}

interface TurbineDialogsProps {
  parkId: string;
  parkName: string;
  onSuccess: () => void;
  // Add Dialog
  isAddOpen: boolean;
  setIsAddOpen: (open: boolean) => void;
  // Edit Dialog
  isEditOpen: boolean;
  setIsEditOpen: (open: boolean) => void;
  editingTurbine: Turbine | null;
  // Detail Dialog
  isDetailOpen: boolean;
  setIsDetailOpen: (open: boolean) => void;
  viewingTurbine: Turbine | null;
}

const deviceTypeLabels: Record<string, string> = {
  WEA: "WEA",
  PARKRECHNER: "Parkrechner",
  NVP: "NVP",
};

const statusColors = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  INACTIVE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ARCHIVED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const statusLabels = {
  ACTIVE: "Aktiv",
  INACTIVE: "Inaktiv",
  ARCHIVED: "Archiviert",
};

const eventTypeLabels: Record<string, string> = {
  MAINTENANCE: "Wartung",
  REPAIR: "Reparatur",
  INSPECTION: "Inspektion",
  UPGRADE: "Upgrade",
  INCIDENT: "Störung",
  OTHER: "Sonstige",
};

const eventStatusLabels: Record<string, string> = {
  SCHEDULED: "Geplant",
  IN_PROGRESS: "In Arbeit",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgebrochen",
};

const eventStatusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};


// Helper: parse dd.MM.yyyy string to Date
function parseDateInput(value: string): Date | undefined {
  if (!value || value.length < 8) return undefined;
  const parsed = parse(value, "dd.MM.yyyy", new Date());
  return isValid(parsed) ? parsed : undefined;
}

// Helper: format Date to dd.MM.yyyy string
function formatDateInput(date: Date | undefined): string {
  return date ? format(date, "dd.MM.yyyy", { locale: de }) : "";
}

function formatCapacity(kw: number): string {
  if (kw >= 1000) {
    return `${(kw / 1000).toFixed(1)} MW`;
  }
  return `${kw.toFixed(0)} kW`;
}

// ============================================================================
// Add Turbine Dialog
// ============================================================================
function AddTurbineDialog({
  parkId,
  parkName,
  isOpen,
  setIsOpen,
  onSuccess,
}: {
  parkId: string;
  parkName: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [funds, setFunds] = useState<{ id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null }[]>([]);
  const [formData, setFormData] = useState<{
    designation: string;
    serialNumber: string;
    mastrNumber: string;
    manufacturer: string;
    model: string;
    ratedPowerKw: string;
    hubHeightM: string;
    rotorDiameterM: string;
    latitude: string;
    longitude: string;
    status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
    operatorFundId: string;
    technischeBetriebsfuehrung: string;
    kaufmaennischeBetriebsfuehrung: string;
    netzgesellschaftFundId: string;
    minimumRent: string;
    weaSharePercentage: string;
    poolSharePercentage: string;
  }>({
    designation: "",
    serialNumber: "",
    mastrNumber: "",
    manufacturer: "",
    model: "",
    ratedPowerKw: "",
    hubHeightM: "",
    rotorDiameterM: "",
    latitude: "",
    longitude: "",
    status: "ACTIVE",
    operatorFundId: "",
    technischeBetriebsfuehrung: "",
    kaufmaennischeBetriebsfuehrung: "",
    netzgesellschaftFundId: "",
    minimumRent: "",
    weaSharePercentage: "",
    poolSharePercentage: "",
  });
  const [commissioningDate, setCommissioningDate] = useState<Date | undefined>();
  const [warrantyEndDate, setWarrantyEndDate] = useState<Date | undefined>();
  const [commissioningDateText, setCommissioningDateText] = useState("");
  const [warrantyEndDateText, setWarrantyEndDateText] = useState("");
  // Inline fund creation - tracks which field triggered it
  const [fundCreationTarget, setFundCreationTarget] = useState<"operator" | "netzgesellschaft">("netzgesellschaft");
  const [showNewFundDialog, setShowNewFundDialog] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [newFundLegalForm, setNewFundLegalForm] = useState("");
  const [newFundCategoryId, setNewFundCategoryId] = useState("");
  const [isCreatingFund, setIsCreatingFund] = useState(false);
  const [fundCategories, setFundCategories] = useState<{ id: string; name: string; code: string; color: string | null }[]>([]);

  async function loadFunds() {
    try {
      const response = await fetch("/api/funds?limit=200");
      if (response.ok) {
        const data = await response.json();
        const fundList = data.data ?? data;
        setFunds(
          Array.isArray(fundList)
            ? fundList.map((f: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null }) => ({
                id: f.id,
                name: f.name,
                legalForm: f.legalForm,
                fundCategory: f.fundCategory,
              }))
            : []
        );
      }
    } catch {
      // Fund loading failed silently
    }
  }

  async function loadFundCategories() {
    try {
      const response = await fetch("/api/fund-categories");
      if (response.ok) {
        const data = await response.json();
        setFundCategories(data.data ?? []);
      }
    } catch {
      // Fund categories loading failed silently
    }
  }

  useEffect(() => {
    loadFunds();
    loadFundCategories();
  }, []);

  // Reload fund categories when the inline fund creation dialog opens
  useEffect(() => {
    if (showNewFundDialog) {
      loadFundCategories();
    }
  }, [showNewFundDialog]);

  async function handleCreateFund() {
    if (!newFundName.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    try {
      setIsCreatingFund(true);
      const response = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFundName,
          legalForm: newFundLegalForm || undefined,
          fundCategoryId: newFundCategoryId || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen");
      }
      const created = await response.json();
      setFunds((prev) => [...prev, { id: created.id, name: created.name, legalForm: created.legalForm, fundCategory: created.fundCategory }]);
      if (fundCreationTarget === "operator") {
        setFormData({ ...formData, operatorFundId: created.id });
      } else {
        setFormData({ ...formData, netzgesellschaftFundId: created.id });
      }
      setShowNewFundDialog(false);
      setNewFundName("");
      setNewFundLegalForm("");
      setNewFundCategoryId("");
      toast.success("Gesellschaft wurde erstellt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
    } finally {
      setIsCreatingFund(false);
    }
  }

  function resetForm() {
    setFormData({
      designation: "",
      serialNumber: "",
      mastrNumber: "",
      manufacturer: "",
      model: "",
      ratedPowerKw: "",
      hubHeightM: "",
      rotorDiameterM: "",
      latitude: "",
      longitude: "",
      status: "ACTIVE",
      operatorFundId: "",
      technischeBetriebsfuehrung: "",
      kaufmaennischeBetriebsfuehrung: "",
      netzgesellschaftFundId: "",
      minimumRent: "",
      weaSharePercentage: "",
      poolSharePercentage: "",
    });
    setCommissioningDate(undefined);
    setWarrantyEndDate(undefined);
    setCommissioningDateText("");
    setWarrantyEndDateText("");
  }

  async function handleSubmit() {
    if (!formData.designation.trim()) {
      toast.error("Bezeichnung ist erforderlich");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/turbines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId,
          designation: formData.designation,
          serialNumber: formData.serialNumber || null,
          mastrNumber: formData.mastrNumber || null,
          manufacturer: formData.manufacturer || null,
          model: formData.model || null,
          ratedPowerKw: formData.ratedPowerKw ? parseFloat(formData.ratedPowerKw) : null,
          hubHeightM: formData.hubHeightM ? parseFloat(formData.hubHeightM) : null,
          rotorDiameterM: formData.rotorDiameterM ? parseFloat(formData.rotorDiameterM) : null,
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          commissioningDate: commissioningDate?.toISOString() || null,
          warrantyEndDate: warrantyEndDate?.toISOString() || null,
          status: formData.status,
          operatorFundId: formData.operatorFundId || null,
          technischeBetriebsfuehrung: formData.technischeBetriebsfuehrung || null,
          kaufmaennischeBetriebsfuehrung: formData.kaufmaennischeBetriebsfuehrung || null,
          netzgesellschaftFundId: formData.netzgesellschaftFundId || null,
          minimumRent: formData.minimumRent ? parseFloat(formData.minimumRent) : null,
          weaSharePercentage: formData.weaSharePercentage ? parseFloat(formData.weaSharePercentage) : null,
          poolSharePercentage: formData.poolSharePercentage ? parseFloat(formData.poolSharePercentage) : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen");
      }

      toast.success("Anlage wurde erstellt");
      resetForm();
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsOpen(open); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neue Anlage hinzufügen</DialogTitle>
          <DialogDescription>
            Neue Windkraftanlage für {parkName} erstellen
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Basis-Informationen */}
          <div className="space-y-4">
            <h4 className="font-medium">Basis-Informationen</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="designation">Bezeichnung *</Label>
                <Input
                  id="designation"
                  placeholder="WEA 01"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serialNumber">Seriennummer</Label>
                <Input
                  id="serialNumber"
                  placeholder="SN-12345"
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mastrNumber">MaStR-Nummer</Label>
                <Input
                  id="mastrNumber"
                  placeholder="SEE123456789012"
                  value={formData.mastrNumber}
                  onChange={(e) => setFormData({ ...formData, mastrNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: "ACTIVE" | "INACTIVE" | "ARCHIVED") =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktiv</SelectItem>
                  <SelectItem value="INACTIVE">Inaktiv</SelectItem>
                  <SelectItem value="ARCHIVED">Archiviert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Betrieb & Verwaltung */}
          <div className="space-y-4">
            <h4 className="font-medium">Betrieb & Verwaltung</h4>
            <div className="space-y-2">
              <Label>Betreibergesellschaft</Label>
              <Select
                value={formData.operatorFundId || "__none__"}
                onValueChange={(v) => {
                  if (v === "__create_new__") {
                    setFundCreationTarget("operator");
                    setShowNewFundDialog(true);
                    return;
                  }
                  setFormData({ ...formData, operatorFundId: v === "__none__" ? "" : v });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Gesellschaft waehlen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Nicht zugeordnet --</SelectItem>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      <span className="flex items-center gap-2">
                        {fund.name}{fund.legalForm ? ` (${fund.legalForm})` : ""}
                        {fund.fundCategory && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: fund.fundCategory.color || undefined }}>
                            {fund.fundCategory.name}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__create_new__">
                    <span className="flex items-center gap-2 text-primary">
                      <Plus className="h-3 w-3" />
                      Neue Gesellschaft anlegen
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="technischeBetriebsfuehrung">Technische Betriebsführung</Label>
                <Input
                  id="technischeBetriebsfuehrung"
                  placeholder="z.B. Enercon GmbH"
                  value={formData.technischeBetriebsfuehrung}
                  onChange={(e) => setFormData({ ...formData, technischeBetriebsfuehrung: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kaufmaennischeBetriebsfuehrung">Kaufmaennische Betriebsführung</Label>
                <Input
                  id="kaufmaennischeBetriebsfuehrung"
                  placeholder="z.B. Windpark Service GmbH"
                  value={formData.kaufmaennischeBetriebsfuehrung}
                  onChange={(e) => setFormData({ ...formData, kaufmaennischeBetriebsfuehrung: e.target.value })}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Netzanbindung */}
          <div className="space-y-4">
            <h4 className="font-medium">Netzanbindung</h4>
            <div className="space-y-2">
              <Label>Netzgesellschaft</Label>
              <Select
                value={formData.netzgesellschaftFundId || "__none__"}
                onValueChange={(v) => {
                  if (v === "__create_new__") {
                    setFundCreationTarget("netzgesellschaft");
                    setShowNewFundDialog(true);
                    return;
                  }
                  setFormData({ ...formData, netzgesellschaftFundId: v === "__none__" ? "" : v });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Gesellschaft waehlen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Nicht zugeordnet --</SelectItem>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      <span className="flex items-center gap-2">
                        {fund.name}{fund.legalForm ? ` (${fund.legalForm})` : ""}
                        {fund.fundCategory && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: fund.fundCategory.color || undefined }}>
                            {fund.fundCategory.name}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__create_new__">
                    <span className="flex items-center gap-2 text-primary">
                      <Plus className="h-3 w-3" />
                      Neue Gesellschaft anlegen
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Pacht-Konfiguration (Override) */}
          <div className="space-y-4">
            <h4 className="font-medium">Pacht-Konfiguration (optional)</h4>
            <p className="text-xs text-muted-foreground">
              Leer lassen, um die Werte vom Windpark zu übernehmen. Ein gesetzter Wert überschreibt den Parkstandard für diese Anlage.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minimumRent">Mindestpacht (EUR)</Label>
                <Input
                  id="minimumRent"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Park-Standard"
                  value={formData.minimumRent}
                  onChange={(e) => setFormData({ ...formData, minimumRent: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weaSharePercentage">WEA-Anteil (%)</Label>
                <Input
                  id="weaSharePercentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Park-Standard"
                  value={formData.weaSharePercentage}
                  onChange={(e) => setFormData({ ...formData, weaSharePercentage: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="poolSharePercentage">Pool-Anteil (%)</Label>
                <Input
                  id="poolSharePercentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Park-Standard"
                  value={formData.poolSharePercentage}
                  onChange={(e) => setFormData({ ...formData, poolSharePercentage: e.target.value })}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Technische Daten */}
          <div className="space-y-4">
            <h4 className="font-medium">Technische Daten</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Hersteller</Label>
                <Input
                  id="manufacturer"
                  placeholder="Vestas"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Modell</Label>
                <Input
                  id="model"
                  placeholder="V150-4.2"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ratedPowerKw">Leistung (kW)</Label>
                <Input
                  id="ratedPowerKw"
                  type="number"
                  step="0.01"
                  placeholder="4200"
                  value={formData.ratedPowerKw}
                  onChange={(e) => setFormData({ ...formData, ratedPowerKw: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hubHeightM">Nabenhoehe (m)</Label>
                <Input
                  id="hubHeightM"
                  type="number"
                  step="0.1"
                  placeholder="166"
                  value={formData.hubHeightM}
                  onChange={(e) => setFormData({ ...formData, hubHeightM: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rotorDiameterM">Rotor (m)</Label>
                <Input
                  id="rotorDiameterM"
                  type="number"
                  step="0.1"
                  placeholder="150"
                  value={formData.rotorDiameterM}
                  onChange={(e) => setFormData({ ...formData, rotorDiameterM: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Inbetriebnahme</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="TT.MM.JJJJ"
                    value={commissioningDateText}
                    onChange={(e) => {
                      setCommissioningDateText(e.target.value);
                      const parsed = parseDateInput(e.target.value);
                      if (parsed) setCommissioningDate(parsed);
                    }}
                    onBlur={() => {
                      if (commissioningDate) {
                        setCommissioningDateText(formatDateInput(commissioningDate));
                      }
                    }}
                    className="flex-1"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={commissioningDate}
                        onSelect={(date) => {
                          setCommissioningDate(date);
                          setCommissioningDateText(formatDateInput(date));
                        }}
                        locale={de}
                        captionLayout="dropdown"
                        startMonth={new Date(2000, 0)}
                        endMonth={new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Garantie bis</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="TT.MM.JJJJ"
                    value={warrantyEndDateText}
                    onChange={(e) => {
                      setWarrantyEndDateText(e.target.value);
                      const parsed = parseDateInput(e.target.value);
                      if (parsed) setWarrantyEndDate(parsed);
                    }}
                    onBlur={() => {
                      if (warrantyEndDate) {
                        setWarrantyEndDateText(formatDateInput(warrantyEndDate));
                      }
                    }}
                    className="flex-1"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={warrantyEndDate}
                        onSelect={(date) => {
                          setWarrantyEndDate(date);
                          setWarrantyEndDateText(formatDateInput(date));
                        }}
                        locale={de}
                        captionLayout="dropdown"
                        startMonth={new Date()}
                        endMonth={new Date(2050, 11)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Standort */}
          <div className="space-y-4">
            <h4 className="font-medium">Standort</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Breitengrad</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  placeholder="54.1234"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Laengengrad</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  placeholder="8.5678"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); setIsOpen(false); }}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !formData.designation.trim()}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Inline Fund Creation Dialog - rendered as sibling to avoid nested dialog portal conflicts */}
    <Dialog open={showNewFundDialog} onOpenChange={setShowNewFundDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Gesellschaft anlegen</DialogTitle>
          <DialogDescription>
            Schnell eine neue Gesellschaft erstellen
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder="z.B. Netz GbR Windpark Nord"
              value={newFundName}
              onChange={(e) => setNewFundName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rechtsform</Label>
            <Input
              placeholder="z.B. GbR, GmbH & Co. KG"
              value={newFundLegalForm}
              onChange={(e) => setNewFundLegalForm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Gesellschaftstyp</Label>
            <select
              className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={newFundCategoryId}
              onChange={(e) => setNewFundCategoryId(e.target.value)}
            >
              <option value="">Typ waehlen...</option>
              {fundCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.code})
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewFundDialog(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleCreateFund} disabled={isCreatingFund || !newFundName.trim()}>
            {isCreatingFund && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ============================================================================
// Edit Turbine Dialog
// ============================================================================
function EditTurbineDialog({
  turbine,
  isOpen,
  setIsOpen,
  onSuccess,
}: {
  turbine: Turbine | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [funds, setFunds] = useState<{ id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null }[]>([]);
  const [formData, setFormData] = useState({
    designation: "",
    serialNumber: "",
    mastrNumber: "",
    manufacturer: "",
    model: "",
    ratedPowerKw: "",
    hubHeightM: "",
    rotorDiameterM: "",
    latitude: "",
    longitude: "",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE" | "ARCHIVED",
    operatorFundId: "",
    technischeBetriebsfuehrung: "",
    kaufmaennischeBetriebsfuehrung: "",
    netzgesellschaftFundId: "",
    minimumRent: "",
    weaSharePercentage: "",
    poolSharePercentage: "",
  });
  const [commissioningDate, setCommissioningDate] = useState<Date | undefined>();
  const [warrantyEndDate, setWarrantyEndDate] = useState<Date | undefined>();
  const [commissioningDateText, setCommissioningDateText] = useState("");
  const [warrantyEndDateText, setWarrantyEndDateText] = useState("");
  // Inline fund creation - tracks which field triggered it
  const [fundCreationTarget, setFundCreationTarget] = useState<"operator" | "netzgesellschaft">("netzgesellschaft");
  const [showNewFundDialog, setShowNewFundDialog] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [newFundLegalForm, setNewFundLegalForm] = useState("");
  const [newFundCategoryId, setNewFundCategoryId] = useState("");
  const [isCreatingFund, setIsCreatingFund] = useState(false);
  const [fundCategories, setFundCategories] = useState<{ id: string; name: string; code: string; color: string | null }[]>([]);

  async function loadFunds() {
    try {
      const response = await fetch("/api/funds?limit=200");
      if (response.ok) {
        const data = await response.json();
        const fundList = data.data ?? data;
        setFunds(
          Array.isArray(fundList)
            ? fundList.map((f: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null }) => ({
                id: f.id,
                name: f.name,
                legalForm: f.legalForm,
                fundCategory: f.fundCategory,
              }))
            : []
        );
      }
    } catch {
      // Fund loading failed silently
    }
  }

  async function loadFundCategories() {
    try {
      const response = await fetch("/api/fund-categories");
      if (response.ok) {
        const data = await response.json();
        setFundCategories(data.data ?? []);
      }
    } catch {
      // Fund categories loading failed silently
    }
  }

  useEffect(() => {
    loadFunds();
    loadFundCategories();
  }, []);

  // Reload fund categories when the inline fund creation dialog opens
  useEffect(() => {
    if (showNewFundDialog) {
      loadFundCategories();
    }
  }, [showNewFundDialog]);

  useEffect(() => {
    if (turbine) {
      const activeOperator = turbine.operatorHistory?.find((op) => true); // first (active) entry
      setFormData({
        designation: turbine.designation,
        serialNumber: turbine.serialNumber || "",
        mastrNumber: turbine.mastrNumber || "",
        manufacturer: turbine.manufacturer || "",
        model: turbine.model || "",
        ratedPowerKw: turbine.ratedPowerKw?.toString() || "",
        hubHeightM: turbine.hubHeightM?.toString() || "",
        rotorDiameterM: turbine.rotorDiameterM?.toString() || "",
        latitude: turbine.latitude?.toString() || "",
        longitude: turbine.longitude?.toString() || "",
        status: turbine.status,
        operatorFundId: activeOperator?.operatorFundId || "",
        technischeBetriebsfuehrung: turbine.technischeBetriebsfuehrung || "",
        kaufmaennischeBetriebsfuehrung: turbine.kaufmaennischeBetriebsfuehrung || "",
        netzgesellschaftFundId: turbine.netzgesellschaftFundId || "",
        minimumRent: turbine.minimumRent?.toString() || "",
        weaSharePercentage: turbine.weaSharePercentage?.toString() || "",
        poolSharePercentage: turbine.poolSharePercentage?.toString() || "",
      });
      const cDate = turbine.commissioningDate ? new Date(turbine.commissioningDate) : undefined;
      const wDate = turbine.warrantyEndDate ? new Date(turbine.warrantyEndDate) : undefined;
      setCommissioningDate(cDate);
      setWarrantyEndDate(wDate);
      setCommissioningDateText(formatDateInput(cDate));
      setWarrantyEndDateText(formatDateInput(wDate));
    }
  }, [turbine]);

  async function handleCreateFund() {
    if (!newFundName.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    try {
      setIsCreatingFund(true);
      const response = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFundName,
          legalForm: newFundLegalForm || undefined,
          fundCategoryId: newFundCategoryId || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen");
      }
      const created = await response.json();
      setFunds((prev) => [...prev, { id: created.id, name: created.name, legalForm: created.legalForm, fundCategory: created.fundCategory }]);
      if (fundCreationTarget === "operator") {
        setFormData({ ...formData, operatorFundId: created.id });
      } else {
        setFormData({ ...formData, netzgesellschaftFundId: created.id });
      }
      setShowNewFundDialog(false);
      setNewFundName("");
      setNewFundLegalForm("");
      setNewFundCategoryId("");
      toast.success("Gesellschaft wurde erstellt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
    } finally {
      setIsCreatingFund(false);
    }
  }

  async function handleSubmit() {
    if (!turbine || !formData.designation.trim()) {
      toast.error("Bezeichnung ist erforderlich");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/turbines/${turbine.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designation: formData.designation,
          serialNumber: formData.serialNumber || null,
          mastrNumber: formData.mastrNumber || null,
          manufacturer: formData.manufacturer || null,
          model: formData.model || null,
          ratedPowerKw: formData.ratedPowerKw ? parseFloat(formData.ratedPowerKw) : null,
          hubHeightM: formData.hubHeightM ? parseFloat(formData.hubHeightM) : null,
          rotorDiameterM: formData.rotorDiameterM ? parseFloat(formData.rotorDiameterM) : null,
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          commissioningDate: commissioningDate?.toISOString() || null,
          warrantyEndDate: warrantyEndDate?.toISOString() || null,
          status: formData.status,
          operatorFundId: formData.operatorFundId || null,
          technischeBetriebsfuehrung: formData.technischeBetriebsfuehrung || null,
          kaufmaennischeBetriebsfuehrung: formData.kaufmaennischeBetriebsfuehrung || null,
          netzgesellschaftFundId: formData.netzgesellschaftFundId || null,
          minimumRent: formData.minimumRent ? parseFloat(formData.minimumRent) : null,
          weaSharePercentage: formData.weaSharePercentage ? parseFloat(formData.weaSharePercentage) : null,
          poolSharePercentage: formData.poolSharePercentage ? parseFloat(formData.poolSharePercentage) : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Anlage wurde aktualisiert");
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!turbine) return null;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Anlage bearbeiten
            {turbine.deviceType && turbine.deviceType !== "WEA" && (
              <Badge variant="outline" className="text-xs font-normal">
                {deviceTypeLabels[turbine.deviceType] || turbine.deviceType}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {turbine.designation} bearbeiten
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Basis-Informationen */}
          <div className="space-y-4">
            <h4 className="font-medium">Basis-Informationen</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-designation">Bezeichnung *</Label>
                <Input
                  id="edit-designation"
                  placeholder="WEA 01"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-serialNumber">Seriennummer</Label>
                <Input
                  id="edit-serialNumber"
                  placeholder="SN-12345"
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-mastrNumber">MaStR-Nummer</Label>
                <Input
                  id="edit-mastrNumber"
                  placeholder="SEE123456789012"
                  value={formData.mastrNumber}
                  onChange={(e) => setFormData({ ...formData, mastrNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: "ACTIVE" | "INACTIVE" | "ARCHIVED") =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktiv</SelectItem>
                  <SelectItem value="INACTIVE">Inaktiv</SelectItem>
                  <SelectItem value="ARCHIVED">Archiviert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Betrieb & Verwaltung */}
          <div className="space-y-4">
            <h4 className="font-medium">Betrieb & Verwaltung</h4>
            <div className="space-y-2">
              <Label>Betreibergesellschaft</Label>
              <Select
                value={formData.operatorFundId || "__none__"}
                onValueChange={(v) => {
                  if (v === "__create_new__") {
                    setFundCreationTarget("operator");
                    setShowNewFundDialog(true);
                    return;
                  }
                  setFormData({ ...formData, operatorFundId: v === "__none__" ? "" : v });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Gesellschaft waehlen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Nicht zugeordnet --</SelectItem>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      <span className="flex items-center gap-2">
                        {fund.name}{fund.legalForm ? ` (${fund.legalForm})` : ""}
                        {fund.fundCategory && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: fund.fundCategory.color || undefined }}>
                            {fund.fundCategory.name}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__create_new__">
                    <span className="flex items-center gap-2 text-primary">
                      <Plus className="h-3 w-3" />
                      Neue Gesellschaft anlegen
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-technischeBetriebsfuehrung">Technische Betriebsführung</Label>
                <Input
                  id="edit-technischeBetriebsfuehrung"
                  placeholder="z.B. Enercon GmbH"
                  value={formData.technischeBetriebsfuehrung}
                  onChange={(e) => setFormData({ ...formData, technischeBetriebsfuehrung: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-kaufmaennischeBetriebsfuehrung">Kaufmaennische Betriebsführung</Label>
                <Input
                  id="edit-kaufmaennischeBetriebsfuehrung"
                  placeholder="z.B. Windpark Service GmbH"
                  value={formData.kaufmaennischeBetriebsfuehrung}
                  onChange={(e) => setFormData({ ...formData, kaufmaennischeBetriebsfuehrung: e.target.value })}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Netzanbindung */}
          <div className="space-y-4">
            <h4 className="font-medium">Netzanbindung</h4>
            <div className="space-y-2">
              <Label>Netzgesellschaft</Label>
              <Select
                value={formData.netzgesellschaftFundId || "__none__"}
                onValueChange={(v) => {
                  if (v === "__create_new__") {
                    setFundCreationTarget("netzgesellschaft");
                    setShowNewFundDialog(true);
                    return;
                  }
                  setFormData({ ...formData, netzgesellschaftFundId: v === "__none__" ? "" : v });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Gesellschaft waehlen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Nicht zugeordnet --</SelectItem>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      <span className="flex items-center gap-2">
                        {fund.name}{fund.legalForm ? ` (${fund.legalForm})` : ""}
                        {fund.fundCategory && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: fund.fundCategory.color || undefined }}>
                            {fund.fundCategory.name}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__create_new__">
                    <span className="flex items-center gap-2 text-primary">
                      <Plus className="h-3 w-3" />
                      Neue Gesellschaft anlegen
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Pacht-Konfiguration (Override) */}
          <div className="space-y-4">
            <h4 className="font-medium">Pacht-Konfiguration (optional)</h4>
            <p className="text-xs text-muted-foreground">
              Leer lassen, um die Werte vom Windpark zu übernehmen. Ein gesetzter Wert überschreibt den Parkstandard für diese Anlage.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-minimumRent">Mindestpacht (EUR)</Label>
                <Input
                  id="edit-minimumRent"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Park-Standard"
                  value={formData.minimumRent}
                  onChange={(e) => setFormData({ ...formData, minimumRent: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-weaSharePercentage">WEA-Anteil (%)</Label>
                <Input
                  id="edit-weaSharePercentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Park-Standard"
                  value={formData.weaSharePercentage}
                  onChange={(e) => setFormData({ ...formData, weaSharePercentage: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-poolSharePercentage">Pool-Anteil (%)</Label>
                <Input
                  id="edit-poolSharePercentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Park-Standard"
                  value={formData.poolSharePercentage}
                  onChange={(e) => setFormData({ ...formData, poolSharePercentage: e.target.value })}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Technische Daten */}
          <div className="space-y-4">
            <h4 className="font-medium">Technische Daten</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-manufacturer">Hersteller</Label>
                <Input
                  id="edit-manufacturer"
                  placeholder="Vestas"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-model">Modell</Label>
                <Input
                  id="edit-model"
                  placeholder="V150-4.2"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-ratedPowerKw">Leistung (kW)</Label>
                <Input
                  id="edit-ratedPowerKw"
                  type="number"
                  step="0.01"
                  placeholder="4200"
                  value={formData.ratedPowerKw}
                  onChange={(e) => setFormData({ ...formData, ratedPowerKw: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-hubHeightM">Nabenhoehe (m)</Label>
                <Input
                  id="edit-hubHeightM"
                  type="number"
                  step="0.1"
                  placeholder="166"
                  value={formData.hubHeightM}
                  onChange={(e) => setFormData({ ...formData, hubHeightM: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rotorDiameterM">Rotor (m)</Label>
                <Input
                  id="edit-rotorDiameterM"
                  type="number"
                  step="0.1"
                  placeholder="150"
                  value={formData.rotorDiameterM}
                  onChange={(e) => setFormData({ ...formData, rotorDiameterM: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Inbetriebnahme</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="TT.MM.JJJJ"
                    value={commissioningDateText}
                    onChange={(e) => {
                      setCommissioningDateText(e.target.value);
                      const parsed = parseDateInput(e.target.value);
                      if (parsed) setCommissioningDate(parsed);
                    }}
                    onBlur={() => {
                      if (commissioningDate) {
                        setCommissioningDateText(formatDateInput(commissioningDate));
                      }
                    }}
                    className="flex-1"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={commissioningDate}
                        onSelect={(date) => {
                          setCommissioningDate(date);
                          setCommissioningDateText(formatDateInput(date));
                        }}
                        locale={de}
                        captionLayout="dropdown"
                        startMonth={new Date(2000, 0)}
                        endMonth={new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Garantie bis</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="TT.MM.JJJJ"
                    value={warrantyEndDateText}
                    onChange={(e) => {
                      setWarrantyEndDateText(e.target.value);
                      const parsed = parseDateInput(e.target.value);
                      if (parsed) setWarrantyEndDate(parsed);
                    }}
                    onBlur={() => {
                      if (warrantyEndDate) {
                        setWarrantyEndDateText(formatDateInput(warrantyEndDate));
                      }
                    }}
                    className="flex-1"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="shrink-0">
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={warrantyEndDate}
                        onSelect={(date) => {
                          setWarrantyEndDate(date);
                          setWarrantyEndDateText(formatDateInput(date));
                        }}
                        locale={de}
                        captionLayout="dropdown"
                        startMonth={new Date()}
                        endMonth={new Date(2050, 11)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Standort */}
          <div className="space-y-4">
            <h4 className="font-medium">Standort</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-latitude">Breitengrad</Label>
                <Input
                  id="edit-latitude"
                  type="number"
                  step="any"
                  placeholder="54.1234"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-longitude">Laengengrad</Label>
                <Input
                  id="edit-longitude"
                  type="number"
                  step="any"
                  placeholder="8.5678"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !formData.designation.trim()}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Inline Fund Creation Dialog - rendered as sibling to avoid nested dialog portal conflicts */}
    <Dialog open={showNewFundDialog} onOpenChange={setShowNewFundDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Gesellschaft anlegen</DialogTitle>
          <DialogDescription>
            Schnell eine neue Gesellschaft erstellen
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder="z.B. Netz GbR Windpark Nord"
              value={newFundName}
              onChange={(e) => setNewFundName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rechtsform</Label>
            <Input
              placeholder="z.B. GbR, GmbH & Co. KG"
              value={newFundLegalForm}
              onChange={(e) => setNewFundLegalForm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Gesellschaftstyp</Label>
            <select
              className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={newFundCategoryId}
              onChange={(e) => setNewFundCategoryId(e.target.value)}
            >
              <option value="">Typ waehlen...</option>
              {fundCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.code})
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewFundDialog(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleCreateFund} disabled={isCreatingFund || !newFundName.trim()}>
            {isCreatingFund && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ============================================================================
// Turbine Detail Dialog
// ============================================================================
function TurbineDetailDialog({
  turbine,
  isOpen,
  setIsOpen,
  onEdit,
}: {
  turbine: Turbine | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onEdit: () => void;
}) {
  const [turbineDetail, setTurbineDetail] = useState<TurbineDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<TurbineDocument | null>(null);

  useEffect(() => {
    if (isOpen && turbine) {
      fetchTurbineDetail();
    }
  }, [isOpen, turbine?.id]);

  async function fetchTurbineDetail() {
    if (!turbine) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/turbines/${turbine.id}`);
      if (response.ok) {
        const data = await response.json();
        setTurbineDetail(data);
      }
    } catch {
      // Turbine detail fetch failed silently
    } finally {
      setLoading(false);
    }
  }

  if (!turbine) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {turbine.designation}
            </DialogTitle>
            {turbine.deviceType && turbine.deviceType !== "WEA" && (
              <Badge variant="outline" className="text-xs font-normal">
                {deviceTypeLabels[turbine.deviceType] || turbine.deviceType}
              </Badge>
            )}
            <Badge variant="secondary" className={statusColors[turbine.status]}>
              {statusLabels[turbine.status]}
            </Badge>
          </div>
          <DialogDescription>
            {turbine.manufacturer} {turbine.model}
            {turbine.serialNumber && ` - ${turbine.serialNumber}`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="details" className="mt-4">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="service">
                Service-Events ({turbineDetail?._count?.serviceEvents || 0})
              </TabsTrigger>
              <TabsTrigger value="documents">
                Dokumente ({turbineDetail?._count?.documents || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6 mt-4">
              {/* Technische Daten */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Technische Daten
                </h4>
                <div className="grid grid-cols-3 gap-4 rounded-lg border p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Leistung</p>
                    <p className="font-medium">
                      {turbine.ratedPowerKw ? formatCapacity(turbine.ratedPowerKw) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nabenhoehe</p>
                    <p className="font-medium">
                      {turbine.hubHeightM ? `${turbine.hubHeightM} m` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Rotordurchmesser</p>
                    <p className="font-medium">
                      {turbine.rotorDiameterM ? `${turbine.rotorDiameterM} m` : "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Registrierung */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Registrierung
                </h4>
                <div className="grid grid-cols-3 gap-4 rounded-lg border p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Gerätetyp</p>
                    <p className="font-medium">
                      {deviceTypeLabels[turbine.deviceType || "WEA"] || "WEA"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Seriennummer</p>
                    <p className="font-medium">{turbine.serialNumber || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">MaStR-Nummer</p>
                    <p className="font-medium">{turbine.mastrNumber || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Betrieb & Verwaltung */}
              {(() => {
                const activeOp = turbineDetail?.operatorHistory?.[0];
                return (
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Betrieb & Verwaltung
                    </h4>
                    <div className="grid grid-cols-1 gap-4 rounded-lg border p-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Betreibergesellschaft</p>
                        <span className="font-medium flex items-center gap-2">
                          {activeOp
                            ? <>
                                {activeOp.operatorFund.name}
                                {activeOp.operatorFund.legalForm ? ` (${activeOp.operatorFund.legalForm})` : ""}
                                {activeOp.operatorFund.fundCategory && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: activeOp.operatorFund.fundCategory.color || undefined }}>
                                    {activeOp.operatorFund.fundCategory.name}
                                  </Badge>
                                )}
                              </>
                            : <span className="text-muted-foreground">Keine Zuordnung</span>}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Technische Betriebsführung</p>
                          <p className="font-medium">{turbineDetail?.technischeBetriebsfuehrung || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Kaufmaennische Betriebsführung</p>
                          <p className="font-medium">{turbineDetail?.kaufmaennischeBetriebsfuehrung || "-"}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Netzanbindung */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Netzanbindung
                </h4>
                <div className="rounded-lg border p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Netzgesellschaft</p>
                    <span className="font-medium flex items-center gap-2">
                      {turbine.netzgesellschaftFund
                        ? <>
                            {turbine.netzgesellschaftFund.name}{turbine.netzgesellschaftFund.legalForm ? ` (${turbine.netzgesellschaftFund.legalForm})` : ""}
                            {turbine.netzgesellschaftFund.fundCategory && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: turbine.netzgesellschaftFund.fundCategory.color || undefined }}>
                                {turbine.netzgesellschaftFund.fundCategory.name}
                              </Badge>
                            )}
                          </>
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pacht-Konfiguration */}
              {(turbineDetail?.minimumRent != null || turbineDetail?.weaSharePercentage != null || turbineDetail?.poolSharePercentage != null) && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    Pacht-Konfiguration (Anlagen-Override)
                  </h4>
                  <div className="grid grid-cols-3 gap-4 rounded-lg border p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Mindestpacht</p>
                      <p className="font-medium">
                        {turbineDetail.minimumRent != null
                          ? `${Number(turbineDetail.minimumRent).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`
                          : "Park-Standard"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">WEA-Anteil</p>
                      <p className="font-medium">
                        {turbineDetail.weaSharePercentage != null
                          ? `${Number(turbineDetail.weaSharePercentage).toLocaleString("de-DE")} %`
                          : "Park-Standard"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pool-Anteil</p>
                      <p className="font-medium">
                        {turbineDetail.poolSharePercentage != null
                          ? `${Number(turbineDetail.poolSharePercentage).toLocaleString("de-DE")} %`
                          : "Park-Standard"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Termine */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Termine
                </h4>
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Inbetriebnahme</p>
                    <p className="font-medium">
                      {turbine.commissioningDate
                        ? format(new Date(turbine.commissioningDate), "dd.MM.yyyy", { locale: de })
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Garantie bis</p>
                    <p className="font-medium">
                      {turbine.warrantyEndDate
                        ? format(new Date(turbine.warrantyEndDate), "dd.MM.yyyy", { locale: de })
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Standort */}
              {(turbine.latitude || turbine.longitude) && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Standort
                  </h4>
                  <div className="rounded-lg border p-4">
                    <p className="font-mono text-sm">
                      {turbine.latitude ? Number(turbine.latitude).toFixed(6) : "-"}, {turbine.longitude ? Number(turbine.longitude).toFixed(6) : "-"}
                    </p>
                  </div>
                </div>
              )}

              {/* Statistiken */}
              {turbineDetail?._count && (
                <div className="space-y-3">
                  <h4 className="font-medium">Statistiken</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg border p-3 text-center">
                      <Wrench className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
                      <p className="text-2xl font-bold">{turbineDetail._count.serviceEvents}</p>
                      <p className="text-xs text-muted-foreground">Service-Events</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <FileText className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
                      <p className="text-2xl font-bold">{turbineDetail._count.documents}</p>
                      <p className="text-xs text-muted-foreground">Dokumente</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <FileText className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
                      <p className="text-2xl font-bold">{turbineDetail._count.contracts}</p>
                      <p className="text-xs text-muted-foreground">Verträge</p>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="service" className="mt-4">
              {!turbineDetail?.serviceEvents || turbineDetail.serviceEvents.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Wrench className="mx-auto h-12 w-12 opacity-50 mb-4" />
                  <p>Keine Service-Events vorhanden</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Typ</TableHead>
                      <TableHead>Titel</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {turbineDetail.serviceEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {eventTypeLabels[event.eventType] || event.eventType}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{event.title}</TableCell>
                        <TableCell>
                          {event.completedDate
                            ? format(new Date(event.completedDate), "dd.MM.yyyy", { locale: de })
                            : event.scheduledDate
                            ? format(new Date(event.scheduledDate), "dd.MM.yyyy", { locale: de })
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={eventStatusColors[event.status] || ""}
                          >
                            {eventStatusLabels[event.status] || event.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-medium">Dokumente</h4>
                <Button size="sm" asChild>
                  <Link href={`/documents/upload?turbineId=${turbine.id}`}>
                    <Upload className="mr-2 h-4 w-4" />
                    Hochladen
                  </Link>
                </Button>
              </div>
              {!turbineDetail?.documents || turbineDetail.documents.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <FileText className="mx-auto h-12 w-12 opacity-50 mb-4" />
                  <p>Keine Dokumente vorhanden</p>
                  <Button variant="outline" size="sm" className="mt-4" asChild>
                    <Link href={`/documents/upload?turbineId=${turbine.id}`}>
                      <Upload className="mr-2 h-4 w-4" />
                      Erstes Dokument hochladen
                    </Link>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dokument</TableHead>
                      <TableHead>Kategorie</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="w-[100px]">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {turbineDetail.documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{doc.title}</p>
                            <p className="text-sm text-muted-foreground">{doc.fileName}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.category}</Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(doc.createdAt), "dd.MM.yyyy", { locale: de })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setPreviewDocument(doc);
                                setPreviewOpen(true);
                              }}
                              title="Vorschau"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(doc.fileUrl, "_blank")}
                              title="Herunterladen"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Schliessen
          </Button>
          <Button
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
          >
            Bearbeiten
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={previewDocument}
      />
    </Dialog>
  );
}

// ============================================================================
// Main Export Component
// ============================================================================
export function TurbineDialogs({
  parkId,
  parkName,
  onSuccess,
  isAddOpen,
  setIsAddOpen,
  isEditOpen,
  setIsEditOpen,
  editingTurbine,
  isDetailOpen,
  setIsDetailOpen,
  viewingTurbine,
}: TurbineDialogsProps) {
  return (
    <>
      <AddTurbineDialog
        parkId={parkId}
        parkName={parkName}
        isOpen={isAddOpen}
        setIsOpen={setIsAddOpen}
        onSuccess={onSuccess}
      />
      <EditTurbineDialog
        turbine={editingTurbine}
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        onSuccess={onSuccess}
      />
      <TurbineDetailDialog
        turbine={viewingTurbine}
        isOpen={isDetailOpen}
        setIsOpen={setIsDetailOpen}
        onEdit={() => {
          setIsDetailOpen(false);
          setIsEditOpen(true);
        }}
      />
    </>
  );
}
