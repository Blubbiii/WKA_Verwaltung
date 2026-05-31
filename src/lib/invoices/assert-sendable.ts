/**
 * §14 UStG — Pflichtangaben-Validator für Rechnungen vor Versand.
 *
 * Der deutsche §14 UStG verlangt für jede ordentliche Rechnung:
 *  - Vollständiger Name + Anschrift des Leistungserbringers (Tenant)
 *  - Vollständiger Name + Anschrift des Leistungsempfängers
 *  - Steuernummer ODER USt-IdNr. des Leistungserbringers
 *  - Ausstellungsdatum (invoiceDate)
 *  - Fortlaufende Rechnungsnummer (immer vorhanden via numberGenerator)
 *  - Menge + Art der Leistung pro Position
 *  - Zeitpunkt / Zeitraum der Leistung (serviceStartDate/EndDate oder Datum)
 *  - Nettobetrag, Steuersatz, Steuerbetrag (oder Hinweis bei Steuerbefreiung)
 *
 * Wird VOR jedem Status-Übergang DRAFT → SENT geprüft. Wirft eine
 * SendableAssertionError mit konkreter Liste der fehlenden Pflichtangaben.
 */

import type { Invoice, InvoiceItem, Tenant } from "@prisma/client";

export class SendableAssertionError extends Error {
  constructor(
    public readonly missing: string[],
    message?: string,
  ) {
    super(
      message ??
        `Rechnung ist nicht §14-UStG-konform — fehlende Pflichtangaben: ${missing.join(", ")}`,
    );
    this.name = "SendableAssertionError";
  }
}

export interface AssertableInvoice
  extends Pick<
    Invoice,
    | "invoiceNumber"
    | "invoiceDate"
    | "recipientName"
    | "recipientAddress"
    | "serviceStartDate"
    | "serviceEndDate"
    | "netAmount"
    | "taxAmount"
    | "grossAmount"
  > {
  items: Pick<InvoiceItem, "description" | "netAmount">[];
}

export type AssertableTenant = Pick<
  Tenant,
  "name" | "taxId" | "vatId" | "address" | "city" | "postalCode" | "street"
>;

/**
 * Wirft SendableAssertionError wenn eine Pflichtangabe fehlt.
 * Caller sollte den Fehler in 422 Unprocessable Entity konvertieren.
 */
export function assertSendable(
  invoice: AssertableInvoice,
  tenant: AssertableTenant,
): void {
  const missing: string[] = [];

  // Tenant-Pflichtangaben (eigene Daten)
  if (!tenant.name?.trim()) missing.push("Eigener Firmenname (Tenant)");
  if (!tenant.taxId?.trim() && !tenant.vatId?.trim()) {
    missing.push("Eigene Steuernummer oder USt-IdNr.");
  }
  // Adresse: entweder konsolidierte address ODER street+postalCode+city
  const hasFullAddress =
    (tenant.street?.trim() && tenant.postalCode?.trim() && tenant.city?.trim()) ||
    (tenant.address?.trim() &&
      tenant.address.includes(",") /* heuristisch: "Straße, PLZ Stadt" */);
  if (!hasFullAddress) missing.push("Vollständige eigene Anschrift (Straße, PLZ, Stadt)");

  // Empfänger-Pflichtangaben
  if (!invoice.recipientName?.trim()) missing.push("Name/Firmenname des Empfängers");
  if (!invoice.recipientAddress?.trim()) {
    missing.push("Anschrift des Empfängers");
  } else {
    // Mindest-Plausibilität: Adresse sollte mind. eine Ziffer (PLZ/Hausnr) enthalten
    if (!/\d/.test(invoice.recipientAddress)) {
      missing.push("Anschrift des Empfängers (PLZ/Hausnummer scheint zu fehlen)");
    }
  }

  // Datum + Nummer
  if (!invoice.invoiceNumber?.trim()) missing.push("Rechnungsnummer");
  if (!invoice.invoiceDate) missing.push("Rechnungsdatum");

  // Leistungs-/Lieferdatum: entweder serviceStartDate (Einzel) oder Zeitraum
  if (!invoice.serviceStartDate && !invoice.serviceEndDate) {
    missing.push("Leistungs-/Lieferdatum (serviceStartDate oder serviceEndDate)");
  }

  // Positionen
  if (!invoice.items || invoice.items.length === 0) {
    missing.push("Mindestens eine Rechnungsposition");
  } else {
    const emptyDescriptions = invoice.items.filter(
      (it) => !it.description?.trim(),
    );
    if (emptyDescriptions.length > 0) {
      missing.push(
        `Beschreibung in ${emptyDescriptions.length} Position(en)`,
      );
    }
  }

  // Beträge & Plausibilität (Tax-Aufschlüsselung muss konsistent zur grossAmount sein)
  const net = Number(invoice.netAmount ?? 0);
  const tax = Number(invoice.taxAmount ?? 0);
  const gross = Number(invoice.grossAmount ?? 0);

  if (gross <= 0) missing.push("Bruttobetrag muss > 0 sein");

  // Toleranz 2 Cent für Rundungsdifferenzen
  if (Math.abs(net + tax - gross) > 0.02) {
    missing.push(
      `Betrags-Inkonsistenz: netto (${net.toFixed(2)}) + Steuer (${tax.toFixed(2)}) ≠ brutto (${gross.toFixed(2)})`,
    );
  }

  if (missing.length > 0) {
    throw new SendableAssertionError(missing);
  }
}

/**
 * Type guard for the validator's error type.
 */
export function isSendableAssertionError(
  err: unknown,
): err is SendableAssertionError {
  return err instanceof SendableAssertionError;
}
