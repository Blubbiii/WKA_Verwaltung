/**
 * Sample invoice for the letterhead preview. Fixed, consistent figures — the
 * preview is about the letterhead, not about a real invoice.
 */

import type { InvoiceItemPdfData, InvoicePdfData } from "@/types/pdf";

function position(nr: number, text: string, menge: number, einheit: string, preis: number): InvoiceItemPdfData {
  const netto = Math.round(menge * preis * 100) / 100;
  const steuer = Math.round(netto * 0.19 * 100) / 100;
  return {
    position: nr,
    description: text,
    quantity: menge,
    unit: einheit,
    unitPrice: preis,
    netAmount: netto,
    taxType: "STANDARD",
    taxRate: 19,
    taxAmount: steuer,
    grossAmount: Math.round((netto + steuer) * 100) / 100,
  };
}

export function musterRechnung(heute: Date = new Date()): InvoicePdfData {
  const items = [
    position(1, "Technische Betriebsführung (Muster)", 1, "Monat", 1200),
    position(2, "Begehung und Prüfbericht (Muster)", 2, "Std.", 150),
  ];
  const summe = (f: (p: InvoiceItemPdfData) => number) =>
    Math.round(items.reduce((s, p) => s + f(p), 0) * 100) / 100;
  const faellig = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + 30);

  return {
    invoiceNumber: "MUSTER-0001",
    invoiceType: "INVOICE",
    invoiceDate: heute,
    dueDate: faellig,
    status: "DRAFT",
    recipientName: "Musterfirma GmbH",
    recipientAddress: "Musterstraße 1\n12345 Musterstadt",
    serviceStartDate: null,
    serviceEndDate: null,
    paymentReference: "MUSTER-0001",
    internalReference: null,
    items,
    netAmount: summe((p) => p.netAmount),
    taxAmount: summe((p) => p.taxAmount),
    taxRate: 19,
    grossAmount: summe((p) => p.grossAmount),
    notes: "Dies ist eine Vorschau des Briefpapiers mit Beispieldaten.",
    paymentText: "Bitte überweisen Sie den Betrag bis zum Fälligkeitsdatum. Verwendungszweck: MUSTER-0001",
  };
}
