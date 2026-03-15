"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateTime } from "@/lib/format";
import {
  Archive,
  Download,
  Trash2,
  Search,
  FileText,
  FileSpreadsheet,
  File,
  Calendar,
  User,
  HardDrive,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
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

// =============================================================================
// Types
// =============================================================================

interface ArchivedReport {
  id: string;
  title: string;
  reportType: string;
  format: string;
  fileUrl: string;
  fileSize: number;
  parameters: Record<string, unknown> | null;
  generatedAt: string;
  generatedBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}

interface ArchiveStats {
  totalReports: number;
  totalSizeBytes: number;
  byType: Array<{ type: string; typeName: string; count: number }>;
  byFormat: Array<{ format: string; count: number }>;
}

const reportTypeLabels: Record<string, string> = {
  MONTHLY: "Monatsbericht",
  QUARTERLY: "Quartalsbericht",
  ANNUAL: "Jahresbericht",
  SHAREHOLDERS: "Gesellschafterbericht",
  SETTLEMENT: "Pachtabrechnung",
  CUSTOM: "Benutzerdefiniert",
};

const formatIcons: Record<string, React.ElementType> = {
  PDF: FileText,
  XLSX: FileSpreadsheet,
  CSV: File,
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getUserDisplayName(user: ArchivedReport["generatedBy"]): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }
  return user.email;
}

// =============================================================================
// Component
// =============================================================================

export function ReportArchiveTab() {
  const { data: session } = useSession();
  const [reports, setReports] = useState<ArchivedReport[]>([]);
  const [stats, setStats] = useState<ArchiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<ArchivedReport | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [reportType, setReportType] = useState("all");
  const [format, setFormat] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const isAdmin =
    (session?.user?.roleHierarchy ?? 0) >= 80 ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "SUPERADMIN";

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        includeStats: "true",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (reportType !== "all") params.set("reportType", reportType);
      if (format !== "all") params.set("format", format);

      const response = await fetch(`/api/reports/archive?${params}`);
      if (!response.ok) throw new Error("Fehler beim Laden");

      const data = await response.json();
      setReports(data.data);
      setTotal(data.total);
      if (data.stats) setStats(data.stats);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, reportType, format]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function handleDownload(report: ArchivedReport) {
    try {
      setDownloading(report.id);
      const response = await fetch(`/api/reports/archive/${report.id}`);
      if (!response.ok) throw new Error("Fehler beim Abrufen");
      const data = await response.json();
      const link = document.createElement("a");
      link.href = data.report.downloadUrl;
      link.download = `${report.title}.${report.format.toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error("Fehler beim Herunterladen des Reports");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!reportToDelete) return;
    try {
      setDeleting(reportToDelete.id);
      const response = await fetch(`/api/reports/archive/${reportToDelete.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Loeschen");
      }
      await fetchReports();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Loeschen");
    } finally {
      setDeleting(null);
      setDeleteDialogOpen(false);
      setReportToDelete(null);
    }
  }

  const hasActiveFilters = search !== "" || reportType !== "all" || format !== "all";
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Archivierte Berichte</CardTitle>
              <Archive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalReports}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Speicherplatz</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatFileSize(stats.totalSizeBytes)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Berichtsarten</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Formate</CardTitle>
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {stats.byFormat.map((f) => (
                  <Badge key={f.format} variant="secondary">
                    {f.format}: {f.count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search & Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Suche & Filter</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? "Filter ausblenden" : "Filter anzeigen"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); setPage(1); }} className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="Nach Titel suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={loading}>
                <Search className="h-4 w-4 mr-2" />
                Suchen
              </Button>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setSearch(""); setReportType("all"); setFormat("all"); setPage(1); }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Zuruecksetzen
                </Button>
              )}
            </div>
            {showFilters && (
              <div className="flex gap-4 pt-4 border-t">
                <div className="w-64">
                  <label className="text-sm font-medium mb-2 block">Berichtsart</label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger><SelectValue placeholder="Alle Arten" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Arten</SelectItem>
                      {Object.entries(reportTypeLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-48">
                  <label className="text-sm font-medium mb-2 block">Format</label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger><SelectValue placeholder="Alle Formate" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Formate</SelectItem>
                      <SelectItem value="PDF">PDF</SelectItem>
                      <SelectItem value="XLSX">Excel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Reports table */}
      <Card>
        <CardHeader>
          <CardTitle>Archivierte Berichte</CardTitle>
          <CardDescription>{total} {total === 1 ? "Bericht" : "Berichte"} gefunden</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Keine Berichte gefunden</p>
              <p className="text-sm">
                {hasActiveFilters
                  ? "Versuchen Sie es mit anderen Filtereinstellungen"
                  : "Es wurden noch keine Berichte archiviert"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Erstellt von</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Groesse</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => {
                    const FormatIcon = formatIcons[report.format] || File;
                    return (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium">{report.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {reportTypeLabels[report.reportType] || report.reportType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FormatIcon className="h-4 w-4" />
                            {report.format}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {getUserDisplayName(report.generatedBy)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatDateTime(report.generatedAt)}
                          </div>
                        </TableCell>
                        <TableCell>{formatFileSize(report.fileSize)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(report)}
                              disabled={downloading === report.id}
                            >
                              {downloading === report.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => { setReportToDelete(report); setDeleteDialogOpen(true); }}
                                disabled={deleting === report.id}
                              >
                                {deleting === report.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">Seite {page} von {totalPages}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Zurueck
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || loading}
                    >
                      Weiter
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bericht loeschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher, dass Sie den Bericht &quot;{reportToDelete?.title}&quot; loeschen moechten?
              Diese Aktion kann nicht rueckgaengig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Loeschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
