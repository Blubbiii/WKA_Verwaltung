"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Building2,
  CalendarIcon,
  Loader2,
  Zap,
  MapPin,
  Wrench,
  FileText,
  Upload,
  Download,
  Eye,
  QrCode,
  Clock,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { DocumentPreviewDialog } from "@/components/documents";
import { TurbineQrCodeTab } from "@/components/parks/TurbineQrCodeTab";
import dynamic from "next/dynamic";

const OperatingStateTimeline = dynamic(
  () => import("@/components/energy/analytics/operating-state-timeline").then(mod => mod.OperatingStateTimeline),
  { ssr: false }
);
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Turbine, TurbineDetail, TurbineDocument } from "./types";
import {
  deviceTypeLabels,
  statusColors,
  statusLabels,
  eventTypeLabels,
  eventStatusLabels,
  eventStatusColors,
  formatCapacity,
} from "./types";

interface TurbineDetailDialogProps {
  turbine: Turbine | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onEdit: () => void;
}

export function TurbineDetailDialog({
  turbine,
  isOpen,
  setIsOpen,
  onEdit,
}: TurbineDetailDialogProps) {
  const [turbineDetail, setTurbineDetail] = useState<TurbineDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<TurbineDocument | null>(null);

  useEffect(() => {
    if (isOpen && turbine) {
      fetchTurbineDetail();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <TabsTrigger value="checkins">
                <Clock className="h-4 w-4 mr-1" />
                Check-Ins ({turbineDetail?._count?.technicianSessions || 0})
              </TabsTrigger>
              <TabsTrigger value="qrcode">
                <QrCode className="h-4 w-4 mr-1" />
                QR-Code
              </TabsTrigger>
              <TabsTrigger value="operating-states">
                <Activity className="h-4 w-4 mr-1" />
                Betriebszustände
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
                    <p className="text-sm text-muted-foreground">Geraetetyp</p>
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
                          <p className="text-sm text-muted-foreground">Technische Betriebsfuehrung</p>
                          <p className="font-medium">{turbineDetail?.technischeBetriebsfuehrung || "-"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Kaufmaennische Betriebsfuehrung</p>
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

              {/* Notizen */}
              {turbine.notes && (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Notizen
                  </h4>
                  <div className="rounded-lg border p-4">
                    <p className="whitespace-pre-wrap text-sm">{turbine.notes}</p>
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
                      <p className="text-xs text-muted-foreground">Vertraege</p>
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

            {/* Check-Ins Tab */}
            <TabsContent value="checkins" className="mt-4">
              {!turbineDetail?.technicianSessions || turbineDetail.technicianSessions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Clock className="mx-auto h-12 w-12 opacity-50 mb-4" />
                  <p>Keine Techniker-Check-Ins vorhanden</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Techniker</TableHead>
                      <TableHead>Firma</TableHead>
                      <TableHead>Einchecken</TableHead>
                      <TableHead>Auschecken</TableHead>
                      <TableHead>Dauer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {turbineDetail.technicianSessions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.technicianName}</TableCell>
                        <TableCell>{s.companyName}</TableCell>
                        <TableCell>
                          {format(new Date(s.checkInAt), "dd.MM.yyyy HH:mm", { locale: de })}
                        </TableCell>
                        <TableCell>
                          {s.checkOutAt
                            ? format(new Date(s.checkOutAt), "dd.MM.yyyy HH:mm", { locale: de })
                            : <Badge variant="secondary" className="bg-green-100 text-green-800">Aktiv</Badge>
                          }
                        </TableCell>
                        <TableCell>
                          {s.durationMinutes != null
                            ? `${Math.floor(s.durationMinutes / 60)}h ${s.durationMinutes % 60}m`
                            : "-"
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* QR-Code Tab */}
            <TabsContent value="qrcode" className="mt-4">
              <TurbineQrCodeTab
                turbineId={turbine.id}
                qrToken={turbineDetail?.qrToken ?? null}
                turbineDesignation={turbine.designation}
                parkName={turbineDetail?.park?.name}
                onTokenChanged={fetchTurbineDetail}
              />
            </TabsContent>

            <TabsContent value="operating-states" className="mt-4">
              <OperatingStateTimeline
                turbineId={turbine.id}
                turbineDesignation={turbine.designation}
              />
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
