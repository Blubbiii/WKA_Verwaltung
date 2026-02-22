"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Download,
  FileSpreadsheet,
  Building2,
  Wind,
  Users,
  FileSignature,
  AlertTriangle,
  Receipt,
  Vote,
  TrendingUp,
  Loader2,
  ChevronRight,
  Calendar,
  CalendarDays,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduledReportsManager } from "@/components/reports/scheduled-reports-manager";
import { EnergyReportBuilder } from "@/components/energy/reports/energy-report-builder";
import { toast } from "sonner";

interface ReportType {
  id: string;
  name: string;
  description: string;
  category: string;
  formats: string[];
}

interface QuickStats {
  parks: number;
  turbines: number;
  shareholders: number;
  contracts: number;
  invoices: number;
}

interface Fund {
  id: string;
  name: string;
}

interface Park {
  id: string;
  name: string;
}

const categoryIcons: Record<string, React.ElementType> = {
  Stammdaten: Building2,
  "Verträge": FileSignature,
  Finanzen: Receipt,
  Abstimmungen: Vote,
};

const reportIcons: Record<string, React.ElementType> = {
  "parks-overview": Building2,
  "turbines-overview": Wind,
  "shareholders-overview": Users,
  "contracts-overview": FileSignature,
  "contracts-expiring": AlertTriangle,
  "invoices-overview": Receipt,
  "votes-results": Vote,
  "fund-performance": TrendingUp,
};

const MONTH_NAMES = [
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

export default function ReportsPage() {
  const router = useRouter();
  const [reportTypes, setReportTypes] = useState<ReportType[]>([]);
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedFund, setSelectedFund] = useState<string>("all");
  const [selectedPark, setSelectedPark] = useState<string>("all");

  // Monthly/Annual report state
  const [reportParkId, setReportParkId] = useState<string>("");
  const [reportYear, setReportYear] = useState<string>(
    new Date().getFullYear().toString()
  );
  const [reportMonth, setReportMonth] = useState<string>(
    (new Date().getMonth() + 1).toString()
  );

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [reportsRes, fundsRes, parksRes] = await Promise.all([
        fetch("/api/reports"),
        fetch("/api/funds?limit=100"),
        fetch("/api/parks?limit=100"),
      ]);

      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReportTypes(data.reportTypes);
        setQuickStats(data.quickStats);
      }

      if (fundsRes.ok) {
        const data = await fundsRes.json();
        setFunds(data.data || []);
      }

      if (parksRes.ok) {
        const data = await parksRes.json();
        const parkList = data.data || [];
        setParks(parkList);
        // Auto-select first park if available
        if (parkList.length > 0 && !reportParkId) {
          setReportParkId(parkList[0].id);
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function generateReport(reportId: string, format: "pdf" | "xlsx") {
    try {
      setGenerating(`${reportId}-${format}`);

      const params = new URLSearchParams({ format });
      if (selectedFund !== "all") params.set("fundId", selectedFund);
      if (selectedPark !== "all") params.set("parkId", selectedPark);

      const response = await fetch(`/api/reports/${reportId}?${params}`);
      if (!response.ok) throw new Error("Fehler beim Generieren");

      const data = await response.json();

      if (format === "xlsx") {
        // For Excel, we'll generate a downloadable file
        await downloadExcel(data, reportId);
      } else {
        // For PDF, navigate to preview page
        router.push(`/reports/${reportId}?${params}`);
      }
    } catch (error) {
      toast.error("Fehler beim Generieren des Berichts");
    } finally {
      setGenerating(null);
    }
  }

  async function generateMonthlyReport() {
    if (!reportParkId) {
      toast.error("Bitte waehlen Sie einen Windpark aus");
      return;
    }

    try {
      setGenerating("monthly-report");

      const response = await fetch("/api/reports/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId: reportParkId,
          year: parseInt(reportYear),
          month: parseInt(reportMonth),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || "Fehler beim Generieren des Monatsberichts"
        );
      }

      // Download PDF
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] || `Monatsbericht_${reportYear}_${reportMonth}.pdf`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Monatsbericht wurde erstellt und heruntergeladen");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Generieren des Monatsberichts"
      );
    } finally {
      setGenerating(null);
    }
  }

  async function generateAnnualReport() {
    if (!reportParkId) {
      toast.error("Bitte waehlen Sie einen Windpark aus");
      return;
    }

    try {
      setGenerating("annual-report");

      const response = await fetch("/api/reports/annual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId: reportParkId,
          year: parseInt(reportYear),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || "Fehler beim Generieren des Jahresberichts"
        );
      }

      // Download PDF
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] || `Jahresbericht_${reportYear}.pdf`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Jahresbericht wurde erstellt und heruntergeladen");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Generieren des Jahresberichts"
      );
    } finally {
      setGenerating(null);
    }
  }

  async function downloadExcel(reportData: any, reportId: string) {
    // Convert data to CSV format (simplified Excel export)
    const data = reportData.data;
    let csvContent = "";
    let rows: any[] = [];

    // Determine which data array to export based on report type
    if (data.parks) rows = data.parks;
    else if (data.turbines) rows = data.turbines;
    else if (data.shareholders) rows = data.shareholders;
    else if (data.contracts) rows = data.contracts;
    else if (data.invoices) rows = data.invoices;
    else if (data.votes) rows = data.votes;
    else if (data.funds) rows = data.funds;

    if (rows.length > 0) {
      // Get headers from first row
      const headers = Object.keys(rows[0]).filter(
        (k) => k !== "id" && typeof rows[0][k] !== "object"
      );
      csvContent += headers.join(";") + "\n";

      // Add data rows
      rows.forEach((row) => {
        const values = headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "number") return val.toString().replace(".", ",");
          return `"${String(val).replace(/"/g, '""')}"`;
        });
        csvContent += values.join(";") + "\n";
      });
    }

    // Create and download file
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reportData.title}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Group reports by category
  const reportsByCategory = reportTypes.reduce(
    (acc, report) => {
      if (!acc[report.category]) acc[report.category] = [];
      acc[report.category].push(report);
      return acc;
    },
    {} as Record<string, ReportType[]>
  );

  // Year options (current year and 5 years back)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Berichte & Export"
        description="Erstellen Sie Berichte und exportieren Sie Daten"
      />

      {/* Top-level tabs: Business Reports vs Energy Reports */}
      <Tabs defaultValue="business">
        <TabsList>
          <TabsTrigger value="business" className="gap-1">
            <FileText className="h-4 w-4" />
            <span>Berichte & Export</span>
          </TabsTrigger>
          <TabsTrigger value="energy" className="gap-1">
            <Zap className="h-4 w-4" />
            <span>Energie-Berichte</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="mt-6 space-y-6">

      {/* Scheduled Reports Section */}
      <ScheduledReportsManager />

      {/* Quick Stats */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : quickStats ? (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Windparks</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{quickStats.parks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Turbinen</CardTitle>
              <Wind className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{quickStats.turbines}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesellschafter</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{quickStats.shareholders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vertraege</CardTitle>
              <FileSignature className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{quickStats.contracts}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rechnungen</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{quickStats.invoices}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Monthly & Annual Report Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Monats- & Jahresberichte
          </CardTitle>
          <CardDescription>
            Erstellen Sie detaillierte Monats- oder Jahresberichte fuer einen Windpark als
            PDF. Die Berichte enthalten Produktionsdaten, Verfuegbarkeit,
            Windgeschwindigkeiten und Service-Ereignisse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Park and period selection */}
            <div className="flex flex-wrap gap-4">
              <div className="w-64">
                <label className="text-sm font-medium mb-2 block">
                  Windpark
                </label>
                <Select value={reportParkId} onValueChange={setReportParkId}>
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
              <div className="w-40">
                <label className="text-sm font-medium mb-2 block">Jahr</label>
                <Select value={reportYear} onValueChange={setReportYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <label className="text-sm font-medium mb-2 block">
                  Monat (fuer Monatsbericht)
                </label>
                <Select value={reportMonth} onValueChange={setReportMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generate buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              <div className="flex items-start gap-3 p-4 border rounded-lg flex-1 min-w-[280px]">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">Monatsbericht</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Zusammenfassung, Produktion pro Anlage, Verfuegbarkeit und
                    Service-Ereignisse fuer einen Monat.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline">PDF</Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={generateMonthlyReport}
                  disabled={!reportParkId || !!generating}
                >
                  {generating === "monthly-report" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  PDF erstellen
                </Button>
              </div>

              <div className="flex items-start gap-3 p-4 border rounded-lg flex-1 min-w-[280px]">
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950">
                  <CalendarDays className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">Jahresbericht</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Deckblatt, Jahresuebersicht, Monatsverlauf,
                    Anlagen-Performance, Finanzen und Service-Zusammenfassung.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline">PDF</Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={generateAnnualReport}
                  disabled={!reportParkId || !!generating}
                >
                  {generating === "annual-report" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  PDF erstellen
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Filtern Sie die Berichte nach Gesellschaft oder Windpark
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-64">
              <label className="text-sm font-medium mb-2 block">Gesellschaft</label>
              <Select value={selectedFund} onValueChange={setSelectedFund}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Gesellschaften" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Gesellschaften</SelectItem>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <label className="text-sm font-medium mb-2 block">Windpark</label>
              <Select value={selectedPark} onValueChange={setSelectedPark}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Windparks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Windparks</SelectItem>
                  {parks.map((park) => (
                    <SelectItem key={park.id} value={park.id}>
                      {park.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports by Category */}
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : (
        Object.entries(reportsByCategory).map(([category, reports]) => {
          const CategoryIcon = categoryIcons[category] || FileText;
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CategoryIcon className="h-5 w-5" />
                  {category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {reports.map((report) => {
                    const ReportIcon = reportIcons[report.id] || FileText;
                    const isGeneratingPdf = generating === `${report.id}-pdf`;
                    const isGeneratingXlsx = generating === `${report.id}-xlsx`;

                    return (
                      <div
                        key={report.id}
                        className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <ReportIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-medium">{report.name}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {report.description}
                            </p>
                            <div className="flex gap-2 mt-2">
                              {report.formats.map((format) => (
                                <Badge key={format} variant="outline">
                                  {format.toUpperCase()}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {report.formats.includes("pdf") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generateReport(report.id, "pdf")}
                              disabled={!!generating}
                            >
                              {isGeneratingPdf ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <FileText className="mr-2 h-4 w-4" />
                              )}
                              PDF
                            </Button>
                          )}
                          {report.formats.includes("xlsx") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generateReport(report.id, "xlsx")}
                              disabled={!!generating}
                            >
                              {isGeneratingXlsx ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                              )}
                              Excel
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

        </TabsContent>

        <TabsContent value="energy" className="mt-6">
          <EnergyReportBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}
