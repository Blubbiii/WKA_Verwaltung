/**
 * SCADA-Messintervall — eine Stelle statt fünf.
 *
 * Der Wert stand als eigene Konstante in fünf Modulen: analytics/query-helpers,
 * curtailment/event-service, faults/valuation-service, scada/aggregation und
 * scada/anomaly-detection. Alle fünf mit demselben Wert, alle fünf unabhängig
 * änderbar.
 *
 * Das ist gefährlicher, als es aussieht. Aus dem Intervall wird die ARBEIT
 * gerechnet — Leistung × Intervalldauer. Wird eine der fünf Stellen angepasst
 * und eine andere nicht, rechnen Ertragsausfall (§ 6 Verfügbarkeitsgarantie)
 * und Abregelungsentschädigung (§ 13a EnWG) mit unterschiedlichen Dauern.
 * Beide Ergebnisse sähen plausibel aus, nur eines wäre richtig, und nichts im
 * System würde widersprechen.
 *
 * ## Warum das eine ANNAHME ist, keine Messung
 *
 * Weder das Datenmodell noch der Import halten fest, in welchem Takt eine
 * Quelle liefert. `TurbineProduction` ist auf Enercon-WSD zugeschnitten
 * (10-Minuten-Mittelwerte, siehe schema.prisma), und die 10 wird überall
 * einfach vorausgesetzt.
 *
 * ## Zur Env-Variablen — und ihrer Grenze
 *
 * `SCADA_INTERVAL_MINUTES` erlaubt eine Anlage mit abweichendem Takt, ohne
 * neu zu bauen. Sie gilt aber **systemweit**. Sobald zwei Quellen mit
 * unterschiedlichem Takt nebeneinander laufen, ist jeder globale Wert für eine
 * von beiden falsch — dann ist der richtige Schritt ein Feld am Park bzw. an
 * der SCADA-Quelle, nicht ein anderer Wert hier.
 *
 * Der Wert muss 60 ohne Rest teilen, sonst ergibt `INTERVALS_PER_HOUR` keine
 * ganze Zahl und alle Stundensummen wären still verschoben.
 */

import { logger as baseLogger } from "@/lib/logger";

const logger = baseLogger.child({ module: "scada" });

const DEFAULT_INTERVAL_MINUTES = 10;

function readInterval(): number {
  const raw = process.env.SCADA_INTERVAL_MINUTES;
  if (!raw) return DEFAULT_INTERVAL_MINUTES;

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0 || 60 % parsed !== 0) {
    // Laut scheitern lassen wäre hier zu hart — die Anwendung liefe sonst
    // wegen eines Tippfehlers in einer Env-Variablen gar nicht. Aber still
    // auf den Standard zurückfallen darf sie auch nicht: dann rechnete sie
    // mit 10, während der Betreiber 15 gesetzt zu haben glaubt.
    logger.error(
      { value: raw, fallback: DEFAULT_INTERVAL_MINUTES },
      "[SCADA] SCADA_INTERVAL_MINUTES ist ungültig (muss ein Teiler von 60 sein). " +
        "Es wird mit dem Standardwert gerechnet — alle Arbeitswerte beziehen sich " +
        "damit NICHT auf den konfigurierten Takt.",
    );
    return DEFAULT_INTERVAL_MINUTES;
  }

  if (parsed !== DEFAULT_INTERVAL_MINUTES) {
    logger.warn(
      { intervalMinutes: parsed, default: DEFAULT_INTERVAL_MINUTES },
      "[SCADA] Abweichendes Messintervall konfiguriert — gilt systemweit für ALLE Quellen",
    );
  }

  return parsed;
}

/** Dauer eines SCADA-Messintervalls in Minuten (Enercon WSD: 10-Minuten-Mittel). */
export const SCADA_INTERVAL_MINUTES = readInterval();

/** Messintervalle pro Stunde. Ganzzahlig, weil der Wert 60 teilt. */
export const SCADA_INTERVALS_PER_HOUR = 60 / SCADA_INTERVAL_MINUTES;

/** Messintervalle pro Tag. */
export const SCADA_INTERVALS_PER_DAY = 24 * SCADA_INTERVALS_PER_HOUR;

/** Intervalldauer als Bruchteil einer Stunde — der Faktor Leistung → Arbeit. */
export const SCADA_INTERVAL_HOURS = SCADA_INTERVAL_MINUTES / 60;
