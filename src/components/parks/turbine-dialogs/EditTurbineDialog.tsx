"use client";

import { useState, useEffect } from "react";
import { de } from "date-fns/locale";
import {
  CalendarIcon,
  Loader2,
  Plus,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { Turbine } from "./types";
import { deviceTypeLabels, parseDateInput, formatDateInput } from "./types";

interface EditTurbineDialogProps {
  turbine: Turbine | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditTurbineDialog({
  turbine,
  isOpen,
  setIsOpen,
  onSuccess,
}: EditTurbineDialogProps) {
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
    notes: "",
    minimumRent: "",
    weaSharePercentage: "",
    poolSharePercentage: "",
  });
  const [commissioningDate, setCommissioningDate] = useState<Date | undefined>();
  const [warrantyEndDate, setWarrantyEndDate] = useState<Date | undefined>();
  const [commissioningDateText, setCommissioningDateText] = useState("");
  const [warrantyEndDateText, setWarrantyEndDateText] = useState("");
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
                id: f.id, name: f.name, legalForm: f.legalForm, fundCategory: f.fundCategory,
              }))
            : []
        );
      }
    } catch { /* Fund loading failed silently */ }
  }

  async function loadFundCategories() {
    try {
      const response = await fetch("/api/fund-categories");
      if (response.ok) {
        const data = await response.json();
        setFundCategories(data.data ?? []);
      }
    } catch { /* Fund categories loading failed silently */ }
  }

  useEffect(() => { loadFunds(); loadFundCategories(); }, []);
  useEffect(() => { if (showNewFundDialog) loadFundCategories(); }, [showNewFundDialog]);

  useEffect(() => {
    if (turbine) {
      const activeOperator = turbine.operatorHistory?.find(() => true);
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
        notes: turbine.notes || "",
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
    if (!newFundName.trim()) { toast.error("Name ist erforderlich"); return; }
    try {
      setIsCreatingFund(true);
      const response = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFundName, legalForm: newFundLegalForm || undefined, fundCategoryId: newFundCategoryId || undefined }),
      });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Fehler beim Erstellen"); }
      const created = await response.json();
      setFunds((prev) => [...prev, { id: created.id, name: created.name, legalForm: created.legalForm, fundCategory: created.fundCategory }]);
      if (fundCreationTarget === "operator") {
        setFormData({ ...formData, operatorFundId: created.id });
      } else {
        setFormData({ ...formData, netzgesellschaftFundId: created.id });
      }
      setShowNewFundDialog(false); setNewFundName(""); setNewFundLegalForm(""); setNewFundCategoryId("");
      toast.success("Gesellschaft wurde erstellt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
    } finally { setIsCreatingFund(false); }
  }

  async function handleSubmit() {
    if (!turbine || !formData.designation.trim()) { toast.error("Bezeichnung ist erforderlich"); return; }
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
          notes: formData.notes || null,
          minimumRent: formData.minimumRent ? parseFloat(formData.minimumRent) : null,
          weaSharePercentage: formData.weaSharePercentage ? parseFloat(formData.weaSharePercentage) : null,
          poolSharePercentage: formData.poolSharePercentage ? parseFloat(formData.poolSharePercentage) : null,
        }),
      });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Fehler beim Speichern"); }
      toast.success("Anlage wurde aktualisiert");
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally { setIsSubmitting(false); }
  }

  if (!turbine) return null;

  // Shared fund select renderer
  const renderFundSelect = (
    value: string,
    onChange: (v: string) => void,
    target: "operator" | "netzgesellschaft"
  ) => (
    <Select
      value={value || "__none__"}
      onValueChange={(v) => {
        if (v === "__create_new__") { setFundCreationTarget(target); setShowNewFundDialog(true); return; }
        onChange(v === "__none__" ? "" : v);
      }}
    >
      <SelectTrigger><SelectValue placeholder="Gesellschaft waehlen" /></SelectTrigger>
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
          <span className="flex items-center gap-2 text-primary"><Plus className="h-3 w-3" />Neue Gesellschaft anlegen</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );

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
          <DialogDescription>{turbine.designation} bearbeiten</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Basis-Informationen */}
          <div className="space-y-4">
            <h4 className="font-medium">Basis-Informationen</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-designation">Bezeichnung *</Label>
                <Input id="edit-designation" placeholder="WEA 01" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-serialNumber">Seriennummer</Label>
                <Input id="edit-serialNumber" placeholder="SN-12345" value={formData.serialNumber} onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-mastrNumber">MaStR-Nummer</Label>
                <Input id="edit-mastrNumber" placeholder="SEE123456789012" value={formData.mastrNumber} onChange={(e) => setFormData({ ...formData, mastrNumber: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select value={formData.status} onValueChange={(value: "ACTIVE" | "INACTIVE" | "ARCHIVED") => setFormData({ ...formData, status: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              {renderFundSelect(formData.operatorFundId, (v) => setFormData({ ...formData, operatorFundId: v }), "operator")}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-technischeBetriebsfuehrung">Technische Betriebsführung</Label>
                <Input id="edit-technischeBetriebsfuehrung" placeholder="z.B. Enercon GmbH" value={formData.technischeBetriebsfuehrung} onChange={(e) => setFormData({ ...formData, technischeBetriebsfuehrung: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-kaufmaennischeBetriebsfuehrung">Kaufmaennische Betriebsführung</Label>
                <Input id="edit-kaufmaennischeBetriebsfuehrung" placeholder="z.B. Windpark Service GmbH" value={formData.kaufmaennischeBetriebsfuehrung} onChange={(e) => setFormData({ ...formData, kaufmaennischeBetriebsfuehrung: e.target.value })} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Netzanbindung */}
          <div className="space-y-4">
            <h4 className="font-medium">Netzanbindung</h4>
            <div className="space-y-2">
              <Label>Netzgesellschaft</Label>
              {renderFundSelect(formData.netzgesellschaftFundId, (v) => setFormData({ ...formData, netzgesellschaftFundId: v }), "netzgesellschaft")}
            </div>
          </div>

          <Separator />

          {/* Pacht-Konfiguration (Override) */}
          <div className="space-y-4">
            <h4 className="font-medium">Pacht-Konfiguration (optional)</h4>
            <TooltipProvider delayDuration={200}>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="edit-minimumRent">Mindestpacht (EUR)</Label>
                    <Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent side="top" className="max-w-[220px]"><p>Optional. Überschreibt die Mindestpacht des Windparks für diese Anlage. Leer = Park-Standard.</p></TooltipContent></Tooltip>
                  </div>
                  <Input id="edit-minimumRent" type="number" step="0.01" min="0" placeholder="Park-Standard" value={formData.minimumRent} onChange={(e) => setFormData({ ...formData, minimumRent: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="edit-weaSharePercentage">WEA-Anteil (%)</Label>
                    <Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent side="top" className="max-w-[220px]"><p>Optional. Überschreibt den WEA-Anteil des Windparks für diese Anlage. Leer = Park-Standard.</p></TooltipContent></Tooltip>
                  </div>
                  <Input id="edit-weaSharePercentage" type="number" step="0.01" min="0" max="100" placeholder="Park-Standard" value={formData.weaSharePercentage} onChange={(e) => setFormData({ ...formData, weaSharePercentage: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="edit-poolSharePercentage">Pool-Anteil (%)</Label>
                    <Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent side="top" className="max-w-[220px]"><p>Optional. Überschreibt den Pool-Anteil des Windparks für diese Anlage. Leer = Park-Standard.</p></TooltipContent></Tooltip>
                  </div>
                  <Input id="edit-poolSharePercentage" type="number" step="0.01" min="0" max="100" placeholder="Park-Standard" value={formData.poolSharePercentage} onChange={(e) => setFormData({ ...formData, poolSharePercentage: e.target.value })} />
                </div>
              </div>
            </TooltipProvider>
          </div>

          <Separator />

          {/* Technische Daten */}
          <div className="space-y-4">
            <h4 className="font-medium">Technische Daten</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="edit-manufacturer">Hersteller</Label><Input id="edit-manufacturer" placeholder="Vestas" value={formData.manufacturer} onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="edit-model">Modell</Label><Input id="edit-model" placeholder="V150-4.2" value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label htmlFor="edit-ratedPowerKw">Leistung (kW)</Label><Input id="edit-ratedPowerKw" type="number" step="0.01" placeholder="4200" value={formData.ratedPowerKw} onChange={(e) => setFormData({ ...formData, ratedPowerKw: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="edit-hubHeightM">Nabenhoehe (m)</Label><Input id="edit-hubHeightM" type="number" step="0.1" placeholder="166" value={formData.hubHeightM} onChange={(e) => setFormData({ ...formData, hubHeightM: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="edit-rotorDiameterM">Rotor (m)</Label><Input id="edit-rotorDiameterM" type="number" step="0.1" placeholder="150" value={formData.rotorDiameterM} onChange={(e) => setFormData({ ...formData, rotorDiameterM: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Inbetriebnahme</Label>
                <div className="flex gap-2">
                  <Input placeholder="TT.MM.JJJJ" value={commissioningDateText} onChange={(e) => { setCommissioningDateText(e.target.value); const parsed = parseDateInput(e.target.value); if (parsed) setCommissioningDate(parsed); }} onBlur={() => { if (commissioningDate) setCommissioningDateText(formatDateInput(commissioningDate)); }} className="flex-1" />
                  <Popover><PopoverTrigger asChild><Button variant="outline" size="icon" className="shrink-0"><CalendarIcon className="h-4 w-4" /></Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={commissioningDate} onSelect={(date) => { setCommissioningDate(date); setCommissioningDateText(formatDateInput(date)); }} locale={de} captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date()} /></PopoverContent></Popover>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Garantie bis</Label>
                <div className="flex gap-2">
                  <Input placeholder="TT.MM.JJJJ" value={warrantyEndDateText} onChange={(e) => { setWarrantyEndDateText(e.target.value); const parsed = parseDateInput(e.target.value); if (parsed) setWarrantyEndDate(parsed); }} onBlur={() => { if (warrantyEndDate) setWarrantyEndDateText(formatDateInput(warrantyEndDate)); }} className="flex-1" />
                  <Popover><PopoverTrigger asChild><Button variant="outline" size="icon" className="shrink-0"><CalendarIcon className="h-4 w-4" /></Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={warrantyEndDate} onSelect={(date) => { setWarrantyEndDate(date); setWarrantyEndDateText(formatDateInput(date)); }} locale={de} captionLayout="dropdown" startMonth={new Date()} endMonth={new Date(2050, 11)} /></PopoverContent></Popover>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Standort */}
          <div className="space-y-4">
            <h4 className="font-medium">Standort</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="edit-latitude">Breitengrad</Label><Input id="edit-latitude" type="number" step="any" placeholder="54.1234" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="edit-longitude">Laengengrad</Label><Input id="edit-longitude" type="number" step="any" placeholder="8.5678" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} /></div>
            </div>
          </div>

          <Separator />

          {/* Notizen */}
          <div className="space-y-4">
            <h4 className="font-medium">Notizen</h4>
            <Textarea
              placeholder="Freitext für interne Notizen, Besonderheiten..."
              className="min-h-[100px]"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !formData.designation.trim()}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Inline Fund Creation Dialog */}
    <Dialog open={showNewFundDialog} onOpenChange={setShowNewFundDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Gesellschaft anlegen</DialogTitle>
          <DialogDescription>Schnell eine neue Gesellschaft erstellen</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Name *</Label><Input placeholder="z.B. Netz GbR Windpark Nord" value={newFundName} onChange={(e) => setNewFundName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Rechtsform</Label><Input placeholder="z.B. GbR, GmbH & Co. KG" value={newFundLegalForm} onChange={(e) => setNewFundLegalForm(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Gesellschaftstyp</Label>
            <select className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newFundCategoryId} onChange={(e) => setNewFundCategoryId(e.target.value)}>
              <option value="">Typ waehlen...</option>
              {fundCategories.map((category) => (<option key={category.id} value={category.id}>{category.name} ({category.code})</option>))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewFundDialog(false)}>Abbrechen</Button>
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
