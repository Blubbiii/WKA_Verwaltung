/**
 * §14/§15 UStG Pflichtangaben-Validator für EINGEHENDE Rechnungen (P13).
 *
 * Voraussetzung für Vorsteuerabzug §15 Abs. 1 UStG: die Rechnung muss
 * §14 Abs. 4 UStG Pflichtangaben erfüllen. Fehlt eine, riskiert der
 * Mandant den Vorsteuerabzug bei der Betriebsprüfung.
 *
 * Pflichtangaben §14 Abs. 4 UStG:
 *  1. Vollständiger Name + Anschrift des leistenden Unternehmers (Lieferant)
 *  2. Vollständiger Name + Anschrift des Leistungsempfängers (= Tenant)
 *  3. Steuernummer ODER USt-IdNr. des Leistenden
 *  4. Ausstellungsdatum (invoiceDate)
 *  5. Fortlaufende Rechnungsnummer des Leistenden (invoiceNumber)
 *  6. Menge + Art (handelsübliche Bezeichnung) der Leistung
 *  7. Zeitpunkt der Lieferung/Leistung
 *  8. Nettobetrag, Steuersatz, Steuerbetrag — ODER Hinweis bei Steuerbefreiung
 *  9. Bei §13b: Hinweis "Steuerschuldnerschaft des Leistungsempfängers"
 *
 * Bei Kleinbetragsrechnungen ≤ 250 € (§33 UStDV) reichen reduzierte Angaben —
 * wir prüfen das anhand des grossAmount.
 *
 * Wird VOR jedem Status-Übergang APPROVED (oder PAID falls direkt) geprüft.
 * Wirft VorsteuerCapabilityError mit konkreter Liste der fehlenden Angaben.
 */

import type { IncomingInvoice } from "@prisma/client";

export class VorsteuerCapabilityError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `§14 UStG Pflichtangaben fehlen — Vorsteuerabzug §15 gefährdet: ${missing.join(", ")}`,
    );
    this.name = "VorsteuerCapabilityError";
  }
}

const KLEINBETRAG_THRESHOLD_EUR = 250;

/** Minimum-Felder die wir vom IncomingInvoice für die Validierung brauchen. */
export type ValidatableIncomingInvoice = Pick<
  IncomingInvoice,
  | "invoiceNumber"
  | "invoiceDate"
  | "vendorId"
  | "vendorNameFallback"
  | "netAmount"
  | "vatAmount"
  | "grossAmount"
  | "vatRate"
  | "supplierTaxId"
>;

/** Lieferant-Snapshot (denormalisierte Adresse). Aus Vendor geladen. */
export interface ValidatableVendor {
  name: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  taxId: string | null;
  vatId: string | null;
}

/**
 * Wirft VorsteuerCapabilityError wenn Pflichtangaben fehlen.
 * Bei Kleinbetragsrechnung (≤250€ brutto) reduzierte Anforderungen.
 */
export function assertVorsteuerCapable(
  invoice: ValidatableIncomingInvoice,
  vendor: ValidatableVendor | null,
): void {
  const missing: string[] = [];
  const gross = Number(invoice.grossAmount ?? 0);
  const isKleinbetrag = gross > 0 && gross <= KLEINBETRAG_THRESHOLD_EUR;

  // (1) Lieferant — entweder verknüpfter Vendor mit Namen oder Fallback-Name.
  const vendorName = vendor?.name?.trim() || invoice.vendorNameFallback?.trim();
  if (!vendorName) {
    missing.push("Name des Lieferanten");
  }

  // Kleinbetragsrechnung (§33 UStDV): Lieferant-Adresse und Steuernummer reichen
  // formal als "vollständiger Name". Bei normalen Rechnungen prüfen wir mehr.
  if (!isKleinbetrag) {
    if (vendor) {
      if (!vendor.street?.trim()) missing.push("Anschrift des Lieferanten (Straße)");
      if (!vendor.postalCode?.trim() || !vendor.city?.trim()) {
        missing.push("Anschrift des Lieferanten (PLZ/Ort)");
      }
    } else if (!invoice.vendorNameFallback?.trim()) {
      // Kein Vendor-Record und kein Fallback-Name → mindestens 1 fehlt.
      missing.push("Anschrift des Lieferanten");
    }

    // (3) Steuernummer ODER USt-IdNr. des Leistenden.
    const hasTaxId =
      vendor?.taxId?.trim() ||
      vendor?.vatId?.trim() ||
      invoice.supplierTaxId?.trim();
    if (!hasTaxId) {
      missing.push("Steuernummer oder USt-IdNr. des Lieferanten");
    }

    // (5) Fortlaufende Rechnungsnummer
    if (!invoice.invoiceNumber?.trim()) {
      missing.push("Rechnungsnummer des Lieferanten");
    }
  }

  // (4) Ausstellungsdatum — auch bei Kleinbetrag Pflicht
  if (!invoice.invoiceDate) {
    missing.push("Rechnungsdatum");
  }

  // (8) Beträge — auch bei Kleinbetrag Pflicht
  if (gross <= 0) missing.push("Bruttobetrag > 0");

  // Bei Standardrechnung: Netto + USt müssen plausibel sein
  if (!isKleinbetrag) {
    const net = Number(invoice.netAmount ?? 0);
    const vat = Number(invoice.vatAmount ?? 0);

    if (net === 0 && vat === 0 && gross > 0) {
      // Aufschlüsselung fehlt komplett — bei normalen Rechnungen ist das ein
      // Vorsteuer-Risiko. Bei Reverse-Charge erlauben wir es (separater Pfad).
      missing.push("Netto/USt-Aufschlüsselung (bei Standardrechnungen Pflicht)");
    } else if (net > 0 && Math.abs(net + vat - gross) > 0.02) {
      missing.push(
        `Betrags-Inkonsistenz: netto (${net.toFixed(2)}) + USt (${vat.toFixed(2)}) ≠ brutto (${gross.toFixed(2)})`,
      );
    }
  }

  if (missing.length > 0) {
    throw new VorsteuerCapabilityError(missing);
  }
}

export function isVorsteuerCapabilityError(
  err: unknown,
): err is VorsteuerCapabilityError {
  return err instanceof VorsteuerCapabilityError;
}
