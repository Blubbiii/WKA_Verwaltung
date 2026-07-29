/**
 * Nummernkreis und Idempotenz im Billing-Worker (F9, F12, F13, F15).
 *
 * Der Nummernkreis muss nach GoBD lueckenlos sein — eine reservierte, aber nie
 * verwendete Rechnungsnummer ist ein Befund. Und ein Retry darf keine zweite
 * Rechnung erzeugen. Beide Regeln sind hier festgehalten.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function read(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), "utf-8");
}

const billingWorker = read("lib/queue/workers/billing.worker.ts");

// ---------------------------------------------------------------------------
// F13 · Nummern erst ziehen, wenn sie auch verwendet werden
// ---------------------------------------------------------------------------

describe("Bulk-Invoice Nummernkreis (F13)", () => {
  it("die Nummernvergabe liegt HINTER dem Idempotenz-Check", () => {
    // Vorher wurden shareholders.length Nummern vorab reserviert und der
    // Check lief erst in der Schleife: ein Retry fuer 300 Gesellschafter, von
    // denen 298 existierten, verbrannte 298 Nummern.
    const checkIndex = billingWorker.indexOf("const existingInvoices = await prisma.invoice.findMany");
    const reserveIndex = billingWorker.indexOf("getNextInvoiceNumbers(");
    expect(checkIndex).toBeGreaterThan(-1);
    expect(reserveIndex).toBeGreaterThan(-1);
    expect(reserveIndex).toBeGreaterThan(checkIndex);
  });

  it("reserviert genau so viele Nummern wie zu erzeugende Rechnungen", () => {
    expect(billingWorker).toMatch(/getNextInvoiceNumbers\([\s\S]{0,120}toCreate\.length/);
    expect(billingWorker).not.toMatch(/getNextInvoiceNumbers\([\s\S]{0,120}shareholders\.length/);
  });

  it("der Existenz-Check laeuft als eine Abfrage, nicht als N", () => {
    // Nebeneffekt der Umstellung: ein findMany mit `in` statt N x findFirst.
    expect(billingWorker).toContain("internalReference: { in: shareholders.map(");
  });

  it("Positionen ohne Ausschuettungsanteil verbrauchen keine Nummer", () => {
    const filterIndex = billingWorker.indexOf("Kein Ausschuettungsanteil definiert");
    const reserveIndex = billingWorker.indexOf("getNextInvoiceNumbers(");
    expect(filterIndex).toBeGreaterThan(-1);
    expect(filterIndex).toBeLessThan(reserveIndex);
  });

  it("der Fortschritt bezieht sich auf die tatsaechlich erzeugten Positionen", () => {
    expect(billingWorker).toContain("(i + 1) / toCreate.length");
  });
});

// ---------------------------------------------------------------------------
// F12 · Einzelrechnung braucht einen Idempotenzschluessel
// ---------------------------------------------------------------------------

describe("Einzelrechnung Idempotenz (F12)", () => {
  it("es gibt einen Marker, der an der Job-ID haengt", () => {
    expect(billingWorker).toContain("const idempotencyMarker = `SINGLE:${data.jobId}`");
  });

  it("der Check liegt vor der Nummernvergabe", () => {
    const checkIndex = billingWorker.indexOf("const existingInvoice = await prisma.invoice.findFirst");
    const reserveIndex = billingWorker.indexOf("getNextInvoiceNumber(");
    expect(checkIndex).toBeGreaterThan(-1);
    expect(reserveIndex).toBeGreaterThan(checkIndex);
  });

  it("der Marker wird auch gespeichert, sonst greift der Check beim Retry nicht", () => {
    expect(billingWorker).toContain("internalReference: idempotencyMarker");
  });

  it("ein zweiter Lauf meldet Erfolg mit der bestehenden Rechnung", () => {
    expect(billingWorker).toMatch(/Invoice already exists — idempotent skip/);
  });
});

// ---------------------------------------------------------------------------
// F9 · Mahnstufe und Gebuehr strukturiert festhalten
// ---------------------------------------------------------------------------

describe("Mahnwesen Persistenz (F9)", () => {
  it("die Mahnstufe wird auf der Rechnung gespeichert", () => {
    expect(billingWorker).toContain("reminderLevel: data.reminderLevel");
    expect(billingWorker).toContain("reminderSentAt: now");
  });

  it("die Mahnstufe wird nur vorwaerts gesetzt", () => {
    // Sonst koennte ein spaeterer Lauf mit niedrigerer Stufe zurueckdrehen.
    expect(billingWorker).toMatch(
      /invoice\.reminderLevel === null \|\| invoice\.reminderLevel < data\.reminderLevel/,
    );
  });

  it("die Gebuehr landet als DunningItem, nicht nur im Freitext", () => {
    // sumOpenDunningCharges() liest DunningItem — ohne Eintrag bekommt der
    // Kunde beim Zahlen von Rechnung + Gebuehr einen OverpaymentError.
    expect(billingWorker).toContain("tx.dunningRun.create");
    expect(billingWorker).toContain("feeAmount: lateFee");
  });

  it("gemahnt wird der offene Betrag, nicht der Bruttobetrag", () => {
    expect(billingWorker).toContain("const openAmount = Math.max(");
    expect(billingWorker).toContain("amount: formatCurrency(openAmount)");
  });

  it("Notiz, Stufe und Gebuehr entstehen in einer Transaktion", () => {
    expect(billingWorker).toContain("await prisma.$transaction(async (tx) => {");
  });
});

// ---------------------------------------------------------------------------
// F15 · OCR-Lock und haengender PROCESSING-Status
// ---------------------------------------------------------------------------

describe("Inbox-OCR Lock (F15)", () => {
  const ocrWorker = read("lib/queue/workers/inbox-ocr.worker.ts");

  it("es gibt eine lockDuration ueber dem BullMQ-Default von 30s", () => {
    // Tesseract auf 12 Seiten braucht ~90 s; mit 30 s Lock galt der Job als
    // stalled und wurde erneut zugestellt: zwei parallele OCR-Laeufe.
    const match = ocrWorker.match(/lockDuration:\s*([0-9_]+)/);
    expect(match, "keine lockDuration gesetzt").toBeTruthy();
    const value = Number(match![1].replace(/_/g, ""));
    expect(value).toBeGreaterThan(30_000);
  });

  it("ein stalled-Event fuehrt zum Fehlschlag statt zur Neuzustellung", () => {
    expect(ocrWorker).toContain("maxStalledCount: 1");
  });

  it("der failed-Handler loest den haengenden PROCESSING-Status", () => {
    expect(ocrWorker).toMatch(/ocrStatus: "PROCESSING"[\s\S]{0,200}ocrStatus: "FAILED"/);
  });

  it("der Reset ueberschreibt keinen bereits korrekten Status", () => {
    // updateMany mit ocrStatus PROCESSING in der where-Klausel.
    expect(ocrWorker).toContain("prisma.incomingInvoice.updateMany");
  });
});
