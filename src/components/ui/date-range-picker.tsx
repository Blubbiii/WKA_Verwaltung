"use client";

/**
 * Zeitraum-Auswahl mit Schnellauswahl.
 *
 * Bedienaufwand #18 (Audit 2026-07): 87 rohe `<Input type="date">` im Repo,
 * **kein einziges Preset**, keine `DateRangePicker`-Komponente. In der
 * Buchhaltung, wo der Zeitraum der Haupteinstieg jeder Auswertung ist, tippt
 * man Von und Bis einzeln — für „letztes Quartal" viermal im Monat.
 *
 * ## Warum weiterhin `<input type="date">`
 *
 * Zehn Seiten nutzen den Popover-`ui/calendar`, der Rest rohe Date-Inputs. Für
 * einen Zeitraum ist das native Feld hier die bessere Wahl: es lässt sich
 * bekannt bedienen, tippen (Buchhalter tippen Datumsangaben), und es bringt
 * die Tastaturbedienung ohne Zutun mit. Die Presets erledigen ohnehin die
 * häufigen Fälle — der Kalender bleibt für den Einzelfall.
 *
 * ## Was hier bewusst NICHT drin ist
 *
 * Ein Preset „laufendes Geschäftsjahr". `fiscalYearEnd` hängt im Datenmodell
 * am **Fonds**, nicht am Mandanten, und die auswertenden Seiten haben diesen
 * Kontext nicht immer. Ein Preset, das stillschweigend das Kalenderjahr
 * unterstellt, wäre in einem abweichenden Geschäftsjahr schlicht falsch — und
 * zwar unsichtbar falsch. Wer es braucht, gibt den Zeitraum bis dahin von Hand
 * ein.
 */

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DateRange {
  /** ISO-Tagesdatum `yyyy-mm-dd`, wie es `<input type="date">` liefert. */
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Schnellauswahl ausblenden, wenn kein Platz ist. */
  showPresets?: boolean;
  className?: string;
  disabled?: boolean;
  /** IDs für die Beschriftungen der beiden Felder. */
  fromId?: string;
  toId?: string;
}

/** Tagesdatum im ISO-Format — bewusst lokal, nicht via toISOString (UTC-Versatz). */
function iso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

type PresetKey =
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "lastQuarter"
  | "thisYear"
  | "lastYear";

/**
 * Die Zeiträume werden bei jedem Klick frisch berechnet, nicht beim Laden der
 * Seite. Sonst zeigt eine über Mitternacht offene Seite den Vortag an.
 */
function rangeFor(key: PresetKey, now: Date): DateRange {
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (key) {
    case "thisMonth":
      return { from: iso(new Date(year, month, 1)), to: iso(new Date(year, month + 1, 0)) };
    case "lastMonth":
      return { from: iso(new Date(year, month - 1, 1)), to: iso(new Date(year, month, 0)) };
    case "thisQuarter": {
      const q = Math.floor(month / 3) * 3;
      return { from: iso(new Date(year, q, 1)), to: iso(new Date(year, q + 3, 0)) };
    }
    case "lastQuarter": {
      // new Date(jahr, -3, 1) rollt korrekt ins Vorjahr — deshalb hier keine
      // Sonderbehandlung für das erste Quartal.
      const q = Math.floor(month / 3) * 3 - 3;
      return { from: iso(new Date(year, q, 1)), to: iso(new Date(year, q + 3, 0)) };
    }
    case "thisYear":
      return { from: iso(new Date(year, 0, 1)), to: iso(new Date(year, 11, 31)) };
    case "lastYear":
      return { from: iso(new Date(year - 1, 0, 1)), to: iso(new Date(year - 1, 11, 31)) };
  }
}

const PRESETS: PresetKey[] = [
  "thisMonth",
  "lastMonth",
  "thisQuarter",
  "lastQuarter",
  "thisYear",
  "lastYear",
];

export function DateRangePicker({
  value,
  onChange,
  showPresets = true,
  className,
  disabled = false,
  fromId,
  toId,
}: DateRangePickerProps) {
  const t = useTranslations("common.dateRange");

  // Ein bereits gewähltes Preset hervorheben, damit erkennbar ist, wo man ist.
  const activePreset = PRESETS.find((key) => {
    const range = rangeFor(key, new Date());
    return range.from === value.from && range.to === value.to;
  });

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={fromId}
          type="date"
          value={value.from}
          disabled={disabled}
          aria-label={t("from")}
          className="w-full sm:w-[150px]"
          // Das Bis-Feld begrenzen statt einen umgedrehten Zeitraum zuzulassen:
          // "von 2026 bis 2025" liefert stumm eine leere Auswertung.
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
        <span className="text-sm text-muted-foreground" aria-hidden>
          –
        </span>
        <Input
          id={toId}
          type="date"
          value={value.to}
          disabled={disabled}
          aria-label={t("to")}
          className="w-full sm:w-[150px]"
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
        {(value.from || value.to) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange({ from: "", to: "" })}
          >
            {t("clear")}
          </Button>
        )}
      </div>

      {showPresets && (
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((key) => (
            <Button
              key={key}
              type="button"
              variant={activePreset === key ? "secondary" : "outline"}
              size="sm"
              disabled={disabled}
              className="h-7 px-2 text-xs"
              aria-pressed={activePreset === key}
              onClick={() => onChange(rangeFor(key, new Date()))}
            >
              {t(`presets.${key}`)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
