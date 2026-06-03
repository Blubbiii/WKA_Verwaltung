/**
 * Anlagenspiegel — Pflicht-Anhang zur Bilanz nach HGB §284 Abs. 3.
 *
 * Pro Wirtschaftsgut + Wirtschaftsjahr werden folgende Spalten ausgewiesen:
 *
 *   Anschaffungs-/Herstellungskosten (AHK)
 *     - Stand Beginn des Geschäftsjahres
 *     - Zugänge
 *     - Abgänge
 *     - Umbuchungen (out-of-scope für jetzt — Mandantenfall)
 *     - Stand Ende des Geschäftsjahres
 *   Kumulierte Abschreibungen
 *     - Stand Beginn
 *     - Abschreibungen des Jahres
 *     - Abgänge (kumulierte AfA der abgegangenen Assets)
 *     - Stand Ende
 *   Buchwerte
 *     - Stand Ende des Geschäftsjahres (= AHK-End - kumAfA-End)
 *     - Stand Ende Vorjahr (= AHK-Vorjahr-End - kumAfA-Vorjahr-End)
 *
 * Gruppierung nach FixedAsset.category für die Bilanz-Anhang-Darstellung.
 */

import { prisma } from "@/lib/prisma";

export interface AnlagenspiegelRow {
  category: string;
  /** Assets-Anzahl in dieser Kategorie. */
  assetCount: number;
  // AHK
  ahkBeginn: number;
  ahkZugaenge: number;
  ahkAbgaenge: number;
  ahkUmbuchungen: number;
  ahkEnde: number;
  // Kumulierte Abschreibungen
  afaKumBeginn: number;
  afaJahr: number;
  afaAbgaenge: number;
  afaKumEnde: number;
  // Buchwerte
  buchwertEnde: number;
  buchwertVorjahresEnde: number;
}

export interface AnlagenspiegelResult {
  fiscalYear: number;
  rows: AnlagenspiegelRow[];
  totals: AnlagenspiegelRow;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Berechnet den Anlagenspiegel für einen Mandanten + Wirtschaftsjahr.
 */
export async function computeAnlagenspiegel(
  tenantId: string,
  fiscalYear: number,
): Promise<AnlagenspiegelResult> {
  const yearStart = new Date(Date.UTC(fiscalYear, 0, 1));
  const yearEnd = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59));
  const yearBeforeEnd = new Date(Date.UTC(fiscalYear - 1, 11, 31, 23, 59, 59));

  // M-6 Perf: statt ALLE Depreciations zu laden, nur:
  //  - Depreciations dieses + vorigen Jahres (für afaJahr + cumAfaEnd-Diff)
  //  - groupBy für cumAfaStart (Summe aller AfA-Zeilen mit periodEnd < yearStart)
  // Vorher: 100 Assets × 10 Jahre = 1000 Rows. Jetzt: ~100 Rows + 1 groupBy.
  const [assets, cumAfaStartAgg] = await Promise.all([
    prisma.fixedAsset.findMany({
      where: { tenantId },
      include: {
        depreciations: {
          where: {
            periodEnd: { gte: yearStart, lte: yearEnd },
          },
          orderBy: { periodEnd: "asc" },
        },
      },
    }),
    prisma.fixedAssetDepreciation.groupBy({
      by: ["assetId"],
      where: {
        asset: { tenantId },
        periodEnd: { lt: yearStart },
      },
      _sum: { amount: true },
    }),
  ]);

  // Lookup-Map: assetId → kumulierte AfA bis Jahresbeginn.
  const cumAfaStartByAsset = new Map<string, number>();
  for (const row of cumAfaStartAgg) {
    cumAfaStartByAsset.set(row.assetId, Number(row._sum.amount ?? 0));
  }

  // Pro Kategorie aggregieren
  const byCategory = new Map<string, AnlagenspiegelRow>();

  for (const asset of assets) {
    const category = asset.category || "Sonstige";
    const ahk = Number(asset.acquisitionCost);
    const acqDate = asset.acquisitionDate;
    const dispDate = asset.disposalDate;

    // Kategorie-Row holen oder anlegen
    let row = byCategory.get(category);
    if (!row) {
      row = {
        category,
        assetCount: 0,
        ahkBeginn: 0,
        ahkZugaenge: 0,
        ahkAbgaenge: 0,
        ahkUmbuchungen: 0,
        ahkEnde: 0,
        afaKumBeginn: 0,
        afaJahr: 0,
        afaAbgaenge: 0,
        afaKumEnde: 0,
        buchwertEnde: 0,
        buchwertVorjahresEnde: 0,
      };
      byCategory.set(category, row);
    }
    row.assetCount++;

    // ------- AHK-Bewegungen -------
    const acqInThisYear = acqDate >= yearStart && acqDate <= yearEnd;
    const acqBeforeThisYear = acqDate < yearStart;
    const dispInThisYear =
      dispDate !== null && dispDate >= yearStart && dispDate <= yearEnd;
    const stillHeldEndOfYear =
      dispDate === null || dispDate > yearEnd;

    if (acqBeforeThisYear) {
      // war Jahresanfang bereits da
      if (!dispInThisYear) {
        row.ahkBeginn += ahk;
      } else {
        // Bestand zu Jahresbeginn → Abgang im Jahr
        row.ahkBeginn += ahk;
        row.ahkAbgaenge += ahk;
      }
    } else if (acqInThisYear) {
      row.ahkZugaenge += ahk;
      if (dispInThisYear) {
        row.ahkAbgaenge += ahk;
      }
    }

    // Stand Ende
    if (stillHeldEndOfYear && !dispInThisYear) {
      row.ahkEnde += ahk;
    }

    // ------- AfA-Bewegungen -------
    // M-6 Perf: cumAfaStart kommt aus dem groupBy (alle Zeilen < yearStart),
    // asset.depreciations enthält nur noch das aktuelle Jahr (yearStart..yearEnd).
    const cumAfaStart = cumAfaStartByAsset.get(asset.id) ?? 0; // bis Jahresbeginn
    let afaThisYear = 0; // im Jahr gebucht

    for (const dep of asset.depreciations) {
      // Filter im DB-Query stellt sicher: periodEnd ∈ [yearStart, yearEnd]
      afaThisYear += Number(dep.amount);
    }

    const cumAfaEnd = cumAfaStart + afaThisYear; // bis Jahresende

    row.afaKumBeginn += cumAfaStart;
    row.afaJahr += afaThisYear;
    // Bei Abgang im Jahr: kumulierte AfA der abgehenden Assets
    if (dispInThisYear) {
      row.afaAbgaenge += cumAfaEnd;
    }

    // Stand Ende kumulierte AfA: nur für Assets, die noch da sind
    if (stillHeldEndOfYear && !dispInThisYear) {
      row.afaKumEnde += cumAfaEnd;
    }

    // ------- Buchwerte -------
    // Buchwert Ende = AHK Ende - kumAfA Ende (pro Asset, dann aggregiert)
    if (stillHeldEndOfYear && !dispInThisYear) {
      const bookValueEnd = Math.max(
        Number(asset.residualValue) || 0,
        ahk - cumAfaEnd,
      );
      row.buchwertEnde += bookValueEnd;
    }

    // Vorjahres-Buchwert: nur für Assets, die schon am Vorjahres-Ende existierten
    const heldAtPrevYearEnd =
      acqDate <= yearBeforeEnd && (dispDate === null || dispDate > yearBeforeEnd);
    if (heldAtPrevYearEnd) {
      const bookValuePrev = Math.max(
        Number(asset.residualValue) || 0,
        ahk - cumAfaStart,
      );
      row.buchwertVorjahresEnde += bookValuePrev;
    }
  }

  // Rundung auf 2 NK
  const rows: AnlagenspiegelRow[] = Array.from(byCategory.values()).map((r) => ({
    ...r,
    ahkBeginn: round2(r.ahkBeginn),
    ahkZugaenge: round2(r.ahkZugaenge),
    ahkAbgaenge: round2(r.ahkAbgaenge),
    ahkUmbuchungen: round2(r.ahkUmbuchungen),
    ahkEnde: round2(r.ahkEnde),
    afaKumBeginn: round2(r.afaKumBeginn),
    afaJahr: round2(r.afaJahr),
    afaAbgaenge: round2(r.afaAbgaenge),
    afaKumEnde: round2(r.afaKumEnde),
    buchwertEnde: round2(r.buchwertEnde),
    buchwertVorjahresEnde: round2(r.buchwertVorjahresEnde),
  }));

  rows.sort((a, b) => a.category.localeCompare(b.category));

  // Summenzeile
  const totals: AnlagenspiegelRow = {
    category: "Gesamt",
    assetCount: rows.reduce((s, r) => s + r.assetCount, 0),
    ahkBeginn: round2(rows.reduce((s, r) => s + r.ahkBeginn, 0)),
    ahkZugaenge: round2(rows.reduce((s, r) => s + r.ahkZugaenge, 0)),
    ahkAbgaenge: round2(rows.reduce((s, r) => s + r.ahkAbgaenge, 0)),
    ahkUmbuchungen: round2(rows.reduce((s, r) => s + r.ahkUmbuchungen, 0)),
    ahkEnde: round2(rows.reduce((s, r) => s + r.ahkEnde, 0)),
    afaKumBeginn: round2(rows.reduce((s, r) => s + r.afaKumBeginn, 0)),
    afaJahr: round2(rows.reduce((s, r) => s + r.afaJahr, 0)),
    afaAbgaenge: round2(rows.reduce((s, r) => s + r.afaAbgaenge, 0)),
    afaKumEnde: round2(rows.reduce((s, r) => s + r.afaKumEnde, 0)),
    buchwertEnde: round2(rows.reduce((s, r) => s + r.buchwertEnde, 0)),
    buchwertVorjahresEnde: round2(
      rows.reduce((s, r) => s + r.buchwertVorjahresEnde, 0),
    ),
  };

  return { fiscalYear, rows, totals };
}
