/**
 * Tests für den Belegexport an den Steuerberater.
 *
 * Geprüft wird das, was beim Empfänger ankommt: das Verzeichnis. Ob JSZip
 * komprimieren kann, ist nicht unsere Sorge — ob ein Firmenname mit Semikolon
 * die Zeile zerreisst, schon.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import JSZip from "jszip";

const findMany = vi.fn();
const pdf = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { invoice: { findMany: (...a: unknown[]) => findMany(...a) } },
}));
vi.mock("@/lib/pdf/generators/invoicePdf", () => ({
  generateInvoicePdf: (...a: unknown[]) => pdf(...a),
}));
vi.mock("@/lib/logger", () => ({
  apiLogger: { child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) },
}));

import {
  erzeugeBelegExport,
  KeineBelegeError,
  ZuVieleBelegeError,
  MAX_BELEGE,
} from "./beleg-export";

const VON = "2026-03-01";
const BIS = "2026-03-31";

function beleg(over: Record<string, unknown> = {}) {
  return {
    id: "i1",
    invoiceNumber: "RG-2026-0001",
    invoiceType: "INVOICE",
    invoiceDate: new Date("2026-03-15T00:00:00.000Z"),
    serviceStartDate: new Date("2026-03-01T00:00:00.000Z"),
    serviceEndDate: new Date("2026-03-31T00:00:00.000Z"),
    recipientName: "Windpark Nord GmbH",
    netAmount: 1000,
    taxAmount: 190,
    grossAmount: 1190,
    currency: "EUR",
    status: "SENT",
    ...over,
  };
}

async function verzeichnis(zip: Buffer): Promise<string> {
  const geladen = await JSZip.loadAsync(zip);
  const datei = geladen.file("Rechnungsausgang.csv");
  expect(datei, "Rechnungsausgang.csv fehlt im ZIP").not.toBeNull();
  return datei!.async("string");
}

beforeEach(() => {
  findMany.mockReset();
  pdf.mockReset();
  pdf.mockResolvedValue(Buffer.from("%PDF-1.4 test"));
});

describe("Belegexport", () => {
  it("ohne Belege wird nicht geliefert, sondern gesagt", async () => {
    findMany.mockResolvedValue([]);
    await expect(
      erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS }),
    ).rejects.toBeInstanceOf(KeineBelegeError);
  });

  it("Entwuerfe bleiben draussen", async () => {
    findMany.mockResolvedValue([beleg()]);
    await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });

    const wo = findMany.mock.calls[0][0].where;
    expect(
      wo.status,
      "Ein Entwurf ist noch keine Rechnung im Sinne des § 14 UStG und hat " +
        "beim Steuerberater nichts verloren",
    ).toEqual({ not: "DRAFT" });
    expect(wo.tenantId, "Ohne Mandantenfilter waeren fremde Belege im ZIP").toBe("t1");
    expect(wo.deletedAt).toBeNull();
  });

  it("PDF und Verzeichnis landen im ZIP", async () => {
    findMany.mockResolvedValue([beleg()]);
    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });

    const geladen = await JSZip.loadAsync(e.zip);
    expect(geladen.file("Belege/RG-2026-0001.pdf")).not.toBeNull();
    expect(e.gesamt).toBe(1);
    expect(e.fehlgeschlagen).toEqual([]);

    const csv = await verzeichnis(e.zip);
    expect(csv).toContain("RG-2026-0001");
    expect(csv).toContain("Belege/RG-2026-0001.pdf");
  });

  it("ein Semikolon im Firmennamen zerreisst die Zeile nicht", async () => {
    /*
      „Müller; Meier GbR" ist ein zulaessiger Firmenname. Ohne Maskierung
      verschiebt sich die ganze Zeile, und im Verzeichnis stehen Betraege in
      der falschen Spalte — etwas, das niemand nachrechnet.
    */
    findMany.mockResolvedValue([beleg({ recipientName: 'Müller; Meier "GbR"' })]);
    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });
    const csv = await verzeichnis(e.zip);

    const datenzeile = csv.split("\r\n")[1];
    expect(datenzeile).toContain('"Müller; Meier ""GbR"""');
    // Kopf und Datenzeile muessen gleich viele Felder haben.
    const felder = (z: string) => z.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/).length;
    expect(
      felder(datenzeile),
      "Die Datenzeile hat eine andere Spaltenzahl als der Kopf",
    ).toBe(felder(csv.split("\r\n")[0]));
  });

  it("ein fehlgeschlagenes PDF kippt nicht den ganzen Export", async () => {
    findMany.mockResolvedValue([
      beleg({ id: "i1", invoiceNumber: "RG-0001" }),
      beleg({ id: "i2", invoiceNumber: "RG-0002" }),
    ]);
    pdf.mockImplementation((id: string) =>
      id === "i1" ? Promise.reject(new Error("kaputt")) : Promise.resolve(Buffer.from("x")),
    );

    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });

    expect(
      e.fehlgeschlagen,
      "Der Fehlschlag muss gemeldet werden — eine stille Luecke in einer " +
        "Belieferung des Steuerberaters ist das Schlimmste, was passieren kann",
    ).toEqual(["RG-0001"]);
    expect(e.gesamt, "Beide Belege stehen im Verzeichnis").toBe(2);

    const csv = await verzeichnis(e.zip);
    expect(csv, "Der Beleg ohne PDF steht drin, aber ohne Dateiverweis").toContain("RG-0001;");
    const geladen = await JSZip.loadAsync(e.zip);
    expect(geladen.file("Belege/RG-0002.pdf")).not.toBeNull();
  });

  it("das Verzeichnis beginnt mit einer BOM", async () => {
    // Sonst macht Excel aus „Müller" ein „MÃ¼ller" — die Datei geht an einen
    // Steuerberater und soll beim Doppelklick stimmen.
    findMany.mockResolvedValue([beleg()]);
    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });
    expect((await verzeichnis(e.zip)).charCodeAt(0)).toBe(0xfeff);
  });

  it("Betraege stehen im deutschen Format", async () => {
    findMany.mockResolvedValue([beleg({ netAmount: 1234.5, grossAmount: 1469.06 })]);
    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });
    const csv = await verzeichnis(e.zip);
    expect(csv).toContain("1234,50");
    expect(csv).toContain("1469,06");
  });

  it("Gutschriften sind als solche benannt", async () => {
    findMany.mockResolvedValue([beleg({ invoiceType: "CREDIT_NOTE" })]);
    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });
    expect(await verzeichnis(e.zip)).toContain("Gutschrift");
  });

  /* ---- Befunde aus der Gegenpruefung durch ein zweites Modell ---- */

  it("filtert nach DEUTSCHEN Kalendertagen, nicht nach UTC-Tagen", async () => {
    /*
      `invoiceDate` ist nicht durchgehend auf Mitternacht normalisiert — die
      Sammelanlage von Abrechnungen legt einen Zeitstempel ab. Eine Rechnung
      vom 1. April, 00:30 deutscher Zeit, steht als 31. März 22:30 UTC in der
      Datenbank.

      Nach UTC gefiltert landete sie im Maerz-Export und fehlte im April.
      Beides faellt niemandem auf, bis der Steuerberater eine Luecke findet.
    */
    const spaetInBerlin = new Date("2026-03-31T22:30:00.000Z"); // = 1.4. 00:30 MESZ
    findMany.mockResolvedValue([beleg({ invoiceDate: spaetInBerlin })]);

    await expect(
      erzeugeBelegExport({ tenantId: "t1", von: "2026-03-01", bis: "2026-03-31" }),
      "Der Beleg gehoert in den April, nicht in den Maerz",
    ).rejects.toBeInstanceOf(KeineBelegeError);

    findMany.mockResolvedValue([beleg({ invoiceDate: spaetInBerlin })]);
    const april = await erzeugeBelegExport({
      tenantId: "t1",
      von: "2026-04-01",
      bis: "2026-04-30",
    });
    expect(april.gesamt, "Im April-Export muss er auftauchen").toBe(1);
  });

  it("bereinigte Dateinamen kollidieren nicht", async () => {
    /*
      `RG/1` und `RG:1` werden beide zu `RG_1`. JSZip ueberschreibt bei
      gleichem Pfad stillschweigend — im Verzeichnis staenden zwei Rechnungen,
      im ZIP laege eine, und beide Zeilen verwiesen auf dieselbe Datei.
    */
    findMany.mockResolvedValue([
      beleg({ id: "a", invoiceNumber: "RG/1" }),
      beleg({ id: "b", invoiceNumber: "RG:1" }),
    ]);
    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });

    const geladen = await JSZip.loadAsync(e.zip);
    const dateien = Object.keys(geladen.files).filter((f) => f.endsWith(".pdf"));
    expect(dateien.length, "Beide Belege brauchen eine eigene Datei").toBe(2);
    expect(e.mitPdf).toBe(2);
  });

  it("entschaerft Formeln im Empfaengernamen", async () => {
    // Excel fuehrt ein Feld aus, das mit = + - @ beginnt. Die Datei geht an
    // einen Steuerberater und wird dort doppelgeklickt.
    findMany.mockResolvedValue([beleg({ recipientName: "=1+1" })]);
    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });
    const csv = await verzeichnis(e.zip);
    expect(csv, "Formel nicht entschaerft").toContain("'=1+1");
  });

  it("ein einzelnes Wagenruecklauf-Zeichen zerreisst die Zeile nicht", async () => {
    findMany.mockResolvedValue([beleg({ recipientName: "Muster\rGmbH" })]);
    const e = await erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS });
    const csv = await verzeichnis(e.zip);
    expect(
      csv.trimEnd().split("\r\n").length,
      "Kopfzeile plus genau eine Datenzeile",
    ).toBe(2);
  });

  it("ein zu grosser Zeitraum wird abgelehnt statt den Speicher zu sprengen", async () => {
    findMany.mockResolvedValue(
      Array.from({ length: MAX_BELEGE + 1 }, (_, i) =>
        beleg({ id: `i${i}`, invoiceNumber: `RG-${i}` }),
      ),
    );
    await expect(
      erzeugeBelegExport({ tenantId: "t1", von: VON, bis: BIS }),
    ).rejects.toBeInstanceOf(ZuVieleBelegeError);
  });

  it("ohne Mandanten wird gar nicht erst gesucht", async () => {
    await expect(
      erzeugeBelegExport({ tenantId: "", von: VON, bis: BIS }),
    ).rejects.toThrow(/ohne Mandanten/i);
    expect(findMany, "Es darf keine Abfrage ohne Mandantenfilter geben").not.toHaveBeenCalled();
  });
});
