"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  FileText,
  Download,
  Search,
  Filter,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileBarChart,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Report {
  id: string;
  title: string;
  description: string | null;
  category: string;
  reportType: string | null;
  reportMonth: number | null;
  reportYear: number | null;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  fund: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
}

interface GroupedReports {
  [year: number]: Report[];
}

const reportTypeLabels: Record<string, string> = {
  MONTHLY: "Monatsbericht",
  QUARTERLY: "Quartalsbericht",
  ANNUAL: "Jahresbericht",
  STATEMENT: "Kontoauszug",
};

const categoryLabels: Record<string, string> = {
  REPORT: "Bericht",
  PROTOCOL: "Protokoll",
  OTHER: "Sonstiges",
};

const monthNames = [
  "Januar",
  "Februar",
  "Maerz",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchReports();
  }, [yearFilter, typeFilter]);

  async function fetchReports() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (yearFilter !== "all") {
        params.set("year", yearFilter);
      }
      if (typeFilter !== "all") {
        params.set("type", typeFilter);
      }

      const response = await fetch(`/api/portal/my-reports?${params}`);
      if (response.ok) {
        const data = await response.json();
        setReports(data.data || []);

        // Expand the most recent year by default
        if (data.data && data.data.length > 0) {
          const years = [...new Set(data.data.map((r: Report) => r.reportYear || new Date(r.createdAt).getFullYear()))];
          const maxYear = Math.max(...years.filter((y): y is number => y !== null));
          setExpandedYears(new Set([maxYear]));
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  // Group reports by year
  const groupedReports = useMemo(() => {
    const filtered = reports.filter((report) => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return (
        report.title.toLowerCase().includes(searchLower) ||
        report.fileName.toLowerCase().includes(searchLower) ||
        report.fund?.name.toLowerCase().includes(searchLower)
      );
    });

    const grouped: GroupedReports = {};
    filtered.forEach((report) => {
      const year = report.reportYear || new Date(report.createdAt).getFullYear();
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(report);
    });

    // Sort reports within each year by month (descending)
    Object.keys(grouped).forEach((year) => {
      grouped[parseInt(year)].sort((a, b) => {
        const monthA = a.reportMonth || new Date(a.createdAt).getMonth() + 1;
        const monthB = b.reportMonth || new Date(b.createdAt).getMonth() + 1;
        return monthB - monthA;
      });
    });

    return grouped;
  }, [reports, search]);

  // Get available years for filter
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    reports.forEach((r) => {
      const year = r.reportYear || new Date(r.createdAt).getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [reports]);

  const sortedYears = Object.keys(groupedReports)
    .map(Number)
    .sort((a, b) => b - a);

  function toggleYear(year: number) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  }

  async function handleDownload(report: Report) {
    try {
      setDownloadingId(report.id);

      const response = await fetch(`/api/portal/my-reports/${report.id}/download`);

      if (!response.ok) {
        throw new Error("Download fehlgeschlagen");
      }

      const data = await response.json();

      if (data.url) {
        const link = document.createElement("a");
        link.href = data.url;
        link.download = report.fileName;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch {
      toast.error("Fehler beim Herunterladen des Berichts");
    } finally {
      setDownloadingId(null);
    }
  }

  function getReportPeriod(report: Report): string {
    if (report.reportMonth && report.reportYear) {
      return `${monthNames[report.reportMonth - 1]} ${report.reportYear}`;
    }
    return format(new Date(report.createdAt), "MMMM yyyy", { locale: de });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalReports = reports.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Berichte</h1>
        <p className="text-muted-foreground">
          Monatsberichte, Jahresberichte und Abrechnungen zu Ihren Beteiligungen
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen nach Titel, Dateiname..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Jahr" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Jahre</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Berichtstyp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="MONTHLY">Monatsberichte</SelectItem>
                <SelectItem value="QUARTERLY">Quartalsberichte</SelectItem>
                <SelectItem value="ANNUAL">Jahresberichte</SelectItem>
                <SelectItem value="STATEMENT">Kontoauszuege</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reports grouped by year */}
      {totalReports === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <FileBarChart className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Noch keine Berichte verfuegbar
              </h3>
              <p className="text-muted-foreground max-w-sm">
                Monatsberichte, Jahresberichte und Abrechnungen werden hier angezeigt,
                sobald sie erstellt wurden.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : sortedYears.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              Keine Berichte fuer die ausgewaehlten Filter gefunden.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedYears.map((year) => (
            <Card key={year}>
              <Collapsible
                open={expandedYears.has(year)}
                onOpenChange={() => toggleYear(year)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedYears.has(year) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <CardTitle className="text-xl">{year}</CardTitle>
                        <Badge variant="secondary">
                          {groupedReports[year].length} Bericht
                          {groupedReports[year].length !== 1 ? "e" : ""}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bericht</TableHead>
                            <TableHead>Zeitraum</TableHead>
                            <TableHead>Gesellschaft</TableHead>
                            <TableHead>Typ</TableHead>
                            <TableHead>Erstellt</TableHead>
                            <TableHead className="text-right">Groesse</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupedReports[year].map((report) => (
                            <TableRow key={report.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                                  <div>
                                    <p className="font-medium">{report.title}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {report.fileName}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">
                                  {getReportPeriod(report)}
                                </span>
                              </TableCell>
                              <TableCell>{report.fund?.name || "-"}</TableCell>
                              <TableCell>
                                {report.reportType && (
                                  <Badge variant="outline">
                                    {reportTypeLabels[report.reportType] ||
                                      report.reportType}
                                  </Badge>
                                )}
                                {!report.reportType && report.category && (
                                  <Badge variant="outline">
                                    {categoryLabels[report.category] ||
                                      report.category}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {format(new Date(report.createdAt), "dd.MM.yyyy", {
                                  locale: de,
                                })}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {formatFileSize(report.fileSize)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Herunterladen"
                                  onClick={() => handleDownload(report)}
                                  disabled={downloadingId === report.id}
                                >
                                  <Download
                                    className={`h-4 w-4 ${
                                      downloadingId === report.id
                                        ? "animate-pulse"
                                        : ""
                                    }`}
                                  />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
