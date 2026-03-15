"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Calendar,
  CalendarDays,
  Loader2,
  Download,
  Settings2,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
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

// Section configs per report type
const ANNUAL_SECTIONS = [
  { key: "topology", label: "Netz-Topologie" },
  { key: "kpis", label: "Jahresübersicht / KPIs" },
  { key: "monthlyTrend", label: "Monatsverlauf" },
  { key: "turbinePerformance", label: "Anlagen-Performance" },
  { key: "financial", label: "Finanzen" },
  { key: "service", label: "Service & Wartung" },
] as const;

const MONTHLY_SECTIONS = [
  { key: "summary", label: "Zusammenfassung" },
  { key: "production", label: "Produktion" },
  { key: "availability", label: "Verfügbarkeit" },
  { key: "service", label: "Ereignisse" },
  { key: "windAnalysis", label: "Windanalyse" },
  { key: "powerCurve", label: "Leistungskurve" },
  { key: "dailyProfile", label: "Tagesprofil" },
] as const;

const QUARTERLY_SECTIONS = [
  ...MONTHLY_SECTIONS,
  { key: "monthlyTrend" as const, label: "Monatsverlauf" },
] as const;

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

  // Section selection state (all true by default)
  const [annualSections, setAnnualSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ANNUAL_SECTIONS.map((s) => [s.key, true]))
  );
  const [monthlySections, setMonthlySections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MONTHLY_SECTIONS.map((s) => [s.key, true]))
  );
  const [quarterlySections, setQuarterlySections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(QUARTERLY_SECTIONS.map((s) => [s.key, true]))
  );

  function toggleSection(
    setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    key: string
  ) {
    setter((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Only include sections that are unchecked (to keep payload small)
  function buildSectionsParam(sections: Record<string, boolean>) {
    const hasUnchecked = Object.values(sections).some((v) => !v);
    if (!hasUnchecked) return undefined;
    return sections;
  }

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
                <SectionPicker
                  sections={MONTHLY_SECTIONS}
                  values={monthlySections}
                  onToggle={(key) => toggleSection(setMonthlySections, key)}
                />
                <Button
                  className="w-full"
                  onClick={() =>
                    downloadPdf(
                      "/api/reports/monthly",
                      { parkId, year: yearInt, month: parseInt(month), sections: buildSectionsParam(monthlySections) },
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
                <SectionPicker
                  sections={QUARTERLY_SECTIONS}
                  values={quarterlySections}
                  onToggle={(key) => toggleSection(setQuarterlySections, key)}
                />
                <Button
                  className="w-full"
                  onClick={() =>
                    downloadPdf(
                      "/api/reports/quarterly",
                      { parkId, year: yearInt, quarter: parseInt(quarter), sections: buildSectionsParam(quarterlySections) },
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
                <SectionPicker
                  sections={ANNUAL_SECTIONS}
                  values={annualSections}
                  onToggle={(key) => toggleSection(setAnnualSections, key)}
                />
                <Button
                  className="w-full"
                  onClick={() =>
                    downloadPdf(
                      "/api/reports/annual",
                      { parkId, year: yearInt, sections: buildSectionsParam(annualSections) },
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

// =============================================================================
// Section Picker (collapsible checkbox list)
// =============================================================================

function SectionPicker({
  sections,
  values,
  onToggle,
}: {
  sections: ReadonlyArray<{ key: string; label: string }>;
  values: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  const checkedCount = Object.values(values).filter(Boolean).length;
  const totalCount = sections.length;

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between px-2 h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Sektionen ({checkedCount}/{totalCount})
          </span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-1.5">
        {sections.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <Checkbox
              id={`sec-${s.key}`}
              checked={values[s.key] ?? true}
              onCheckedChange={() => onToggle(s.key)}
              className="h-3.5 w-3.5"
            />
            <Label
              htmlFor={`sec-${s.key}`}
              className="text-xs cursor-pointer leading-none"
            >
              {s.label}
            </Label>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
