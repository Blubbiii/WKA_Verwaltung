"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Calendar,
  CalendarDays,
  Loader2,
  Download,
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
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface Park {
  id: string;
  name: string;
}

const MONTH_NAMES = [
  "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const QUARTER_NAMES = ["Q1 (Jan-Mrz)", "Q2 (Apr-Jun)", "Q3 (Jul-Sep)", "Q4 (Okt-Dez)"];

// =============================================================================
// Component
// =============================================================================

export function PdfReportsTab() {
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const [parkId, setParkId] = useState("");
  const [year, setYear] = useState(currentYear.toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [quarter, setQuarter] = useState("1");

  useEffect(() => {
    fetch("/api/parks?limit=100")
      .then((res) => res.json())
      .then((data) => {
        const parkList = data.data || [];
        setParks(parkList);
        if (parkList.length > 0 && !parkId) {
          setParkId(parkList[0].id);
        }
      })
      .catch(() => setParks([]))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function downloadPdf(
    endpoint: string,
    body: Record<string, unknown>,
    fallbackFilename: string,
    label: string
  ) {
    if (!parkId) {
      toast.error("Bitte waehlen Sie einen Windpark aus");
      return;
    }

    try {
      setGenerating(label);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || `Fehler beim Generieren`);
      }

      const blob = await response.blob();
      const cd = response.headers.get("Content-Disposition");
      const match = cd?.match(/filename="(.+)"/);
      const filename = match?.[1] || fallbackFilename;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`${label} wurde erstellt und heruntergeladen`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Fehler beim Generieren`
      );
    } finally {
      setGenerating(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const yearInt = parseInt(year);

  return (
    <div className="space-y-6">
      {/* Park + Year selectors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            PDF-Berichte generieren
          </CardTitle>
          <CardDescription>
            Erstellen Sie Monats-, Quartals- und Jahresberichte als PDF-Download
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Windpark</label>
              <Select value={parkId} onValueChange={setParkId}>
                <SelectTrigger>
                  <SelectValue placeholder="Park waehlen..." />
                </SelectTrigger>
                <SelectContent>
                  {parks.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Jahr</label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => currentYear - i).map(
                    (y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Report types */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Monthly */}
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Monatsbericht
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="w-full"
                  onClick={() =>
                    downloadPdf(
                      "/api/reports/monthly",
                      { parkId, year: yearInt, month: parseInt(month) },
                      `Monatsbericht_${year}_${month.padStart(2, "0")}.pdf`,
                      "Monatsbericht"
                    )
                  }
                  disabled={!!generating || !parkId}
                >
                  {generating === "Monatsbericht" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Generieren
                </Button>
              </CardContent>
            </Card>

            {/* Quarterly */}
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  Quartalsbericht
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={quarter} onValueChange={setQuarter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUARTER_NAMES.map((name, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="w-full"
                  onClick={() =>
                    downloadPdf(
                      "/api/reports/quarterly",
                      { parkId, year: yearInt, quarter: parseInt(quarter) },
                      `Quartalsbericht_${year}_Q${quarter}.pdf`,
                      "Quartalsbericht"
                    )
                  }
                  disabled={!!generating || !parkId}
                >
                  {generating === "Quartalsbericht" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Generieren
                </Button>
              </CardContent>
            </Card>

            {/* Annual */}
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Jahresbericht
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-9 flex items-center text-sm text-muted-foreground">
                  Komplettes Jahr {year}
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    downloadPdf(
                      "/api/reports/annual",
                      { parkId, year: yearInt },
                      `Jahresbericht_${year}.pdf`,
                      "Jahresbericht"
                    )
                  }
                  disabled={!!generating || !parkId}
                >
                  {generating === "Jahresbericht" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Generieren
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
