/**
 * DATEV EXTF-CSV-Export (Phase 24).
 *
 * Format: DATEV-Standard für Buchungsstapel (EXTF). Wird von 95% der
 * deutschen Steuerberater zum Import in DATEV "Rechnungswesen" verwendet.
 *
 * Struktur:
 *   Zeile 1: Header mit 33 Feldern (Mandant, Wirtschaftsjahr, etc.)
 *   Zeile 2: Spaltenbeschriftungen (~116 Spalten in der Standard-Spec)
 *   Zeile 3+: Buchungsdatensätze
 *
 * Wir implementieren den minimal-vollständigen Subset, der für Standard-
 * Buchungen (Soll/Haben, Betrag, Belegdatum, Buchungstext, Sachkonto,
 * Gegenkonto, BU-Schlüssel) ausreicht. Erweiterungen (Kost1/Kost2,
 * Fremdwährung, Notizen) sind als spätere Phase markiert.
 *
 * Encoding: ANSI-CP1252 (DATEV-Standard) — wir liefern UTF-8-BOM-fähig.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

export interface DatevExportInput {
  tenantId: string;
  /** DATEV-Mandanten-Nummer (5-stellig). */
  datevConsultantNumber: number;
  /** DATEV-Berater-Nummer (4-7-stellig). */
  datevClientNumber: number;
  /** Wirtschaftsjahres-Beginn (üblicherweise 01.01.). */
  fiscalYearStart: Date;
  /** Konten-Länge (4-9; üblich 4 für SKR03/04). */
  accountLength?: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface DatevExportResult {
  csv: string;
  recordCount: number;
  filename: string;
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

/** DATEV-Datumsformat: YYYYMMDD (Wirtschaftsjahr) bzw. DDMM (Belegdatum). */
function fmtYyyymmdd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fmtDdmm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** DATEV-Decimal: Komma als Trenner. */
function fmtAmount(n: number): string {
  return Math.abs(n).toFixed(2).replace(".", ",");
}

/** Quoting: alle Werte in Anführungszeichen, " im Wert verdoppelt. */
function q(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '""';
  const str = String(s).replace(/"/g, '""');
  return `"${str}"`;
}

/** Numerisches Feld ohne Quotes. */
function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(n);
}

export async function generateDatevExport(
  input: DatevExportInput,
): Promise<DatevExportResult> {
  const accountLength = input.accountLength ?? 4;
  const fiscalYearStart = fmtYyyymmdd(input.fiscalYearStart);
  const periodFrom = fmtYyyymmdd(input.periodStart);
  const periodTo = fmtYyyymmdd(input.periodEnd);

  // Buchungen laden (nur POSTED, im Zeitraum)
  const journals = await prisma.journalEntry.findMany({
    where: {
      tenantId: input.tenantId,
      status: "POSTED",
      deletedAt: null,
      entryDate: { gte: input.periodStart, lte: input.periodEnd },
    },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" },
      },
    },
    orderBy: { entryDate: "asc" },
  });

  // EXTF-Header (Zeile 1)
  //   1=DTVF/EXTF, 2=700 (Format-Version), 3=21 (Format-Kategorie Buchungsstapel),
  //   4=Buchungsstapel, 5=Format-Name, 6=Format-Version, 7=Datum erzeugt,
  //   8=Importiert (leer), 9=Herkunft, 10=Export-User, 11=Bearbeiter (leer),
  //   12=Datev-Beraternr, 13=Mandantennr, 14=WJ-Beginn, 15=Konto-Länge,
  //   16=Datum von, 17=Datum bis, 18=Bezeichnung (leer), 19=Diktatkürzel,
  //   20=Buchungstyp (1=Finanzbuchführung), 21=Rechnungslegungszweck (0=unabhängig),
  //   22=Festschreibung (0=nein), 23-33: leer
  const now = new Date();
  const headerFields = [
    q("EXTF"),
    "700",
    "21",
    q("Buchungsstapel"),
    "7",
    fmtYyyymmdd(now) + String(now.getUTCHours()).padStart(2, "0") + String(now.getUTCMinutes()).padStart(2, "0") + String(now.getUTCSeconds()).padStart(2, "0") + "000",
    "",
    "",
    q("WPM"),
    q("WPM"),
    "",
    num(input.datevConsultantNumber),
    num(input.datevClientNumber),
    fiscalYearStart,
    num(accountLength),
    periodFrom,
    periodTo,
    "",
    "",
    "1",
    "0",
    "0",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];

  // Spaltenbeschriftungen (Zeile 2) — Standard-Subset
  const columns = [
    "Umsatz",
    "Soll/Haben-Kennzeichen",
    "WKZ Umsatz",
    "Kurs",
    "Basis-Umsatz",
    "WKZ Basis-Umsatz",
    "Konto",
    "Gegenkonto (ohne BU-Schlüssel)",
    "BU-Schlüssel",
    "Belegdatum",
    "Belegfeld 1",
    "Belegfeld 2",
    "Skonto",
    "Buchungstext",
  ];

  const lines: string[] = [];
  lines.push(headerFields.join(";"));
  lines.push(columns.map((c) => q(c)).join(";"));

  let recordCount = 0;

  for (const j of journals) {
    // DATEV-Buchung: Soll-Konto vs. Haben-Konto.
    // Wir gehen davon aus, dass jede JournalEntry-Line entweder Soll ODER Haben hat.
    // DATEV bevorzugt die "Generalbuchung" — eine Zeile pro Buchung (Konto + Gegenkonto).
    //
    // Bei mehrzeiligen Buchungen (3+) splitten wir: pro Soll-Line eine DATEV-Zeile,
    // mit der ERSTEN Haben-Line als Gegenkonto.
    const sollLines = j.lines.filter((l) => toNum(l.debitAmount) > 0);
    const habenLines = j.lines.filter((l) => toNum(l.creditAmount) > 0);

    // Wenn 1 Soll + 1 Haben → 1 DATEV-Zeile
    // Wenn 1 Soll + N Haben → N DATEV-Zeilen mit Soll als wiederholtes Konto
    // Wenn N Soll + 1 Haben → N DATEV-Zeilen
    // Wenn N Soll + N Haben → 1:1 paaren (Annahme: stehen in gleicher Reihenfolge)

    const pairs: Array<{ soll: typeof j.lines[0]; haben: typeof j.lines[0]; amount: number }> = [];

    if (sollLines.length === 1 && habenLines.length >= 1) {
      const soll = sollLines[0];
      for (const haben of habenLines) {
        pairs.push({ soll, haben, amount: toNum(haben.creditAmount) });
      }
    } else if (habenLines.length === 1 && sollLines.length >= 1) {
      const haben = habenLines[0];
      for (const soll of sollLines) {
        pairs.push({ soll, haben, amount: toNum(soll.debitAmount) });
      }
    } else {
      // Mehrzeilige Buchung: 1:1 paaren über kleinere Anzahl
      const n = Math.min(sollLines.length, habenLines.length);
      for (let i = 0; i < n; i++) {
        pairs.push({
          soll: sollLines[i],
          haben: habenLines[i],
          amount: toNum(sollLines[i].debitAmount),
        });
      }
    }

    for (const p of pairs) {
      const row = [
        fmtAmount(p.amount), // Umsatz (positiv)
        q("S"), // Soll/Haben-Kennzeichen (S = Soll-Konto wird belastet)
        q("EUR"), // WKZ Umsatz
        "", // Kurs
        "", // Basis-Umsatz
        "", // WKZ Basis-Umsatz
        q(p.soll.account), // Konto (Soll)
        q(p.haben.account), // Gegenkonto (Haben)
        q(p.soll.taxKey ?? ""), // BU-Schlüssel
        fmtDdmm(j.entryDate), // Belegdatum DDMM
        q(j.reference ?? ""), // Belegfeld 1
        "", // Belegfeld 2
        "", // Skonto
        q(j.description), // Buchungstext
      ];
      lines.push(row.join(";"));
      recordCount++;
    }
  }

  const csv = lines.join("\r\n") + "\r\n";

  const filename = `EXTF_Buchungsstapel_${periodFrom}_${periodTo}.csv`;

  return { csv, recordCount, filename };
}
