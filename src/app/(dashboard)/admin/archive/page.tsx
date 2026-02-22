"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Archive,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Download,
  ShieldCheck,
  FileText,
  HardDrive,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileDown,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/useDebounce";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArchivedDoc {
  id: string;
  documentType: string;
  referenceId: string;
  referenceNumber: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  contentHash: string;
  chainHash: string;
  archivedAt: string;
  retentionUntil: string;
  lastAccessedAt: string | null;
  accessCount: number;
  metadata: Record<string, string> | null;
  archivedBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface ArchiveStats {
  totalDocuments: number;
  totalSizeBytes: number;
  documentsByType: Array<{ type: string; count: number }>;
  nextRetentionExpiry: { date: string; referenceNumber: string } | null;
  lastVerification: {
    date: string;
    result: string;
    totalDocs: number;
    validDocs: number;
    invalidDocs: number;
  } | null;
}

interface VerificationResult {
  passed: boolean;
  totalDocuments: number;
  validDocuments: number;
  invalidDocuments: number;
  errors: Array<{
    documentId: string;
    referenceNumber: string;
    reason: string;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOCUMENT_TYPE_OPTIONS = [
  { value: "ALL", label: "Alle Dokumenttypen" },
  { value: "INVOICE", label: "Rechnung" },
  { value: "CREDIT_NOTE", label: "Gutschrift" },
  { value: "RECEIPT", label: "Beleg" },
  { value: "CONTRACT", label: "Vertrag" },
  { value: "SETTLEMENT", label: "Abrechnung" },
];

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  INVOICE: "Rechnung",
  CREDIT_NOTE: "Gutschrift",
  RECEIPT: "Beleg",
  CONTRACT: "Vertrag",
  SETTLEMENT: "Abrechnung",
};

const DOCUMENT_TYPE_COLORS: Record<string, string> = {
  INVOICE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  CREDIT_NOTE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  RECEIPT: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  CONTRACT: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  SETTLEMENT: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUserName(user: ArchivedDoc["archivedBy"]): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }
  return user.email;
}

// ---------------------------------------------------------------------------
// Inner content component (uses useSearchParams, needs Suspense)
// ---------------------------------------------------------------------------

function ArchiveContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Data state
  const [documents, setDocuments] = useState<ArchivedDoc[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<ArchiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState(
    searchParams.get("type") || "ALL"
  );
  const [searchText, setSearchText] = useState(
    searchParams.get("search") || ""
  );
  const [yearFilter, setYearFilter] = useState(
    searchParams.get("year") || ""
  );
  const [currentPage, setCurrentPage] = useState(
    Number(searchParams.get("page")) || 1
  );

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());

  // Downloading state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchText, 400);

  // Generate year options for export (last 10 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);

  // ------ Data fetching ------

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", currentPage.toString());
      params.set("limit", "25");

      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);

      // If year filter is set (and not "ALL"), compute date range
      if (yearFilter && yearFilter !== "ALL") {
        params.set("dateFrom", `${yearFilter}-01-01`);
        params.set("dateTo", `${yearFilter}-12-31`);
      }

      const response = await fetch(`/api/admin/archive?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Laden");
      }

      const data = await response.json();
      setDocuments(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [currentPage, typeFilter, debouncedSearch, yearFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/archive?stats=true");
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch {
      // Stats are non-critical
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, debouncedSearch, yearFilter]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (yearFilter && yearFilter !== "ALL") params.set("year", yearFilter);
    if (currentPage > 1) params.set("page", currentPage.toString());

    const paramString = params.toString();
    const newUrl = paramString ? `${pathname}?${paramString}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [typeFilter, debouncedSearch, yearFilter, currentPage, pathname, router]);

  // ------ Actions ------

  const handleDownload = async (doc: ArchivedDoc) => {
    try {
      setDownloadingId(doc.id);
      const response = await fetch(`/api/admin/archive/${doc.id}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download fehlgeschlagen");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Download fehlgeschlagen");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleVerify = async (scope: "FULL" | "YEAR", year?: number) => {
    try {
      setVerifying(true);
      const response = await fetch("/api/admin/archive/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, year }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Pruefung fehlgeschlagen");
      }

      const data = await response.json();
      setVerificationResult(data.result);
      setShowVerificationDialog(true);
      // Refresh stats after verification
      fetchStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Pruefung fehlgeschlagen");
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await fetch("/api/admin/archive/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: exportYear }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Export fehlgeschlagen");
      }

      const data = await response.json();

      // Download the index CSV
      const blob = new Blob([data.indexCsv], {
        type: "text/csv;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GoBD-Archiv-Index_${exportYear}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setShowExportDialog(false);
      alert(
        `Export erfolgreich: ${data.documentCount} Dokumente indexiert.\n` +
        `Die Index-CSV wurde heruntergeladen. Einzelne Dokumente koennen ueber die Tabelle heruntergeladen werden.`
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  };

  // ------ Render ------

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">GoBD-Archiv</h1>
          <p className="text-muted-foreground">
            Revisionssichere Archivierung steuerrelevanter Dokumente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleVerify("FULL")}
            disabled={verifying}
          >
            {verifying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Integritaet pruefen
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowExportDialog(true)}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export fuer Betriebspruefung
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Archivierte Dokumente
            </CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.totalDocuments.toLocaleString("de-DE") : "-"}
            </div>
            {stats && stats.documentsByType.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {stats.documentsByType
                  .map(
                    (t) =>
                      `${t.count} ${DOCUMENT_TYPE_LABELS[t.type] || t.type}`
                  )
                  .join(", ")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Speicherverbrauch
            </CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? formatBytes(stats.totalSizeBytes) : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              Archivierter Speicher
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Naechste Aufbewahrungsfrist
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.nextRetentionExpiry
                ? format(
                    new Date(stats.nextRetentionExpiry.date),
                    "dd.MM.yyyy",
                    { locale: de }
                  )
                : "-"}
            </div>
            {stats?.nextRetentionExpiry && (
              <p className="text-xs text-muted-foreground">
                {stats.nextRetentionExpiry.referenceNumber}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Letzte Pruefung
            </CardTitle>
            {stats?.lastVerification ? (
              stats.lastVerification.result === "PASSED" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )
            ) : (
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.lastVerification
                ? format(
                    new Date(stats.lastVerification.date),
                    "dd.MM.yyyy",
                    { locale: de }
                  )
                : "Keine"}
            </div>
            {stats?.lastVerification && (
              <p className="text-xs text-muted-foreground">
                {stats.lastVerification.result === "PASSED"
                  ? `Bestanden (${stats.lastVerification.validDocs}/${stats.lastVerification.totalDocs})`
                  : `Fehlgeschlagen (${stats.lastVerification.invalidDocs} Fehler)`}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Document Type */}
            <div className="space-y-2">
              <Label htmlFor="type-filter">Dokumenttyp</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger id="type-filter">
                  <SelectValue placeholder="Dokumenttyp waehlen" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div className="space-y-2">
              <Label htmlFor="year-filter">Jahr</Label>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger id="year-filter">
                  <SelectValue placeholder="Alle Jahre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Alle Jahre</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="search-field">Suche</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-field"
                  type="text"
                  placeholder="Referenznummer oder Dateiname..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-10"
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={() => setSearchText("")}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Suche loeschen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Archivierte Dokumente</CardTitle>
              <CardDescription>
                {pagination
                  ? `${pagination.totalCount} Dokumente gefunden`
                  : "Lade Dokumente..."}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDocuments}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Error State */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <p className="font-medium">Fehler beim Laden</p>
              <p className="text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={fetchDocuments}
              >
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* Table */}
          {!error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Datum</TableHead>
                  <TableHead className="w-[110px]">Typ</TableHead>
                  <TableHead>Referenz-Nr.</TableHead>
                  <TableHead>Dateiname</TableHead>
                  <TableHead className="w-[80px] text-right">Groesse</TableHead>
                  <TableHead className="w-[160px]">Hash</TableHead>
                  <TableHead className="w-[80px] text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Loading */}
                {loading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))}

                {/* Empty */}
                {!loading && documents.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      <Archive className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p>Keine archivierten Dokumente gefunden</p>
                    </TableCell>
                  </TableRow>
                )}

                {/* Data rows */}
                {!loading &&
                  documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(doc.archivedAt), "dd.MM.yyyy", {
                          locale: de,
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            DOCUMENT_TYPE_COLORS[doc.documentType] || ""
                          }
                        >
                          {DOCUMENT_TYPE_LABELS[doc.documentType] ||
                            doc.documentType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {doc.referenceNumber}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {doc.fileName}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatBytes(doc.fileSize)}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-muted-foreground font-mono">
                          {doc.contentHash.substring(0, 16)}...
                        </code>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                          title="Herunterladen"
                        >
                          {downloadingId === doc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Seite {pagination.page} von {pagination.totalPages} (
                {pagination.totalCount} Dokumente)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(pagination.page - 1)}
                  disabled={!pagination.hasPrevPage || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Zurueck
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(pagination.page + 1)}
                  disabled={!pagination.hasNextPage || loading}
                >
                  Weiter
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification Result Dialog */}
      <Dialog
        open={showVerificationDialog}
        onOpenChange={setShowVerificationDialog}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {verificationResult?.passed ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Integritaetspruefung{" "}
              {verificationResult?.passed ? "bestanden" : "fehlgeschlagen"}
            </DialogTitle>
            <DialogDescription>
              Ergebnis der Hash-Ketten-Pruefung
            </DialogDescription>
          </DialogHeader>

          {verificationResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">
                    {verificationResult.totalDocuments}
                  </p>
                  <p className="text-xs text-muted-foreground">Gesamt</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {verificationResult.validDocuments}
                  </p>
                  <p className="text-xs text-muted-foreground">Gueltig</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">
                    {verificationResult.invalidDocuments}
                  </p>
                  <p className="text-xs text-muted-foreground">Ungueltig</p>
                </div>
              </div>

              {verificationResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                  <p className="font-medium text-red-800 dark:text-red-200 mb-2">
                    <AlertTriangle className="inline h-4 w-4 mr-1" />
                    Fehlerhafte Dokumente:
                  </p>
                  <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
                    {verificationResult.errors.map((err, i) => (
                      <li key={i}>
                        <span className="font-mono">{err.referenceNumber}</span>
                        : {err.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {verificationResult.passed && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
                  <p className="text-green-800 dark:text-green-200">
                    <CheckCircle2 className="inline h-4 w-4 mr-1" />
                    Alle Dokumente im Archiv sind integritaetsgesichert. Die
                    Hash-Kette ist vollstaendig und unverfaelscht.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowVerificationDialog(false)}>
              Schliessen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5" />
              Export fuer Betriebspruefung
            </DialogTitle>
            <DialogDescription>
              Exportiert einen GoBD-konformen Index aller archivierten Dokumente
              fuer das ausgewaehlte Jahr.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="export-year">Jahr</Label>
              <Select
                value={String(exportYear)}
                onValueChange={(v) => setExportYear(Number(v))}
              >
                <SelectTrigger id="export-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium mb-1">Der Export beinhaltet:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Index-CSV mit allen Dokumentmetadaten</li>
                <li>SHA-256 Hashes fuer Integritaetsnachweis</li>
                <li>GoBD/GDPdU-konformes Format</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowExportDialog(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Exportieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper with Suspense
// ---------------------------------------------------------------------------

export default function ArchivePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                GoBD-Archiv
              </h1>
              <p className="text-muted-foreground">
                Revisionssichere Archivierung steuerrelevanter Dokumente
              </p>
            </div>
          </div>
          <Card>
            <CardContent className="py-12">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Lade Archiv...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <ArchiveContent />
    </Suspense>
  );
}
