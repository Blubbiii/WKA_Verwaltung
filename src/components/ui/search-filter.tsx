"use client";

/**
 * Suche und Filter über einer Liste.
 *
 * ## Was sich geändert hat und warum
 *
 * Vorher standen alle Bedienelemente nebeneinander in einer Zeile. Auf der
 * Rechnungsliste waren das: Suchfeld, zwei Auswahlfelder, ein drittes über die
 * volle Breite und zwei Datumsfelder — rund 150 Pixel Steuerung vor der ersten
 * Datenzeile. Darunter stand **eine** Rechnung.
 *
 * Das Verhältnis stimmt nicht. Wer eine Liste öffnet, will die Liste sehen.
 * Filter braucht er, wenn sie zu lang ist — also später, und dann gezielt.
 *
 * Jetzt bleibt die **Suche sichtbar** (sie ist der häufigste Griff), alles
 * andere liegt hinter einer Schaltfläche „Filter". Ist etwas gesetzt, trägt
 * sie einen Zähler.
 *
 * ## Die Marken sind der eigentliche Gewinn
 *
 * Ein zugeklappter Filter, der still wirkt, ist schlimmer als ein sichtbarer:
 * man sucht einen Datensatz, findet ihn nicht und weiss nicht, warum. Deshalb
 * bleibt ein gesetzter Filter **immer** sichtbar — als entfernbare Marke
 * unter der Zeile statt als Auswahlfeld, das dauerhaft Platz belegt.
 *
 * ## Rückwärtskompatibel
 *
 * Einundzwanzig Listen benutzen diese Komponente, keine musste angefasst
 * werden. Welcher Wert „nicht gefiltert" bedeutet, wird erkannt (`all`,
 * `alle`, leer oder die erste Option); `children` — Zeiträume, Sonderfälle —
 * wandern mit hinter die Schaltfläche.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Filter as FilterIcon, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options: FilterOption[];
  icon?: React.ReactNode;
  width?: string;
  /**
   * Welcher Wert bedeutet „nicht gefiltert"?
   *
   * Ohne Angabe wird erkannt: `all`, `alle`, leer — oder die erste Option.
   * Das trifft alle bestehenden Listen; wer eine andere Konvention hat, gibt
   * sie hier an.
   */
  neutralValue?: string;
}

interface SearchFilterProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  children?: React.ReactNode;
  /**
   * Filter dauerhaft ausgeklappt statt hinter der Schaltfläche.
   *
   * Für Ansichten, in denen das Filtern die Hauptbeschäftigung ist — eine
   * Auswertung etwa. Der Normalfall ist die Schaltfläche.
   */
  alwaysExpanded?: boolean;
}

const NEUTRALE_WERTE = ["all", "alle", "none", "-1", ""];

/** Ist dieser Filter gesetzt? */
function istGesetzt(filter: FilterConfig): boolean {
  const wert = (filter.value ?? "").trim();
  if (wert === "") return false;
  const neutral = filter.neutralValue ?? filter.options[0]?.value ?? "all";
  if (wert === neutral) return false;
  return !NEUTRALE_WERTE.includes(wert.toLowerCase());
}

/** Der neutrale Wert, auf den eine Marke beim Entfernen zurückstellt. */
function neutralerWert(filter: FilterConfig): string {
  return filter.neutralValue ?? filter.options[0]?.value ?? "all";
}

/** Beschriftung des gesetzten Werts, für die Marke. */
function markenText(filter: FilterConfig): string {
  return filter.options.find((o) => o.value === filter.value)?.label ?? filter.value;
}

export function SearchFilter({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  children,
  alwaysExpanded = false,
}: SearchFilterProps) {
  const t = useTranslations("common.searchFilter");
  const [offen, setOffen] = useState(false);

  const gesetzte = useMemo(() => (filters ?? []).filter(istGesetzt), [filters]);
  const hatFilter = (filters?.length ?? 0) > 0 || children !== undefined;

  const filterFelder = (
    <div className="flex flex-col gap-3">
      {filters?.map((filter, index) => (
        <div key={index} className="flex flex-col gap-1">
          {filter.placeholder && (
            <span className="text-xs font-medium text-muted-foreground">
              {filter.placeholder}
            </span>
          )}
          <Select value={filter.value} onValueChange={filter.onChange}>
            <SelectTrigger className="w-full">
              {filter.icon}
              <SelectValue placeholder={filter.placeholder || t("filterPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {children}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {onSearchChange !== undefined && (
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder || t("searchPlaceholder")}
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        )}

        {hatFilter && !alwaysExpanded && (
          <Popover open={offen} onOpenChange={setOffen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="shrink-0 justify-start">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                {t("filterPlaceholder")}
                {gesetzte.length > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5">
                    {gesetzte.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <FilterIcon className="h-4 w-4" />
                {t("filterPlaceholder")}
              </div>
              {filterFelder}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {alwaysExpanded && hatFilter && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {filterFelder}
        </div>
      )}

      {/*
        Gesetzte Filter bleiben sichtbar — als Marke, nicht als Auswahlfeld.
        Ein zugeklappter Filter, der still wirkt, ist schlimmer als ein
        sichtbarer: man sucht einen Datensatz, findet ihn nicht und weiss
        nicht, warum.
      */}
      {!alwaysExpanded && gesetzte.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {gesetzte.map((filter, index) => (
            <Badge key={index} variant="secondary" className="gap-1 pr-1">
              <span className="text-xs">
                {filter.placeholder ? `${filter.placeholder}: ` : ""}
                {markenText(filter)}
              </span>
              <button
                type="button"
                onClick={() => filter.onChange(neutralerWert(filter))}
                aria-label={`${markenText(filter)} ${t("remove")}`}
                className={cn(
                  "rounded-sm p-0.5 hover:bg-foreground/10",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {gesetzte.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => gesetzte.forEach((f) => f.onChange(neutralerWert(f)))}
            >
              {t("clearAll")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
