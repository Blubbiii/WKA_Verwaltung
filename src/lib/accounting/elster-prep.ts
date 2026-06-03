/**
 * ELSTER-Vorbereitungs-Adapter (Skelett).
 *
 * Konvertiert ein UstvaResult in das JSON-Payload-Format, das die
 * ERiC-C-Library für die Datenart "UStVA" erwartet. Die eigentliche
 * Übermittlung an ELSTER-Server erfolgt nicht hier — ERiC ist eine
 * geschlossene Library der Finanzverwaltung mit eigener Lizenz, die
 * über einen Side-Car-Service oder ein natives Node-Addon angesprochen
 * werden muss.
 *
 * Aktuell liefert dieser Adapter:
 *  - Das vollständige ERiC-JSON-Format (kennzahl-basiert)
 *  - Den Validierungs-Status (alle Pflicht-Kennzahlen vorhanden?)
 *  - Eine humanlesbare Vorschau für die UI
 *
 * Pflicht-Kennzahlen für eine vollständige UStVA:
 *  - mindestens eine Umsatz-Kennzahl (81, 86, 41, 43, 89) ODER eine
 *    Vorsteuer-Kennzahl (66, 61, 60, 93) muss vorhanden sein
 *  - Steuernummer + Voranmeldezeitraum + Berichtigung-Flag immer
 *
 * Hinweis: Beträge werden für ELSTER ohne Nachkommastellen erwartet
 * (volle Euro, kaufmännisch gerundet). Steuern als Cent-Beträge.
 */

import type { UstvaResult } from "./reports/ustva";

export type ElsterDatenart = "UStVA" | "UStErklaerung" | "Bilanz5b" | "GewSt";

export interface ElsterContext {
  /** 10-stellige Steuernummer im Format des Bundeslandes. */
  steuernummer: string;
  /** ELSTER-Format: "NNNNNNNNNNN" (11 Stellen, Bundesland-Variante). */
  bufaNummer?: string;
  /** ISO-Land-Code, default "DE". */
  landIso?: string;
  /** "berichtigte" Anmeldung? Default false = Erst-Anmeldung. */
  berichtigt?: boolean;
  /** Voranmeldezeitraum, z.B. "01" für Januar, "Q1" für 1. Quartal. */
  zeitraum: string;
  /** Vierstellig, z.B. "2026". */
  steuerjahr: string;
  /** Name & Anschrift des Unternehmens (für Kopfdaten). */
  unternehmen: {
    name: string;
    strasseHausnr?: string;
    plzOrt?: string;
  };
}

export interface ElsterUstvaPayload {
  /** Konstante Datenart-Kennung. */
  datenart: "UStVA";
  /** ERiC-Schema-Version (intern; UI muss das nicht prüfen). */
  schemaVersion: string;
  /** Steuernummer + Period + Berichtigung. */
  header: {
    steuernummer: string;
    bufaNummer?: string;
    landIso: string;
    berichtigt: boolean;
    zeitraum: string;
    steuerjahr: string;
    unternehmen: ElsterContext["unternehmen"];
  };
  /** Kennzahl → Wert (in Euro für Bemessungsgrundlagen, Cent für Steuern). */
  kennzahlen: Record<string, number>;
  /** Total der USt-Zahllast in Euro (positiv = Zahllast, negativ = Erstattung). */
  zahllastEur: number;
}

export interface ElsterPrepResult {
  payload: ElsterUstvaPayload;
  /** Pre-Submit-Validierung: leere Liste = kann übermittelt werden. */
  errors: string[];
  /** Hinweise/Warnings ohne Blocker. */
  warnings: string[];
  /** Lesbares Summary für die UI. */
  summary: {
    kennzahlCount: number;
    netTotal: number;
    taxTotal: number;
    zahllast: number;
  };
}

const SCHEMA_VERSION = "ust-2026-01";

const PFLICHT_UMSATZ_KZ = new Set(["81", "86", "41", "43", "89"]);
const PFLICHT_VORSTEUER_KZ = new Set(["66", "61", "60", "93"]);

/**
 * Bereitet UstvaResult für die ELSTER-Übermittlung vor.
 *
 * Erzeugt das ERiC-JSON-Payload-Skelett, validiert die Pflichtfelder
 * und liefert eine humanlesbare Zusammenfassung. Es wird KEINE
 * Übermittlung ausgeführt.
 */
export function prepareElsterUstva(
  ustva: UstvaResult,
  context: ElsterContext,
): ElsterPrepResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (ustva.kleinunternehmer) {
    errors.push(
      "Tenant ist Kleinunternehmer nach §19 UStG — keine UStVA-Abgabe notwendig",
    );
  }

  if (!/^\d{8,13}$/.test(context.steuernummer.replace(/\D/g, ""))) {
    errors.push(
      "Steuernummer fehlt oder hat ungültiges Format (8-13 Ziffern erwartet)",
    );
  }
  if (!context.zeitraum) errors.push("Voranmeldezeitraum fehlt");
  if (!/^\d{4}$/.test(context.steuerjahr)) errors.push("Steuerjahr ungültig");
  if (!context.unternehmen?.name) errors.push("Unternehmensname fehlt");

  const kennzahlen: Record<string, number> = {};
  for (const line of ustva.lines) {
    if (line.amount !== 0) {
      kennzahlen[line.kennzahl] = Math.round(line.amount);
    }
    if (line.taxAmount !== 0) {
      // Steuer-Kennzahlen für Bemessungsgrundlage haben oft eine
      // separate Steuer-Kennzahl in ELSTER; wir liefern beide.
      kennzahlen[`${line.kennzahl}_steuer`] = Math.round(line.taxAmount * 100); // Cent
    }
  }

  const hatUmsatz = ustva.lines.some(
    (l) => PFLICHT_UMSATZ_KZ.has(l.kennzahl) && l.amount > 0,
  );
  const hatVorsteuer = ustva.lines.some(
    (l) => PFLICHT_VORSTEUER_KZ.has(l.kennzahl) && l.taxAmount > 0,
  );
  if (!hatUmsatz && !hatVorsteuer && !ustva.kleinunternehmer) {
    warnings.push(
      "Keine Umsätze und keine Vorsteuer im Zeitraum — Nullmeldung wird übermittelt",
    );
  }

  if (Array.isArray(ustva.warnings) && ustva.warnings.length > 0) {
    warnings.push(
      ...ustva.warnings.map((w) => `UStVA-Aggregation: ${typeof w === "string" ? w : JSON.stringify(w)}`),
    );
  }

  const payload: ElsterUstvaPayload = {
    datenart: "UStVA",
    schemaVersion: SCHEMA_VERSION,
    header: {
      steuernummer: context.steuernummer,
      bufaNummer: context.bufaNummer,
      landIso: context.landIso ?? "DE",
      berichtigt: context.berichtigt ?? false,
      zeitraum: context.zeitraum,
      steuerjahr: context.steuerjahr,
      unternehmen: context.unternehmen,
    },
    kennzahlen,
    zahllastEur: Math.round(ustva.balance),
  };

  return {
    payload,
    errors,
    warnings,
    summary: {
      kennzahlCount: Object.keys(kennzahlen).length,
      netTotal: Math.round(
        ustva.lines.reduce((s, l) => s + l.amount, 0),
      ),
      taxTotal: Math.round(
        ustva.lines.reduce((s, l) => s + l.taxAmount, 0) * 100,
      ) / 100,
      zahllast: Math.round(ustva.balance * 100) / 100,
    },
  };
}
