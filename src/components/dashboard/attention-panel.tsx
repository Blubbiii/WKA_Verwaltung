"use client";

/**
 * „Das braucht Ihre Aufmerksamkeit".
 *
 * ## Was diese Fläche bewusst anders macht
 *
 * **Sie verschwindet, wenn nichts zu tun ist.** Kein „Alles erledigt"-Kasten,
 * der dauerhaft Platz belegt — nur eine schmale Bestätigungszeile. Eine
 * Fläche, die immer da ist, wird nach einer Woche nicht mehr gelesen; genau
 * das ist mit den elf Bestandszahlen darunter passiert.
 *
 * **Jede Zeile ist ein Klick zur Sache.** „226 offene Rechnungen" ohne Ziel
 * ist eine Feststellung; mit Ziel ist es eine Aufgabe. Der Filter steht schon
 * in der Adresse — man landet nicht auf der Liste, sondern auf den 226.
 *
 * **Sie steht ganz oben.** Über den Bestandszahlen, nicht zwischen ihnen.
 * Vorher standen „FRISTEN 90 TAGE 0" und „OFFENE RECHNUNGEN 226 offen"
 * gleichwertig nebeneinander — dieselbe Grösse, dieselbe Farbe, und nichts
 * sagte, welche der beiden Zahlen heute jemanden interessiert.
 *
 * ## Warum die Reihenfolge festliegt
 *
 * Die Reihenfolge kommt vom Server und ist nach Dringlichkeit sortiert, nicht
 * nach Anzahl. Zwei gescheiterte Importe wiegen schwerer als vierzig
 * auslaufende Verträge — der eine Fall reisst eine Lücke in die Abrechnung,
 * der andere ist Terminarbeit.
 */

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CloudOff,
  Receipt,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/useApiQuery";
import { cn } from "@/lib/utils";

interface Aufmerksamkeit {
  art: string;
  anzahl: number;
  text: string;
  href: string;
  dringend: boolean;
}

const SYMBOLE: Record<string, LucideIcon> = {
  "invoices-overdue": Receipt,
  "contracts-expiring": CalendarClock,
  "imports-failed": CloudOff,
  "votes-ending": Vote,
};

export function AttentionPanel() {
  const { data, isLoading, error } = useApiQuery<{ data: Aufmerksamkeit[] }>(
    ["dashboard-attention"],
    "/api/dashboard/attention",
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  // Ein Fehler hier darf das Dashboard nicht blockieren — die Bestandszahlen
  // darunter sind davon unabhaengig und weiter nuetzlich.
  if (error) return null;

  const punkte = data?.data ?? [];

  if (punkte.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span>Nichts Dringendes. Keine überfälligen Rechnungen, keine ablaufenden Fristen.</span>
      </div>
    );
  }

  const dringend = punkte.filter((p) => p.dringend).length;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        dringend > 0
          ? "border-destructive/40 bg-destructive/5"
          : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <AlertTriangle
            className={cn(
              "h-4 w-4",
              dringend > 0
                ? "text-destructive"
                : "text-amber-600 dark:text-amber-400",
            )}
            aria-hidden
          />
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Das braucht Ihre Aufmerksamkeit
          </h2>
        </div>

        <ul className="divide-y divide-border/60">
          {punkte.map((punkt) => {
            const Symbol = SYMBOLE[punkt.art] ?? AlertTriangle;
            return (
              <li key={punkt.art}>
                <Link
                  href={punkt.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors",
                    "hover:bg-foreground/5 focus-visible:bg-foreground/5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  )}
                >
                  <Symbol
                    className={cn(
                      "h-4 w-4 shrink-0",
                      punkt.dringend
                        ? "text-destructive"
                        : "text-amber-600 dark:text-amber-400",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 text-sm">{punkt.text}</span>
                  {/*
                    Der Pfeil, nicht bloss ein Zeigefinger-Cursor. Die
                    Kennzahlkarten sahen frueher klickbar aus, ohne es zu
                    sein — hier soll unmissverstaendlich sein, dass die Zeile
                    irgendwohin fuehrt.
                  */}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
