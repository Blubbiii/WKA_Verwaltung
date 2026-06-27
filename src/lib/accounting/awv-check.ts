/**
 * C-2 Sprint 5: AWV-Meldepflicht (§11 AWG i.V.m. §67 AWV).
 *
 * Zahlungen ins/aus dem Ausland (Z4-Meldung) > 12.500 EUR sind monatlich
 * an die Deutsche Bundesbank zu melden. Diese Library prüft Zahlungen
 * gegen IBAN/BIC-Länder-Code und liefert eine Warnung bei meldepflichtigen
 * Beträgen.
 *
 * AWG = Außenwirtschaftsgesetz, AWV = Außenwirtschaftsverordnung.
 *
 * Hinweis: Diese Lib WARNT, sie meldet NICHT. Die tatsächliche Meldung
 * erfolgt manuell über das Bundesbank-Portal oder via Z4-XML.
 */

/**
 * §67 AWV (Außenwirtschaftsverordnung) — Meldepflichtgrenze für SEPA-Zahlungen
 * an ausländische Empfänger oder Zahlungen über deutsche Grenzen hinweg.
 *
 * FIXED BY LAW: dieser Wert ist gesetzlich fix und darf NICHT pro Tenant
 * konfigurierbar gemacht werden. Bei Änderung der AWV: Wert hier anpassen
 * (verlangt Code-Deploy, kein Settings-Toggle).
 */
export const AWV_THRESHOLD_EUR = 12500;

export interface AwvCheckInput {
  amountEur: number;
  /** IBAN des Empfängers (oder Senders bei Eingangszahlung). */
  iban?: string | null;
  /** BIC als Fallback wenn IBAN fehlt. */
  bic?: string | null;
  /** ISO-2-Country-Code als Fallback. */
  countryCode?: string | null;
}

export interface AwvCheckResult {
  /** True wenn Meldung erforderlich ist. */
  reportable: boolean;
  /** Begründung als Text für UI. */
  reason: string | null;
  /** Erkanntes Land (ISO-2). */
  detectedCountry: string | null;
  /** Empfohlene Meldungs-Kategorie (Z4 für Dienstleistungen, Z10 für Wertpapiere, etc.). */
  reportingForm: string | null;
}

/**
 * Extrahiert das Länder-Kürzel aus einer IBAN.
 * IBAN-Format: 2 Buchstaben (Land) + 2 Ziffern (Prüfsumme) + BBAN.
 */
export function getIbanCountry(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (clean.length < 4) return null;
  const country = clean.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(country)) return null;
  return country;
}

/**
 * Extrahiert das Länder-Kürzel aus einem BIC (Pos. 5-6).
 * BIC-Format: 4 Buchstaben (Bank) + 2 Buchstaben (Land) + 2 Zeichen (Ort) + 3 (Branch).
 */
export function getBicCountry(bic: string | null | undefined): string | null {
  if (!bic) return null;
  const clean = bic.replace(/\s/g, "").toUpperCase();
  if (clean.length < 6) return null;
  const country = clean.slice(4, 6);
  if (!/^[A-Z]{2}$/.test(country)) return null;
  return country;
}

/**
 * Prüft ob eine Zahlung AWV-meldepflichtig ist.
 */
export function checkAwvReportable(input: AwvCheckInput): AwvCheckResult {
  const amount = Math.abs(input.amountEur);
  if (amount <= AWV_THRESHOLD_EUR) {
    return {
      reportable: false,
      reason: null,
      detectedCountry: null,
      reportingForm: null,
    };
  }

  const country =
    input.countryCode?.toUpperCase() ??
    getIbanCountry(input.iban) ??
    getBicCountry(input.bic);

  if (!country) {
    return {
      reportable: false,
      reason: "Kein Länder-Code erkennbar — Annahme: Inland",
      detectedCountry: null,
      reportingForm: null,
    };
  }

  if (country === "DE") {
    return {
      reportable: false,
      reason: null,
      detectedCountry: "DE",
      reportingForm: null,
    };
  }

  return {
    reportable: true,
    reason: `Zahlung über ${AWV_THRESHOLD_EUR.toFixed(2)} € an Empfänger in ${country} ist AWV-Z4-meldepflichtig (§67 AWV).`,
    detectedCountry: country,
    reportingForm: "Z4", // Dienstleistungen / Übertragungen — Default für Pacht/Gehälter
  };
}
