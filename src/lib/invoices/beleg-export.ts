/**
 * BELEGEXPORT FÜR DEN STEUERBERATER
 * ==================================
 *
 * Ausgangsrechnungen und Gutschriften eines Zeitraums als ZIP: die PDFs als
 * Belege, dazu ein Verzeichnis im CSV-Format.
 *
 * ## Warum es das gibt
 *
 * Die Bücher führt der Steuerberater in DATEV. Der Weg dorthin war bisher
 * Handarbeit: jede Rechnung einzeln herunterladen und in DATEV Unternehmen
 * online hochladen. Bei zwanzig Pachtabrechnungen im Monat ist das eine halbe
 * Stunde stumpfe Arbeit — und eine Fehlerquelle, weil niemand merkt, wenn eine
 * fehlt.
 *
 * ## Warum PDF **und** Verzeichnis
 *
 * Das PDF ist der Beleg — es muss mit, weil der Steuerberater ihn aufbewahrt
 * und der Prüfer ihn sehen will. Das Verzeichnis ist die Arbeitshilfe und
 * beantwortet die Frage, die bei einer Prüfung zuerst kommt: **ist die
 * Lieferung vollständig?** Es führt die Rechnungsnummern lückenlos auf.
 *
 * ## Was hier bewusst NICHT passiert
 *
 * Es werden keine Buchungssätze erzeugt. Welches Konto bebucht wird, weiß der
 * Steuerberater besser als wir — eine falsch geratene Kontierung ist teurer
 * als gar keine.
 */

import JSZip from "jszip";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateInvoicePdf } from "@/lib/pdf/generators/invoicePdf";
import { apiLogger } from "@/lib/logger";
import { calendarDay } from "@/lib/validation/not-in-future";

const logger = apiLogger.child({ component: "beleg-export" });

/** Semikolon — so erwarten es deutsches Excel und DATEV. */
const TRENNER = ";";

/**
 * Obergrenzen für eine Lieferung.
 *
 * Das ZIP entsteht vollständig im Arbeitsspeicher: erst liegen alle PDFs
 * darin, dann zusätzlich der gepackte Puffer, den anschliessend auch noch die
 * Antwort hält. PDFs lassen sich kaum weiter komprimieren, der Puffer ist also
 * etwa so gross wie die Summe der Belege.
 *
 * Ohne Grenze reisst ein grosser Zeitraum den Serverprozess mit — und zwar
 * nicht mit einer Fehlermeldung, sondern mit einem Speicherabbruch. Lieber
 * eine klare Absage mit dem Hinweis, den Zeitraum zu teilen.
 */
export const MAX_BELEGE = 250;
export const MAX_GESAMTGROESSE = 150 * 1024 * 1024;

export interface BelegExportParams {
  tenantId: string;
  /** Erster Kalendertag, einschliesslich, als `YYYY-MM-DD` in deutscher Zeit. */
  von: string;
  /** Letzter Kalendertag, einschliesslich. */
  bis: string;
}

export interface BelegExportErgebnis {
  zip: Buffer;
  dateiname: string;
  /** Belege im Zeitraum insgesamt — so viele Zeilen hat das Verzeichnis. */
  gesamt: number;
  /** Belege, die tatsächlich als PDF im ZIP liegen. */
  mitPdf: number;
  /** Rechnungsnummern ohne PDF. */
  fehlgeschlagen: string[];
}

/** Kein Beleg im Zeitraum. Der Aufrufer soll das sagen, nicht ein leeres ZIP liefern. */
export class KeineBelegeError extends Error {
  constructor(von: string, bis: string) {
    super(
      `Im Zeitraum ${von} bis ${bis} gibt es keine versendeten Rechnungen ` +
        `oder Gutschriften.`,
    );
    this.name = "KeineBelegeError";
  }
}

/** Der Zeitraum ist zu gross für eine Lieferung. */
export class ZuVieleBelegeError extends Error {
  constructor(
    public readonly anzahl: number,
    public readonly grenze: number,
  ) {
    super(
      `Der Zeitraum enthält ${anzahl} Belege, möglich sind ${grenze}. ` +
        `Bitte monats- oder wochenweise exportieren.`,
    );
    this.name = "ZuVieleBelegeError";
  }
}

function alsBetrag(wert: Prisma.Decimal | number | null): string {
  if (wert === null) return "";
  return Number(wert).toFixed(2).replace(".", ",");
}

/**
 * Ein Feld für das CSV aufbereiten.
 *
 * Zwei Dinge passieren hier, und beide sind nötig:
 *
 * **1. Maskieren.** „Müller; Meier GbR" ist ein zulässiger Firmenname. Ohne
 * Anführungszeichen verschiebt das Semikolon die ganze Zeile, und im
 * Verzeichnis stehen Beträge in der falschen Spalte — etwas, das niemand
 * nachrechnet. Zeilenumbrüche werden vorher zu Leerzeichen; ein einzelnes
 * `\r` genügt, um eine zusätzliche Zeile zu erzeugen.
 *
 * **2. Formeln entschärfen.** Beginnt ein Feld mit `=`, `+`, `-` oder `@`,
 * führt Excel es beim Öffnen als Formel aus. Ein Empfängername ist
 * Nutzereingabe; diese Datei geht an einen Steuerberater und wird dort
 * doppelgeklickt. Ein vorangestelltes Apostroph verhindert das.
 */
function feld(wert: string | null | undefined): string {
  let s = (wert ?? "").replace(/[\r\n\t]+/g, " ").trim();
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /["\;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const SPALTEN = [
  "Rechnungsnummer",
  "Art",
  "Rechnungsdatum",
  "Leistung von",
  "Leistung bis",
  "Empfänger",
  "Netto",
  "Umsatzsteuer",
  "Brutto",
  "Währung",
  "Status",
  "Belegdatei",
] as const;

/** Kalendertag in deutscher Zeit, oder leer. */
function tag(d: Date | null): string {
  return d ? calendarDay(d) : "";
}

/**
 * Ein eindeutiger, dateisystemtauglicher Name je Beleg.
 *
 * `RG/1` und `RG:1` würden beide zu `RG_1` — und `JSZip.file()` überschreibt
 * bei gleichem Pfad stillschweigend den vorherigen Eintrag. Im Verzeichnis
 * stünden dann zwei Rechnungen, im ZIP läge nur eine, und beide Zeilen
 * verwiesen auf dieselbe Datei. Ein Export, der lautlos die falsche Rechnung
 * mitschickt, ist schlimmer als einer, der scheitert.
 */
function eindeutigerName(nummer: string, vergeben: Set<string>): string {
  const basis = nummer.replace(/[^a-zA-Z0-9_-]/g, "_") || "Beleg";
  let name = basis;
  let n = 2;
  while (vergeben.has(name.toLowerCase())) {
    name = `${basis}__${n}`;
    n++;
  }
  vergeben.add(name.toLowerCase());
  return name;
}

/**
 * Baut das ZIP.
 *
 * Enthalten sind **versendete** Belege: Entwürfe sind noch keine Rechnungen im
 * Sinne des § 14 UStG. Stornierte bleiben drin — eine Stornorechnung ist selbst
 * ein Beleg, und ihr Fehlen erzeugte eine Lücke in der Nummernfolge.
 */
export async function erzeugeBelegExport(
  params: BelegExportParams,
): Promise<BelegExportErgebnis> {
  const { tenantId, von, bis } = params;

  if (!tenantId) {
    // Ohne Mandanten kein Export. Ein fehlender Filter waere hier kein
    // Schoenheitsfehler, sondern die Herausgabe fremder Belege.
    throw new Error("Belegexport ohne Mandanten aufgerufen");
  }

  /*
    Deutsche Kalendertage, nicht UTC-Tage.

    `invoiceDate` ist NICHT durchgehend auf Mitternacht normalisiert: die
    Sammelanlage von Abrechnungen setzt als Rückfall `new Date()` und legt
    damit einen Zeitstempel ab (`settlement-periods/[id]/create-invoices`,
    Zeile 441). Eine Rechnung, die am 1. April um 00:30 deutscher Zeit
    entsteht, steht dann als 31. März 22:30 UTC in der Datenbank.

    Ein reiner UTC-Vergleich schoebe sie in den Maerz-Export und liesse sie im
    April fehlen. Beides faellt niemandem auf, bis der Steuerberater eine
    Lücke findet.

    Deshalb zweistufig: grob mit einem Tag Luft auf beiden Seiten abfragen,
    dann exakt über `calendarDay()` filtern. Das ist dieselbe Funktion, die
    auch die Zukunftsprüfung beim Anlegen benutzt — eine Zeitzonenlogik, nicht
    zwei.
  */
  const grobVon = new Date(`${von}T00:00:00.000Z`);
  grobVon.setUTCDate(grobVon.getUTCDate() - 1);
  const grobBis = new Date(`${bis}T23:59:59.999Z`);
  grobBis.setUTCDate(grobBis.getUTCDate() + 1);

  const roh = await prisma.invoice.findMany({
    where: {
      tenantId,
      deletedAt: null,
      invoiceDate: { gte: grobVon, lte: grobBis },
      // DRAFT bleibt draussen: noch keine Rechnung, nur ein Entwurf.
      status: { not: "DRAFT" },
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceType: true,
      invoiceDate: true,
      serviceStartDate: true,
      serviceEndDate: true,
      recipientName: true,
      netAmount: true,
      taxAmount: true,
      grossAmount: true,
      currency: true,
      status: true,
    },
    orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
  });

  // `YYYY-MM-DD` sortiert als Zeichenkette wie als Datum — ein Vergleich genügt.
  const belege = roh.filter((b) => {
    const t = calendarDay(b.invoiceDate);
    return t >= von && t <= bis;
  });

  if (belege.length === 0) throw new KeineBelegeError(von, bis);
  if (belege.length > MAX_BELEGE) {
    throw new ZuVieleBelegeError(belege.length, MAX_BELEGE);
  }

  const zip = new JSZip();
  const ordner = zip.folder("Belege");
  const zeilen: string[] = [SPALTEN.join(TRENNER)];
  const fehlgeschlagen: string[] = [];
  const vergeben = new Set<string>();
  let gesamtgroesse = 0;
  let mitPdf = 0;

  for (const b of belege) {
    const name = eindeutigerName(b.invoiceNumber, vergeben);
    const dateiname = `${name}.pdf`;
    let abgelegt = false;

    try {
      const pdf = await generateInvoicePdf(b.id);
      gesamtgroesse += pdf.length;
      if (gesamtgroesse > MAX_GESAMTGROESSE) {
        throw new ZuVieleBelegeError(belege.length, MAX_BELEGE);
      }
      ordner?.file(dateiname, pdf);
      abgelegt = true;
      mitPdf++;
    } catch (err) {
      if (err instanceof ZuVieleBelegeError) throw err;
      /*
        Ein Beleg ohne PDF darf die Lieferung nicht kippen — sonst scheitert
        ein Export von fünfzig Rechnungen an einer einzigen. Er steht aber im
        Verzeichnis mit leerem Dateiverweis und wird oben gemeldet: eine
        stille Lücke waere das Schlimmste, was einer Belieferung des
        Steuerberaters passieren kann.
      */
      fehlgeschlagen.push(b.invoiceNumber);
      logger.error({ err, invoiceId: b.id }, "Beleg-PDF liess sich nicht erzeugen");
    }

    zeilen.push(
      [
        feld(b.invoiceNumber),
        feld(b.invoiceType === "CREDIT_NOTE" ? "Gutschrift" : "Rechnung"),
        tag(b.invoiceDate),
        tag(b.serviceStartDate),
        tag(b.serviceEndDate),
        feld(b.recipientName),
        alsBetrag(b.netAmount),
        alsBetrag(b.taxAmount),
        alsBetrag(b.grossAmount),
        feld(b.currency ?? "EUR"),
        feld(b.status),
        feld(abgelegt ? `Belege/${dateiname}` : ""),
      ].join(TRENNER),
    );
  }

  /*
    BOM voran. Ohne sie liest Excel die Datei als Windows-1252 und macht aus
    „Müller" ein „MÃ¼ller". Das Verzeichnis geht an einen Steuerberater — es
    soll beim Doppelklick stimmen, nicht nach einem Importdialog verlangen.
  */
  const BOM = "﻿";
  zip.file("Rechnungsausgang.csv", BOM + zeilen.join("\r\n") + "\r\n");

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    zip: zipBuffer,
    dateiname: `Belege_${von}_bis_${bis}.zip`,
    gesamt: belege.length,
    mitPdf,
    fehlgeschlagen,
  };
}
