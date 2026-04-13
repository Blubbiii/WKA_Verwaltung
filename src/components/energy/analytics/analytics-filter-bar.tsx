"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface Park {
  id: string;
  name: string;
}

interface AnalyticsFilterBarProps {
  selectedParkId: string;
  onParkChange: (id: string) => void;
  selectedYear: number;
  onYearChange: (year: number) => void;
  compareYear?: number;
  onCompareYearChange?: (year: number | undefined) => void;
  showCompareYear?: boolean;
  onCreateReport?: () => void;
}

export function AnalyticsFilterBar({
  selectedParkId,
  onParkChange,
  selectedYear,
  onYearChange,
  compareYear,
  onCompareYearChange,
  showCompareYear = true,
  onCreateReport,
}: AnalyticsFilterBarProps) {
  const t = useTranslations("energy.filterBar");
  const [parks, setParks] = useState<Park[]>([]);

  useEffect(() => {
    fetch("/api/parks")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setParks(list);
      })
      .catch(() => setParks([]));
  }, []);

  // Generate year options (current year back to 2018)
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 2017 },
    (_, i) => currentYear - i
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 py-3">
        {/* Park Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {t("park")}
          </span>
          <Select value={selectedParkId} onValueChange={onParkChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("allParks")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allParks")}</SelectItem>
              {parks.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {t("year")}
          </span>
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => onYearChange(Number(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Compare Year Filter */}
        {showCompareYear && onCompareYearChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {t("compare")}
            </span>
            <Select
              value={compareYear ? String(compareYear) : "none"}
              onValueChange={(v) =>
                onCompareYearChange(v === "none" ? undefined : Number(v))
              }
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder={t("noCompare")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("noCompare")}</SelectItem>
                {years
                  .filter((y) => y !== selectedYear)
                  .map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Create Report Button */}
        {onCreateReport && (
          <Button variant="outline" size="sm" onClick={onCreateReport}>
            <FileText className="mr-2 h-4 w-4" />
            {t("createReport")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
