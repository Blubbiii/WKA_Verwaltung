"use client";

/**
 * Durchsuchbare Auswahlliste.
 *
 * Bedienaufwand #19 (Audit 2026-07): 159 Dateien nutzen Radix-`Select`. Das
 * bietet nur Erst-Buchstaben-Typeahead, kein Suchfeld — bei 200 Flurstücken
 * heisst das scrollen. Eine Combobox gab es im Repo nicht, obwohl `cmdk`
 * installiert ist und ausschliesslich in der Command-Palette verwendet wurde.
 *
 * Bewusst direkt auf cmdk + Popover gebaut statt über den vollen
 * shadcn-`command`-Primitivsatz: weniger Oberfläche, weniger das schiefgehen
 * kann, und die Palette zeigt, dass cmdk hier direkt gut benutzbar ist.
 *
 * Zwei Betriebsarten:
 *  - **statisch**: `options` wird übergeben, cmdk filtert clientseitig.
 *  - **serverseitig**: zusätzlich `onSearchChange` — dann filtert cmdk NICHT
 *    mehr selbst (`shouldFilter={false}`), weil die Liste bereits gefiltert
 *    ankommt. Ohne das würden serverseitige Treffer ein zweites Mal gefiltert
 *    und Treffer, die auf einem nicht angezeigten Feld matchen, verschwänden —
 *    derselbe Fehler, der in der Command-Palette schon zu umgehen war.
 */

import * as React from "react";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Zweite Zeile, z. B. der Kontenname neben der Kontonummer. */
  description?: string;
  /** Zusätzliche Begriffe, auf die die clientseitige Suche anspringen soll. */
  keywords?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  /** Text im geschlossenen Zustand, wenn nichts gewählt ist. */
  placeholder?: string;
  /** Platzhalter im Suchfeld. */
  searchPlaceholder?: string;
  /** Text, wenn die Suche nichts findet. */
  emptyText?: string;
  /**
   * Serverseitige Suche. Ist die Funktion gesetzt, filtert cmdk nicht mehr
   * selbst — die Liste kommt bereits gefiltert an.
   */
  onSearchChange?: (search: string) => void;
  /** Zeigt einen Spinner im Dropdown, während nachgeladen wird. */
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  /** Breite des Dropdowns; Default folgt der Triggerbreite. */
  contentClassName?: string;
  id?: string;
  "aria-label"?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  onSearchChange,
  loading = false,
  disabled = false,
  className,
  contentClassName,
  id,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const t = useTranslations("common.combobox");
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const serverSide = typeof onSearchChange === "function";

  // Suchbegriff nach aussen geben, aber nur im serverseitigen Modus.
  React.useEffect(() => {
    if (serverSide) onSearchChange?.(search);
  }, [search, serverSide, onSearchChange]);

  const selected = options.find((o) => o.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Beim Schliessen zuruecksetzen, sonst zeigt das naechste Oeffnen die
        // alte, bereits gefilterte Liste.
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder ?? t("placeholder")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn("w-[--radix-popover-trigger-width] p-0", contentClassName)}
        align="start"
      >
        <Command shouldFilter={!serverSide}>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder={searchPlaceholder ?? t("searchPlaceholder")}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            )}
          </div>

          <Command.List className="max-h-64 overflow-y-auto p-1">
            {/* Während des Nachladens kein "nichts gefunden" zeigen — sonst
                blitzt die Meldung bei jedem Tastendruck auf. */}
            {!loading && (
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                {emptyText ?? t("empty")}
              </Command.Empty>
            )}

            {options.map((option) => (
              <Command.Item
                key={option.value}
                // Im serverseitigen Modus filtert cmdk nicht, der value dient
                // nur der Auswahl. Im statischen Modus tragen Label,
                // Beschreibung und keywords die Suche.
                value={
                  serverSide
                    ? option.value
                    : `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`
                }
                disabled={option.disabled}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent data-[disabled=true]:opacity-50"
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    option.value === value ? "opacity-100" : "opacity-0"
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
