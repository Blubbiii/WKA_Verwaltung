"use client";

import { useState, useEffect } from "react";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  MapPin,
  Calendar,
  Euro,
  User,
  FileText,
  AlertTriangle,
  Layers,
  Building2,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// Types
interface Park {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
}

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
  county: string | null;
  municipality: string | null;
  cadastralDistrict: string | null;
  fieldNumber: string | null;
  plotNumber: string | null;
  areaSqm: number | null;
  usageType: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  park: Park | null;
  plotAreas: PlotArea[];
}

interface Lessor {
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
  bankIban: string | null;
  bankName: string | null;
}

interface LeaseBasic {
  id: string;
  startDate: string;
  endDate: string | null;
  status: string;
  lessor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    personType: string;
  };
  plots: Array<{
    id: string;
    cadastralDistrict: string | null;
    plotNumber: string | null;
  }>;
}

interface LeaseDetail {
  id: string;
  contractNumber: string | null;
  signedDate: string | null;
  startDate: string;
  endDate: string | null;
  noticePeriodMonths: number;
  status: string;
  hasExtensionOption: boolean;
  extensionDetails: string | null;
  hasWaitingMoney: boolean;
  waitingMoneyAmount: number | null;
  waitingMoneyUnit: string | null;
  waitingMoneySchedule: string | null;
  usageTypes: string[];
  usageTypesWithSize: Array<{ id: string; sizeSqm: string }> | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lessor: Lessor;
  plots: Plot[];
}

// Constants
const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRING: "bg-yellow-100 text-yellow-800",
  EXPIRED: "bg-red-100 text-red-800",
  TERMINATED: "bg-gray-100 text-gray-800",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Entwurf",
  ACTIVE: "Aktiv",
  EXPIRING: "Läuft aus",
  EXPIRED: "Abgelaufen",
  TERMINATED: "Gekuendigt",
};

const areaTypeLabels: Record<string, string> = {
  WEA_STANDORT: "WEA-Standort",
  POOL: "Poolflaeche",
  WEG: "Wegflaeche",
  AUSGLEICH: "Ausgleichsflaeche",
  KABEL: "Kabeltrasse",
};

const compensationTypeLabels: Record<string, string> = {
  ANNUAL: "Jährlich",
  ONE_TIME: "Einmalig",
};

interface LeaseDialogsProps {
  onSuccess?: () => void;
  isDetailOpen: boolean;
  setIsDetailOpen: (open: boolean) => void;
  viewingLease: LeaseBasic | null;
}

export function LeaseDialogs({
  onSuccess,
  isDetailOpen,
  setIsDetailOpen,
  viewingLease,
}: LeaseDialogsProps) {
  return (
    <>
      <LeaseDetailDialog
        lease={viewingLease}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onSuccess={onSuccess}
      />
    </>
  );
}

// Detail Dialog
interface LeaseDetailDialogProps {
  lease: LeaseBasic | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function LeaseDetailDialog({
  lease,
  open,
  onOpenChange,
  onSuccess,
}: LeaseDetailDialogProps) {
  const [leaseDetail, setLeaseDetail] = useState<LeaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Plot area editing state
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [newArea, setNewArea] = useState({
    areaType: "WEA_STANDORT",
    areaSqm: "",
    lengthM: "",
    compensationType: "ANNUAL",
    compensationFixedAmount: "",
    compensationPercentage: "",
    notes: "",
  });
  const [savingArea, setSavingArea] = useState(false);
  const [deleteAreaId, setDeleteAreaId] = useState<string | null>(null);

  useEffect(() => {
    if (open && lease) {
      fetchLeaseDetail();
      setActiveTab("details");
    }
  }, [open, lease?.id]);

  async function fetchLeaseDetail() {
    if (!lease) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/leases/${lease.id}`);
      if (!response.ok) throw new Error("Fehler beim Laden");
      const data = await response.json();
      setLeaseDetail(data);
    } catch {
      toast.error("Fehler beim Laden der Details");
    } finally {
      setLoading(false);
    }
  }

  function getLessorName(): string {
    if (!leaseDetail) return "-";
    if (leaseDetail.lessor.personType === "legal") {
      return leaseDetail.lessor.companyName || "-";
    }
    return (
      [leaseDetail.lessor.firstName, leaseDetail.lessor.lastName]
        .filter(Boolean)
        .join(" ") || "-"
    );
  }

  function getPlotLabel(plot: Plot): string {
    const parts = [
      plot.cadastralDistrict,
      plot.fieldNumber && plot.fieldNumber !== "0"
        ? `Flur ${plot.fieldNumber}`
        : null,
      plot.plotNumber ? `Flurstueck ${plot.plotNumber}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Unbekannt";
  }

  function getDaysUntilEnd(): number | null {
    if (!leaseDetail?.endDate) return null;
    return differenceInDays(new Date(leaseDetail.endDate), new Date());
  }

  async function handleAddPlotArea(plotId: string) {
    setSavingArea(true);
    try {
      const payload: Record<string, unknown> = {
        areaType: newArea.areaType,
        compensationType: newArea.compensationType,
      };

      if (newArea.areaType === "KABEL") {
        if (newArea.lengthM) payload.lengthM = parseFloat(newArea.lengthM);
      } else {
        if (newArea.areaSqm) payload.areaSqm = parseFloat(newArea.areaSqm);
      }

      if (newArea.compensationFixedAmount) {
        payload.compensationFixedAmount = parseFloat(newArea.compensationFixedAmount);
      }
      if (newArea.compensationPercentage) {
        payload.compensationPercentage = parseFloat(newArea.compensationPercentage);
      }
      if (newArea.notes) payload.notes = newArea.notes;

      const response = await fetch(`/api/plots/${plotId}/areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen");
      }

      toast.success("Teilflaeche hinzugefügt");
      setIsAddingArea(false);
      setEditingPlotId(null);
      setNewArea({
        areaType: "WEA_STANDORT",
        areaSqm: "",
        lengthM: "",
        compensationType: "ANNUAL",
        compensationFixedAmount: "",
        compensationPercentage: "",
        notes: "",
      });
      fetchLeaseDetail();
      onSuccess?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen"
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

      if (!response.ok) {
        throw new Error("Fehler beim Löschen");
      }

      toast.success("Teilflaeche gelöscht");
      setDeleteAreaId(null);
      fetchLeaseDetail();
      onSuccess?.();
    } catch {
      toast.error("Fehler beim Löschen der Teilflaeche");
    }
  }

  if (!lease) return null;

  const daysUntilEnd = leaseDetail ? getDaysUntilEnd() : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl">
                {leaseDetail?.contractNumber || "Pachtvertrag"}
              </DialogTitle>
              <Badge
                variant="secondary"
                className={statusColors[lease.status] || ""}
              >
                {statusLabels[lease.status] || lease.status}
              </Badge>
            </div>
            <DialogDescription>
              {loading
                ? "Lade Details..."
                : `${getLessorName()} - ${leaseDetail?.plots?.length || 0} Flurstueck${(leaseDetail?.plots?.length || 0) !== 1 ? "e" : ""}`}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : leaseDetail ? (
            <>
              {/* Warning Banner */}
              {daysUntilEnd !== null &&
                daysUntilEnd > 0 &&
                daysUntilEnd <= 90 && (
                  <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="font-medium text-yellow-800 text-sm">
                        Vertrag läuft in {daysUntilEnd} Tagen aus
                      </p>
                    </div>
                  </div>
                )}

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="plots">
                    Flurstuecke ({leaseDetail.plots?.length || 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4 space-y-6">
                  {/* Verpaechter */}
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Verpaechter
                    </h4>
                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="font-medium">{getLessorName()}</p>
                      {leaseDetail.lessor.email && (
                        <p className="text-sm text-muted-foreground">
                          {leaseDetail.lessor.email}
                        </p>
                      )}
                      {leaseDetail.lessor.phone && (
                        <p className="text-sm text-muted-foreground">
                          {leaseDetail.lessor.phone}
                        </p>
                      )}
                      {(leaseDetail.lessor.street || leaseDetail.lessor.city) && (
                        <p className="text-sm text-muted-foreground">
                          {[
                            leaseDetail.lessor.street,
                            leaseDetail.lessor.postalCode,
                            leaseDetail.lessor.city,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      {leaseDetail.lessor.bankIban && (
                        <div className="pt-2 border-t mt-2">
                          <p className="text-xs text-muted-foreground">
                            Bankverbindung
                          </p>
                          <p className="font-mono text-sm">
                            {leaseDetail.lessor.bankIban}
                          </p>
                          {leaseDetail.lessor.bankName && (
                            <p className="text-xs text-muted-foreground">
                              {leaseDetail.lessor.bankName}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vertragslaufzeit */}
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Vertragslaufzeit
                    </h4>
                    <div className="rounded-lg border p-4">
                      <div className="grid grid-cols-2 gap-4">
                        {leaseDetail.signedDate && (
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Vertragsabschluss
                            </p>
                            <p className="font-medium">
                              {format(
                                new Date(leaseDetail.signedDate),
                                "dd.MM.yyyy",
                                { locale: de }
                              )}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Vertragsbeginn
                          </p>
                          <p className="font-medium">
                            {format(
                              new Date(leaseDetail.startDate),
                              "dd.MM.yyyy",
                              { locale: de }
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Vertragsende
                          </p>
                          <p className="font-medium">
                            {leaseDetail.endDate
                              ? format(
                                  new Date(leaseDetail.endDate),
                                  "dd.MM.yyyy",
                                  { locale: de }
                                )
                              : "Unbefristet"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Kuendigungsfrist
                          </p>
                          <p className="font-medium">
                            {leaseDetail.noticePeriodMonths} Monate
                          </p>
                        </div>
                      </div>
                      {leaseDetail.hasExtensionOption && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm text-muted-foreground">
                            Verlaengerungsoption
                          </p>
                          <p className="text-sm">
                            {leaseDetail.extensionDetails || "Ja"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Wartegeld */}
                  {leaseDetail.hasWaitingMoney && (
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <Euro className="h-4 w-4" />
                        Wartegeld
                      </h4>
                      <div className="rounded-lg border p-4">
                        <p className="font-medium">
                          {formatCurrency(leaseDetail.waitingMoneyAmount)}{" "}
                          {leaseDetail.waitingMoneyUnit === "ha"
                            ? "pro ha"
                            : "pauschal"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {leaseDetail.waitingMoneySchedule === "once"
                            ? "Einmalig"
                            : leaseDetail.waitingMoneySchedule === "monthly"
                              ? "Monatlich"
                              : "Jährlich"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Nutzungsarten */}
                  {leaseDetail.usageTypesWithSize &&
                    leaseDetail.usageTypesWithSize.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-medium flex items-center gap-2">
                          <Layers className="h-4 w-4" />
                          Nutzungsarten
                        </h4>
                        <div className="rounded-lg border p-4">
                          <div className="flex flex-wrap gap-2">
                            {leaseDetail.usageTypesWithSize.map((usage) => (
                              <Badge key={usage.id} variant="outline">
                                {areaTypeLabels[usage.id] || usage.id}
                                {usage.sizeSqm && (
                                  <span className="ml-1 text-muted-foreground">
                                    (
                                    {usage.id === "KABEL"
                                      ? `${parseFloat(usage.sizeSqm).toLocaleString("de-DE")} m`
                                      : `${(parseFloat(usage.sizeSqm) / 10000).toFixed(2)} ha`}
                                    )
                                  </span>
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Notizen */}
                  {leaseDetail.notes && (
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Notizen
                      </h4>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm whitespace-pre-wrap">
                          {leaseDetail.notes}
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="plots" className="mt-4 space-y-4">
                  {leaseDetail.plots && leaseDetail.plots.length > 0 ? (
                    leaseDetail.plots.map((plot) => (
                      <div key={plot.id} className="rounded-lg border">
                        {/* Plot Header */}
                        <div className="p-4 border-b bg-muted/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                {getPlotLabel(plot)}
                              </h4>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                {plot.areaSqm && (
                                  <span>
                                    {(Number(plot.areaSqm) / 10000).toFixed(2)}{" "}
                                    ha
                                  </span>
                                )}
                                {plot.park && (
                                  <span className="flex items-center gap-1">
                                    <Wind className="h-3 w-3" />
                                    {plot.park.shortName || plot.park.name}
                                  </span>
                                )}
                                {plot.municipality && (
                                  <span>{plot.municipality}</span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingPlotId(plot.id);
                                setIsAddingArea(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Teilflaeche
                            </Button>
                          </div>
                        </div>

                        {/* Plot Areas */}
                        <div className="p-4">
                          {plot.plotAreas && plot.plotAreas.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Typ</TableHead>
                                  <TableHead className="text-right">
                                    Flaeche/Laenge
                                  </TableHead>
                                  <TableHead>Entschaedigung</TableHead>
                                  <TableHead className="text-right">
                                    Betrag
                                  </TableHead>
                                  <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {plot.plotAreas.map((area) => (
                                  <TableRow key={area.id}>
                                    <TableCell>
                                      <Badge variant="outline">
                                        {areaTypeLabels[area.areaType] ||
                                          area.areaType}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {area.areaType === "KABEL"
                                        ? area.lengthM
                                          ? `${Number(area.lengthM).toLocaleString("de-DE")} m`
                                          : "-"
                                        : area.areaSqm
                                          ? `${Number(area.areaSqm).toLocaleString("de-DE")} m²`
                                          : "-"}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant={
                                          area.compensationType === "ANNUAL"
                                            ? "default"
                                            : "secondary"
                                        }
                                      >
                                        {compensationTypeLabels[
                                          area.compensationType
                                        ] || area.compensationType}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {area.compensationFixedAmount
                                        ? formatCurrency(
                                            Number(area.compensationFixedAmount)
                                          )
                                        : area.compensationPercentage
                                          ? `${area.compensationPercentage}%`
                                          : "-"}
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={() =>
                                          setDeleteAreaId(
                                            `${plot.id}:${area.id}`
                                          )
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Keine Teilflaechen definiert
                            </p>
                          )}

                          {/* Add Area Form */}
                          {editingPlotId === plot.id && isAddingArea && (
                            <div className="mt-4 p-4 border rounded-lg bg-muted/30 space-y-4">
                              <h5 className="font-medium text-sm">
                                Neue Teilflaeche hinzufügen
                              </h5>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Typ *</Label>
                                  <Select
                                    value={newArea.areaType}
                                    onValueChange={(v) =>
                                      setNewArea({ ...newArea, areaType: v })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(areaTypeLabels).map(
                                        ([key, label]) => (
                                          <SelectItem key={key} value={key}>
                                            {label}
                                          </SelectItem>
                                        )
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>
                                    {newArea.areaType === "KABEL"
                                      ? "Laenge (m)"
                                      : "Flaeche (m²)"}
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={
                                      newArea.areaType === "KABEL"
                                        ? newArea.lengthM
                                        : newArea.areaSqm
                                    }
                                    onChange={(e) =>
                                      setNewArea({
                                        ...newArea,
                                        [newArea.areaType === "KABEL"
                                          ? "lengthM"
                                          : "areaSqm"]: e.target.value,
                                      })
                                    }
                                    placeholder="z.B. 1500"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Entschaedigungsart</Label>
                                  <Select
                                    value={newArea.compensationType}
                                    onValueChange={(v) =>
                                      setNewArea({
                                        ...newArea,
                                        compensationType: v,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="ANNUAL">
                                        Jährlich
                                      </SelectItem>
                                      <SelectItem value="ONE_TIME">
                                        Einmalig
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Fixer Betrag (EUR)</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={newArea.compensationFixedAmount}
                                    onChange={(e) =>
                                      setNewArea({
                                        ...newArea,
                                        compensationFixedAmount: e.target.value,
                                      })
                                    }
                                    placeholder="z.B. 500.00"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleAddPlotArea(plot.id)}
                                  disabled={savingArea}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  {savingArea ? "Speichern..." : "Hinzufügen"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setIsAddingArea(false);
                                    setEditingPlotId(null);
                                  }}
                                >
                                  Abbrechen
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Keine Flurstuecke zugeordnet</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete Area Confirmation */}
      <AlertDialog
        open={!!deleteAreaId}
        onOpenChange={() => setDeleteAreaId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Teilflaeche löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rueckgaengig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteAreaId) {
                  const [plotId, areaId] = deleteAreaId.split(":");
                  handleDeletePlotArea(plotId, areaId);
                }
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
