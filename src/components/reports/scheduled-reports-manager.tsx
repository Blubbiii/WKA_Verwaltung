"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Plus,
  Loader2,
  Trash2,
  Calendar,
  Mail,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  X,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DeleteConfirmDialog,
} from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";

// ===========================================
// TYPES
// ===========================================

interface ScheduledReport {
  id: string;
  name: string;
  reportType: string;
  schedule: string;
  recipients: string[];
  config: {
    parkId?: string;
    fundId?: string;
    modules?: string[];
    format?: string;
  };
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}

interface Park {
  id: string;
  name: string;
}

interface Fund {
  id: string;
  name: string;
}

// ===========================================
// CONSTANTS
// ===========================================

const REPORT_TYPE_LABELS: Record<string, string> = {
  MONTHLY_PRODUCTION: "Monatliche Produktion",
  QUARTERLY_FINANCIAL: "Quartalsweise Finanzen",
  ANNUAL_SUMMARY: "Jahresübersicht",
  CUSTOM: "Benutzerdefiniert",
};

const SCHEDULE_LABELS: Record<string, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Quartalsweise",
  ANNUALLY: "Jährlich",
};

// ===========================================
// COMPONENT
// ===========================================

export function ScheduledReportsManager() {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [parks, setParks] = useState<Park[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingReport, setDeletingReport] = useState<ScheduledReport | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formReportType, setFormReportType] = useState("MONTHLY_PRODUCTION");
  const [formSchedule, setFormSchedule] = useState("MONTHLY");
  const [formParkId, setFormParkId] = useState("");
  const [formFundId, setFormFundId] = useState("");
  const [formRecipients, setFormRecipients] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  // ===========================================
  // DATA FETCHING
  // ===========================================

  const fetchReports = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/scheduled-reports");
      if (response.ok) {
        const data = await response.json();
        setReports(data.data || []);
      }
    } catch {
      toast.error("Fehler beim Laden der geplanten Berichte");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFilters = useCallback(async () => {
    try {
      const [parksRes, fundsRes] = await Promise.all([
        fetch("/api/parks?limit=100"),
        fetch("/api/funds?limit=100"),
      ]);

      if (parksRes.ok) {
        const data = await parksRes.json();
        setParks(data.data || []);
      }

      if (fundsRes.ok) {
        const data = await fundsRes.json();
        setFunds(data.data || []);
      }
    } catch {
      // Non-critical - filters just won't be available
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchFilters();
  }, [fetchReports, fetchFilters]);

  // ===========================================
  // ACTIONS
  // ===========================================

  function resetForm() {
    setFormName("");
    setFormReportType("MONTHLY_PRODUCTION");
    setFormSchedule("MONTHLY");
    setFormParkId("");
    setFormFundId("");
    setFormRecipients("");
    setFormEnabled(true);
  }

  async function handleCreate() {
    // Validate
    if (!formName.trim()) {
      toast.error("Bitte geben Sie einen Namen ein");
      return;
    }

    const recipientList = formRecipients
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (recipientList.length === 0) {
      toast.error("Bitte geben Sie mindestens eine E-Mail-Adresse ein");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipientList.filter((e) => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      toast.error(`Ungültige E-Mail-Adresse(n): ${invalidEmails.join(", ")}`);
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin/scheduled-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          reportType: formReportType,
          schedule: formSchedule,
          recipients: recipientList,
          config: {
            ...(formParkId && { parkId: formParkId }),
            ...(formFundId && { fundId: formFundId }),
          },
          enabled: formEnabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || "Fehler beim Erstellen"
        );
      }

      toast.success("Geplanter Bericht wurde erstellt");
      setDialogOpen(false);
      resetForm();
      fetchReports();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen des geplanten Berichts"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(report: ScheduledReport) {
    setTogglingId(report.id);

    try {
      const response = await fetch(
        `/api/admin/scheduled-reports/${report.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !report.enabled }),
        }
      );

      if (!response.ok) {
        throw new Error("Fehler beim Aktualisieren");
      }

      // Update local state
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, enabled: !r.enabled } : r
        )
      );

      toast.success(
        report.enabled
          ? "Geplanter Bericht deaktiviert"
          : "Geplanter Bericht aktiviert"
      );
    } catch {
      toast.error("Fehler beim Aktualisieren des Status");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deletingReport) return;

    try {
      const response = await fetch(
        `/api/admin/scheduled-reports/${deletingReport.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Fehler beim Löschen");
      }

      toast.success("Geplanter Bericht wurde gelöscht");
      setDeleteDialogOpen(false);
      setDeletingReport(null);
      fetchReports();
    } catch {
      toast.error("Fehler beim Löschen des geplanten Berichts");
    }
  }

  // ===========================================
  // HELPERS
  // ===========================================

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getParkName(parkId?: string): string {
    if (!parkId) return "Alle";
    const park = parks.find((p) => p.id === parkId);
    return park?.name || parkId;
  }

  // ===========================================
  // RENDER
  // ===========================================

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Geplante Berichte
            </CardTitle>
            <CardDescription>
              Automatische Berichterstellung nach Zeitplan. Berichte werden
              generiert und per E-Mail an die Empfänger versendet.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Neuen geplanten Bericht erstellen
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Neuen geplanten Bericht erstellen</DialogTitle>
                <DialogDescription>
                  Konfigurieren Sie einen automatisch generierten Bericht.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                {/* Name */}
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="z.B. Monatsbericht WP Norddeich"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                {/* Report Type */}
                <div className="grid gap-2">
                  <Label>Berichtstyp</Label>
                  <Select
                    value={formReportType}
                    onValueChange={setFormReportType}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REPORT_TYPE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Schedule */}
                <div className="grid gap-2">
                  <Label>Zeitplan</Label>
                  <Select
                    value={formSchedule}
                    onValueChange={setFormSchedule}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SCHEDULE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Park Filter */}
                <div className="grid gap-2">
                  <Label>Windpark</Label>
                  <Select value={formParkId} onValueChange={setFormParkId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Windpark auswaehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {parks.map((park) => (
                        <SelectItem key={park.id} value={park.id}>
                          {park.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fund Filter (optional) */}
                <div className="grid gap-2">
                  <Label>Gesellschaft (optional)</Label>
                  <Select value={formFundId} onValueChange={setFormFundId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Alle Gesellschaften" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        Alle Gesellschaften
                      </SelectItem>
                      {funds.map((fund) => (
                        <SelectItem key={fund.id} value={fund.id}>
                          {fund.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Recipients */}
                <div className="grid gap-2">
                  <Label htmlFor="recipients">
                    Empfänger (E-Mail-Adressen, kommagetrennt)
                  </Label>
                  <Input
                    id="recipients"
                    placeholder="max@example.com, anna@example.com"
                    value={formRecipients}
                    onChange={(e) => setFormRecipients(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mehrere E-Mail-Adressen mit Komma trennen.
                  </p>
                </div>

                {/* Enabled */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="enabled">Sofort aktivieren</Label>
                  <Switch
                    id="enabled"
                    checked={formEnabled}
                    onCheckedChange={setFormEnabled}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Erstellen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium">
              Keine geplanten Berichte vorhanden
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Erstellen Sie einen geplanten Bericht, um automatisch Berichte
              generieren und per E-Mail versenden zu lassen.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Zeitplan</TableHead>
                  <TableHead>Park</TableHead>
                  <TableHead>Empfänger</TableHead>
                  <TableHead>Letzte Ausführung</TableHead>
                  <TableHead>Nächste Ausführung</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      {report.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {REPORT_TYPE_LABELS[report.reportType] ||
                          report.reportType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {SCHEDULE_LABELS[report.schedule] || report.schedule}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getParkName(report.config?.parkId)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {report.recipients.length}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {report.lastRunAt ? (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          {formatDate(report.lastRunAt)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">
                          Noch nicht ausgeführt
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {report.enabled ? (
                        formatDate(report.nextRunAt)
                      ) : (
                        <span className="text-muted-foreground/60">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={report.enabled}
                          onCheckedChange={() => handleToggleEnabled(report)}
                          disabled={togglingId === report.id}
                        />
                        {report.enabled ? (
                          <Badge
                            variant="default"
                            className="bg-green-100 text-green-800 hover:bg-green-100"
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Aktiv
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Pause className="h-3 w-3 mr-1" />
                            Pausiert
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeletingReport(report);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Geplanten Bericht löschen"
        description={`Möchten Sie den geplanten Bericht "${deletingReport?.name}" wirklich löschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`}
      />
    </Card>
  );
}
