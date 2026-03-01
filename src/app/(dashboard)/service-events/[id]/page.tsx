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
  Wrench,
  Calendar,
  Clock,
  Euro,
  Building2,
  FileText,
  Plus,
  Trash2,
  Download,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
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

interface Document {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileUrl: string;
  createdAt: string;
}

interface ServiceEvent {
  id: string;
  eventDate: string;
  eventType: string;
  description: string | null;
  durationHours: number | null;
  cost: number | null;
  performedBy: string | null;
  notes: string | null;
  createdAt: string;
  turbine: {
    id: string;
    designation: string;
    park: {
      id: string;
      name: string;
      shortName: string | null;
    };
  };
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  documents: Document[];
  _count: {
    documents: number;
  };
}

const eventTypeLabels: Record<string, string> = {
  MAINTENANCE: "Wartung",
  REPAIR: "Reparatur",
  INSPECTION: "Inspektion",
  BLADE_INSPECTION: "Rotorblatt-Inspektion",
  GEARBOX_SERVICE: "Getriebe-Service",
  GENERATOR_SERVICE: "Generator-Service",
  SOFTWARE_UPDATE: "Software-Update",
  EMERGENCY: "Notfall",
  OTHER: "Sonstiges",
};

const eventTypeColors: Record<string, string> = {
  MAINTENANCE: "bg-blue-100 text-blue-800",
  REPAIR: "bg-orange-100 text-orange-800",
  INSPECTION: "bg-green-100 text-green-800",
  BLADE_INSPECTION: "bg-purple-100 text-purple-800",
  GEARBOX_SERVICE: "bg-yellow-100 text-yellow-800",
  GENERATOR_SERVICE: "bg-cyan-100 text-cyan-800",
  SOFTWARE_UPDATE: "bg-indigo-100 text-indigo-800",
  EMERGENCY: "bg-red-100 text-red-800",
  OTHER: "bg-gray-100 text-gray-800",
};

export default function ServiceEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<ServiceEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchEvent();
  }, [id]);

  async function fetchEvent() {
    try {
      setLoading(true);
      const response = await fetch(`/api/service-events/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError("Service-Event nicht gefunden");
        } else {
          throw new Error("Fehler beim Laden");
        }
        return;
      }
      const data = await response.json();
      setEvent(data);
    } catch (err) {
      setError("Fehler beim Laden des Service-Events");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!event) return;

    try {
      setIsDeleting(true);
      const response = await fetch(`/api/service-events/${event.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Navigate back to park page after successful deletion
        router.push(`/parks/${event.turbine.park.id}?tab=turbines`);
      } else {
        const error = await response.json();
        toast.error(error.error || "Fehler beim Löschen");
      }
    } catch (err) {
      toast.error("Fehler beim Löschen des Service-Events");
    } finally {
      setIsDeleting(false);
    }
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

  if (error || !event) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg text-muted-foreground">{error}</p>
        <Button asChild className="mt-4">
          <Link href="/parks">Zurück zu Windparks</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/parks/${event.turbine.park.id}?tab=turbines`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                Service-Event
              </h1>
              <Badge
                variant="secondary"
                className={eventTypeColors[event.eventType] || "bg-gray-100"}
              >
                {eventTypeLabels[event.eventType] || event.eventType}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              <Link
                href={`/parks/${event.turbine.park.id}?tab=turbines`}
                className="text-primary hover:underline"
              >
                {event.turbine.designation}
              </Link>
              {" | "}
              <Link
                href={`/parks/${event.turbine.park.id}`}
                className="text-primary hover:underline"
              >
                {event.turbine.park.name}
              </Link>
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/service-events/${id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Bearbeiten
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDeleteDialogOpen(true)}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Datum</CardTitle>
              <InfoTooltip text="Zeitpunkt des Service-Ereignisses." />
            </div>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {format(new Date(event.eventDate), "dd.MM.yyyy", { locale: de })}
            </div>
            <p className="text-xs text-muted-foreground">Event-Datum</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Dauer</CardTitle>
              <InfoTooltip text="Gesamtdauer des Service-Einsatzes." />
            </div>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {event.durationHours ? `${event.durationHours} h` : "-"}
            </div>
            <p className="text-xs text-muted-foreground">Arbeitsstunden</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Kosten</CardTitle>
              <InfoTooltip text="Entstandene Kosten für diesen Service-Einsatz." />
            </div>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {event.cost ? formatCurrency(event.cost) : "-"}
            </div>
            <p className="text-xs text-muted-foreground">Gesamtkosten</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Dokumente</CardTitle>
              <InfoTooltip text="Zum Service-Ereignis gehörende Protokolle und Berichte." />
            </div>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{event._count.documents}</div>
            <p className="text-xs text-muted-foreground">Angehängt</p>
          </CardContent>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Event Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Event-Details
              <InfoTooltip text="Beschreibung, betroffene Anlage und Kategorie des Ereignisses." />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Typ</p>
                <Badge
                  variant="secondary"
                  className={eventTypeColors[event.eventType] || "bg-gray-100"}
                >
                  {eventTypeLabels[event.eventType] || event.eventType}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Durchgeführt von
                </p>
                <div className="flex items-center gap-1">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{event.performedBy || "-"}</span>
                </div>
              </div>
            </div>
            {event.description && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Beschreibung
                  </p>
                  <p className="mt-1">{event.description}</p>
                </div>
              </>
            )}
            {event.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Notizen
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{event.notes}</p>
                </div>
              </>
            )}
            <Separator />
            <div className="text-xs text-muted-foreground">
              Erstellt am{" "}
              {format(new Date(event.createdAt), "dd.MM.yyyy HH:mm", {
                locale: de,
              })}
              {event.createdBy &&
                ` von ${[event.createdBy.firstName, event.createdBy.lastName].filter(Boolean).join(" ")}`}
            </div>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Dokumente
                <InfoTooltip text="Zum Service-Ereignis gehörende Protokolle und Berichte." />
              </CardTitle>
              <CardDescription>
                Protokolle, Berichte und andere Dokumente
              </CardDescription>
            </div>
            <Button asChild>
              <Link href={`/documents/upload?serviceEventId=${id}`}>
                <Plus className="mr-2 h-4 w-4" />
                Hochladen
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {event.documents.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 opacity-50" />
                <p className="mt-2">Keine Dokumente vorhanden</p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href={`/documents/upload?serviceEventId=${id}`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Dokument hinzufügen
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {event.documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(doc.createdAt), "dd.MM.yyyy", {
                          locale: de,
                        })}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild>
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-4 w-4" />
                          </a>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Service-Event unwiderruflich löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diesen Eintrag wirklich unwiderruflich löschen?
              <span className="mt-2 block font-medium text-foreground">
                {eventTypeLabels[event.eventType] || event.eventType} - {event.turbine.designation}
              </span>
              <span className="mt-2 block text-red-600">
                Diese Aktion kann nicht rückgängig gemacht werden.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Wird gelöscht..." : "Unwiderruflich löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
