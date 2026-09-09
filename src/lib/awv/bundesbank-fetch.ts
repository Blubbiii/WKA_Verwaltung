/**
 * Bundesbank §247 BGB Basiszinssatz-Auto-Fetch.
 *
 * Die Bundesbank veröffentlicht den Basiszinssatz halbjährlich zum 01.01.
 * und 01.07. Die offizielle Datenquelle ist die SDMX-API:
 *   https://api.statistiken.bundesbank.de/rest/data/BBSIS/M.D.R.WJ.D7B.A.A.A?format=csv
 *
 * (BBSIS = Basiszinssatz nach §247 BGB, monatliche Beobachtung)
 *
 * Wir fetchen die CSV, parsen die letzten Werte und legen neue Zeilen
 * in der BaseInterestRate-Tabelle an, sofern noch nicht vorhanden.
 *
 * Aufruf:
 *   - Manuell über POST /api/cron/bundesbank-rate-fetch (Admin)
 *   - Automatisch über externen Cron (z.B. systemd-timer alle 7 Tage)
 *
 * Retry-Logik: Bei Netzwerk-Fehler wird ein Warning geloggt; die Funktion
 * wirft NICHT, damit der Cron-Job nicht eskaliert.
 */

import { prisma } from "@/lib/prisma";
import { jobLogger } from "@/lib/logger";

const logger = jobLogger.child({ component: "bundesbank-fetch" });

const BUNDESBANK_BBSIS_URL =
  "https://api.statistiken.bundesbank.de/rest/data/BBSIS/M.D.R.WJ.D7B.A.A.A?format=csv";

export interface BundesbankFetchResult {
  success: boolean;
  /** Neue Werte in der DB persistiert. */
  inserted: number;
  /** Bereits vorhandene Werte (übersprungen). */
  skipped: number;
  /** Fehler-Beschreibung, falls success=false. */
  error?: string;
  /** Letzter erfolgreich gefetchter Wert (für UI). */
  latestRate?: { validFrom: string; ratePercent: number };
}

interface ParsedRate {
  validFrom: Date;
  ratePercent: number;
}

/**
 * Pure Function: parsed Bundesbank-CSV (oder ein analog formatiertes
 * Tabellen-Format). CSV-Struktur (vereinfacht):
 *   "Date","Value"
 *   "2025-01-01","2.27"
 *   "2025-07-01","1.27"
 *   ...
 *
 * Erkennt sowohl ; als auch , als Separator.
 */
export function parseBundesbankCsv(csvText: string): ParsedRate[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const result: ParsedRate[] = [];

  for (const line of lines) {
    // Versuche beide Separatoren
    let parts = line.split(";").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) {
      parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    }
    if (parts.length < 2) continue;

    const dateStr = parts[0];
    const valStr = parts[1].replace(",", ".");

    // Datum-Parse: erwartet YYYY-MM-DD oder YYYY-MM
    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!dateMatch) continue;

    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const day = dateMatch[3] ? parseInt(dateMatch[3], 10) : 1;
    if (isNaN(year) || isNaN(month) || isNaN(day)) continue;

    const rate = parseFloat(valStr);
    if (isNaN(rate)) continue;

    // Nur 01.01. / 01.07. — sonst ist es kein offizieller Basiszinssatz-Stichtag
    if (day !== 1 || (month !== 1 && month !== 7)) continue;

    result.push({
      validFrom: new Date(Date.UTC(year, month - 1, day)),
      ratePercent: rate,
    });
  }

  return result;
}

/**
 * Holt die aktuelle Bundesbank-CSV und fügt neue Werte in die DB ein.
 * Idempotent über UNIQUE(validFrom).
 */
export async function fetchAndUpsertBundesbankRates(
  source: string = "Bundesbank §247 BGB (Auto-Fetch BBSIS)",
): Promise<BundesbankFetchResult> {
  try {
    const response = await fetch(BUNDESBANK_BBSIS_URL, {
      headers: { Accept: "text/csv" },
      // 10 Sekunden Timeout
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "Bundesbank-Fetch fehlgeschlagen — HTTP-Fehler",
      );
      return {
        success: false,
        inserted: 0,
        skipped: 0,
        error: `HTTP ${response.status}`,
      };
    }

    const csv = await response.text();
    const rates = parseBundesbankCsv(csv);

    if (rates.length === 0) {
      logger.warn("Bundesbank-CSV enthält keine parsebaren Werte");
      return {
        success: false,
        inserted: 0,
        skipped: 0,
        error: "Keine Werte in CSV",
      };
    }

    // In DB einfügen (idempotent)
    let inserted = 0;
    let skipped = 0;
    for (const r of rates) {
      const existing = await prisma.baseInterestRate.findUnique({
        where: { validFrom: r.validFrom },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.baseInterestRate.create({
        data: {
          validFrom: r.validFrom,
          ratePercent: r.ratePercent,
          source,
        },
      });
      inserted++;
    }

    const latest = rates[rates.length - 1];
    logger.info(
      { inserted, skipped, latest },
      "Bundesbank-Sätze aktualisiert",
    );

    return {
      success: true,
      inserted,
      skipped,
      latestRate: {
        validFrom: latest.validFrom.toISOString().slice(0, 10),
        ratePercent: latest.ratePercent,
      },
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Bundesbank-Fetch ausgefallen",
    );
    return {
      success: false,
      inserted: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
}
