"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Trash2,
  BookMarked,
  Loader2,
  Plus,
  Calendar,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";

// =============================================================================
// Types
// =============================================================================

interface ReportConfig {
  id: string;
  name: string;
  description: string | null;
  modules: string[];
  interval: string;
  portalVisible: boolean;
  portalLabel: string | null;
  createdAt: string;
  park: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  createdBy: { id: string; firstName: string | null; lastName: string | null } | null;
}

interface ReportConfigsTabProps {
  onCreateReport: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

const INTERVAL_LABELS: Record<string, string> = {
  day: "Täglich",
  month: "Monatlich",
  year: "Jährlich",
  hour: "Stündlich",
  "10min": "10-Minuten",
};

function intervalLabel(interval: string): string {
  return INTERVAL_LABELS[interval] ?? interval;
}

function createdByLabel(
  createdBy: ReportConfig["createdBy"]
): string {
  if (!createdBy) return "—";
  const parts = [createdBy.firstName, createdBy.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

// =============================================================================
// Component
// =============================================================================

export function ReportConfigsTab({ onCreateReport }: ReportConfigsTabProps) {
  const [configs, setConfigs] = useState<ReportConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<ReportConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/energy/reports/configs");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Laden");
      }
      const json = await res.json();
      setConfigs(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden der Vorlagen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/energy/reports/configs/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(err.error || "Fehler beim Löschen");
      }
      toast.success(`Vorlage "${deleteTarget.name}" gelöscht`);
      setDeleteTarget(null);
      fetchConfigs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Löschen der Vorlage");
    } finally {
      setDeleting(false);
    }
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Vorlagen werden geladen...</span>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-destructive">
        <p>{error}</p>
        <Button variant="outline" onClick={fetchConfigs}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  // --- Empty state ---
  if (configs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
        <BookMarked className="h-16 w-16 opacity-30" />
        <div className="text-center space-y-1">
          <p className="text-lg font-medium text-foreground">Noch keine Vorlagen gespeichert</p>
          <p className="text-sm">
            Erstellen Sie Berichts-Vorlagen, um Konfigurationen wiederzuverwenden.
          </p>
        </div>
        <Button onClick={onCreateReport} className="gap-2 mt-2">
          <Plus className="h-4 w-4" />
          Erste Vorlage erstellen
        </Button>
      </div>
    );
  }

  // --- List state ---
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Berichts-Vorlagen</CardTitle>
            <CardDescription>
              Gespeicherte Berichts-Konfigurationen für die Wiederverwendung
            </CardDescription>
          </div>
          <Button onClick={onCreateReport} className="gap-2" size="sm">
            <Plus className="h-4 w-4" />
            Vorlage erstellen
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Beschreibung</TableHead>
                <TableHead>Module</TableHead>
                <TableHead className="hidden lg:table-cell">Park</TableHead>
                <TableHead>Intervall</TableHead>
                <TableHead className="hidden xl:table-cell">
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Erstellt von
                  </span>
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Erstellt am
                  </span>
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-0.5">
                      <span>{config.name}</span>
                      {config.portalVisible && (
                        <Badge variant="secondary" className="w-fit text-xs">
                          Portal sichtbar
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-xs truncate">
                    {config.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {config.modules.length} {config.modules.length === 1 ? "Modul" : "Module"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {config.park?.name ?? (config.turbine?.designation ? config.turbine.designation : "Alle Parks")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {intervalLabel(config.interval)}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    {createdByLabel(config.createdBy)}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    {formatDateTime(config.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(config)}
                      aria-label={`Vorlage "${config.name}" löschen`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Soll die Vorlage{" "}
              <span className="font-semibold">"{deleteTarget?.name}"</span> unwiderruflich
              gelöscht werden?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
