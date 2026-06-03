/**
 * UStVA (Umsatzsteuervoranmeldung) — Phase 12.
 *
 * Aggregiert tax-relevante JournalEntryLines für das ELSTER-Formular USt 1 A.
 *
 * Klassifikations-Priorität (höchste zuerst):
 *  1. line.ustvaKennzahl (manueller Override pro Buchungszeile)
 *  2. line.taxCode.template.defaultVatReportBox + Override am TaxCode
 *  3. Direkter Konto-Match auf TenantSettings-USt-Konten (für USt-Lines im
 *     P11 3-Lines-Modus) → Steuer-Aggregation pro Kennzahl
 *  4. Range-Fallback auf account.startsWith("8") + LedgerAccount.taxBehavior
 *     (für Alt-Daten ohne TaxCode-Verknüpfung)
 *
 * Unterstützte Kennzahlen (Stand 2026):
 *   41  Innergemeinschaftliche Lieferungen §6a
 *   43  Steuerfreie Umsätze MIT Vorsteuerabzug (Ausfuhren, IGL ohne USt-ID)
 *   46  §13b Reverse-Charge — Bemessungsgrundlage (Leistungsempfänger)
 *   47  §13b Steuer (auf KZ 46, in der UStVA als Schuld)
 *   60  Vorsteuer aus §13b
 *   81  Umsätze 19% — Bemessungsgrundlage
 *   84  Innergemeinschaftliche Erwerbe 19% — Bemessungsgrundlage
 *   85  Innergemeinschaftliche Erwerbe 7% — Bemessungsgrundlage
 *   86  Umsätze 7% — Bemessungsgrundlage
 *   89  Steuerfreie Umsätze OHNE Vorsteuerabzug §4 Nr 8-28
 *   93  Vorsteuer aus innergemeinschaftlichem Erwerb
 *   66  Vorsteuer aus Rechnungen 19% (Standard)
 *   61  Vorsteuer aus Rechnungen 7%
 *
 * Kleinunternehmer (§19 UStG): result enthält `kleinunternehmer: true` und
 * eine kurze Hinweis-Zeile statt der vollen Aggregation. UI sollte daraus
 * ableiten, dass keine UStVA abzugeben ist.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";
import { TaxCategory } from "@prisma/client";
import { getTenantSettings } from "@/lib/tenant-settings";
import { isKleinunternehmer } from "@/lib/accounting/kleinunternehmer";
import { getCachedReport } from "@/lib/cache/reports";

export interface UstvaLine {
  /** ELSTER-Kennzahl (z.B. "81", "46"). */
  kennzahl: string;
  label: string;
  /** Bemessungsgrundlage (Netto-Umsatz). 0 bei reinen Steuer-Kennzahlen wie 66. */
  amount: number;
  /** Steuerbetrag dieser Kennzahl. Bei 81/86: korrespondierende USt-Schuld.
   *  Bei 66/61: Vorsteuer. Bei 41/43/89: 0. */
  taxAmount: number;
}

export interface UstvaResult {
  lines: UstvaLine[];
  periodStart: string;
  periodEnd: string;
  totalTaxPayable: number;
  totalInputTax: number;
  /** positiv = Zahllast, negativ = Erstattung. */
  balance: number;
  /** True wenn Tenant Kleinunternehmer (§19 UStG) ist. Lines sind dann leer. */
  kleinunternehmer: boolean;
  /** Optional: vom Generator erkannte Warnungen (z.B. nicht klassifizierte Lines). */
  warnings: string[];
}

function toNum(d: Decimal | number | null | undefined): number {
  if (d === null || d === undefined) return 0;
  return typeof d === "number" ? d : Number(d);
}

/**
 * Mapping TaxCategory → UStVA-Kennzahl. Wird genutzt wenn das Template
 * defaultVatReportBox=null hat (Fallback für inkonsistente Stammdaten).
 */
function kennzahlForCategory(category: TaxCategory): string | null {
  switch (category) {
    case TaxCategory.STANDARD_19:
      return "81";
    case TaxCategory.REDUCED_7:
      return "86";
    case TaxCategory.EXEMPT:
      return "89";
    case TaxCategory.REVERSE_CHARGE_13B:
      return "46";
    case TaxCategory.IGE_INTRA_EU:
      return "84";
    case TaxCategory.IGL_INTRA_EU:
      return "41";
    case TaxCategory.EXPORT:
      return "43";
    case TaxCategory.KLEINUNTERNEHMER_19:
    case TaxCategory.NOT_TAXABLE:
      return null;
  }
}

/** Labels für die Kennzahl-Anzeige. */
const KENNZAHL_LABELS: Record<string, string> = {
  "41": "Innergemeinschaftliche Lieferungen §6a UStG",
  "43": "Steuerfreie Umsätze mit Vorsteuerabzug",
  "46": "§13b Leistungen — Bemessungsgrundlage",
  "47": "§13b Leistungen — Steuer 19%",
  "60": "Vorsteuer aus §13b Leistungen",
  "61": "Vorsteuer aus Rechnungen 7%",
  "66": "Vorsteuer aus Rechnungen 19%",
  "81": "Steuerpflichtige Umsätze 19%",
  "84": "Innergemeinschaftliche Erwerbe 19%",
  "85": "Innergemeinschaftliche Erwerbe 7%",
  "86": "Steuerpflichtige Umsätze 7%",
  "89": "Steuerfreie Umsätze §4 Nr 8-28",
  "93": "Vorsteuer aus innergemeinschaftlichem Erwerb",
};

/** Welche Kennzahlen einen taxAmount tragen (Steuer-Konten). */
const TAX_KENNZAHLEN = new Set(["47", "60", "61", "66", "93"]);

/** Buckets für Aggregation. */
interface Bucket {
  net: number;
  tax: number;
}

function getBucket(map: Map<string, Bucket>, kz: string): Bucket {
  let b = map.get(kz);
  if (!b) {
    b = { net: 0, tax: 0 };
    map.set(kz, b);
  }
  return b;
}

export async function generateUstva(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<UstvaResult> {
  // H-4: Redis-Cache. POSTED-Journale unveränderlich → safe to cache.
  const cacheKey = `${periodStart.toISOString()}:${periodEnd.toISOString()}`;
  return getCachedReport("ustva", tenantId, cacheKey, () =>
    generateUstvaUncached(tenantId, periodStart, periodEnd),
  );
}

async function generateUstvaUncached(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<UstvaResult> {
  const kleinunternehmer = await isKleinunternehmer(tenantId);

  // Kleinunternehmer (§19 UStG): keine UStVA-Abgabe, Hinweis statt Aggregation.
  if (kleinunternehmer) {
    return {
      lines: [],
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalTaxPayable: 0,
      totalInputTax: 0,
      balance: 0,
      kleinunternehmer: true,
      warnings: [
        "Mandant ist Kleinunternehmer gemäß §19 UStG — keine UStVA-Pflicht.",
      ],
    };
  }

  const [journalLines, ledgerAccounts, settings] = await Promise.all([
    prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          tenantId,
          status: "POSTED",
          deletedAt: null,
          entryDate: { gte: periodStart, lte: periodEnd },
        },
      },
      select: {
        account: true,
        debitAmount: true,
        creditAmount: true,
        ustvaKennzahl: true,
        taxCode: {
          select: {
            vatReportBoxOverride: true,
            template: {
              select: {
                category: true,
                defaultVatReportBox: true,
              },
            },
          },
        },
      },
    }),
    prisma.ledgerAccount.findMany({
      where: { tenantId, isActive: true },
      select: { accountNumber: true, taxBehavior: true },
    }),
    getTenantSettings(tenantId),
  ]);

  const taxBehaviorMap = new Map(
    ledgerAccounts.map((a) => [a.accountNumber, a.taxBehavior]),
  );

  // USt-Konten aus Tenant-Settings (für Pfad 3: USt-Line-Klassifikation).
  const outputTax19 = settings.datevAccountOutputTax19;
  const outputTax7 = settings.datevAccountOutputTax7;
  const inputTax19 = settings.datevAccountInputTax19;
  const inputTax7 = settings.datevAccountInputTax7;

  const buckets = new Map<string, Bucket>();
  const warnings: string[] = [];
  let unclassifiedCount = 0;

  for (const line of journalLines) {
    const credit = toNum(line.creditAmount);
    const debit = toNum(line.debitAmount);
    const acc = line.account;

    // ---------- Pfad 3a: USt-Konto (Schuld) ----------
    // Credit-Bewegung = Erhöhung der USt-Schuld → addiert zur KZ-Steuer.
    if (acc === outputTax19) {
      getBucket(buckets, "81").tax += credit - debit;
      continue;
    }
    if (acc === outputTax7) {
      getBucket(buckets, "86").tax += credit - debit;
      continue;
    }

    // ---------- Pfad 3b: Vorsteuer-Konto ----------
    if (acc === inputTax19) {
      getBucket(buckets, "66").tax += debit - credit;
      continue;
    }
    if (acc === inputTax7) {
      getBucket(buckets, "61").tax += debit - credit;
      continue;
    }

    // ---------- Pfad 1: line.ustvaKennzahl Override ----------
    if (line.ustvaKennzahl) {
      // Bei expliziter Kennzahl behandeln wir die Line ehrlich:
      // Erlös-Lines (Saldo via credit-debit) gehen auf net,
      // Steuer-Kennzahlen werden über das TAX_KENNZAHLEN-Set erkannt.
      const isTaxKz = TAX_KENNZAHLEN.has(line.ustvaKennzahl);
      const value = isTaxKz ? debit - credit : credit - debit;
      const b = getBucket(buckets, line.ustvaKennzahl);
      if (isTaxKz) b.tax += value;
      else b.net += value;
      continue;
    }

    // ---------- Pfad 2: TaxCode → Template-Kennzahl ----------
    if (line.taxCode) {
      const kz =
        line.taxCode.vatReportBoxOverride ??
        line.taxCode.template.defaultVatReportBox ??
        kennzahlForCategory(line.taxCode.template.category);
      if (kz) {
        // Bei Erlös-Konten saldieren wir credit-debit (Erlös ist Haben).
        // Bei Aufwand-Konten (IGE-Bemessung) ist es debit-credit.
        // Heuristik: SKR03/04 — Kontonummer 8xxx = Erlös, 4xxx/3xxx = Aufwand.
        const isRevenueAcct = acc.startsWith("8");
        const value = isRevenueAcct ? credit - debit : debit - credit;
        getBucket(buckets, kz).net += value;
        continue;
      }
    }

    // ---------- Pfad 4: Range-Fallback (Alt-Daten) ----------
    if (acc.startsWith("8")) {
      const net = credit - debit;
      const taxBehavior = taxBehaviorMap.get(acc);
      if (taxBehavior === "EXEMPT") {
        getBucket(buckets, "89").net += net;
      } else if (taxBehavior === "TAXABLE_7") {
        getBucket(buckets, "86").net += net;
      } else if (taxBehavior === "TAXABLE_19") {
        getBucket(buckets, "81").net += net;
      } else {
        // Erlöskonto ohne Klassifikation — als 19% behandeln (alte Default-Logik)
        getBucket(buckets, "81").net += net;
        if (net !== 0) unclassifiedCount++;
      }
      continue;
    }

    // Sonstige Konten (Bank, Forderungen, Verbindlichkeiten) → kein Beitrag.
  }

  if (unclassifiedCount > 0) {
    warnings.push(
      `${unclassifiedCount} Buchung(en) ohne TaxCode-Klassifikation als 19% behandelt (Alt-Daten-Fallback). Empfehlung: Migration auf TaxCode-FK in P11.`,
    );
  }

  // Lines in fester Reihenfolge bauen (auch wenn 0 — User sieht Vollständigkeit)
  const orderedKennzahlen = [
    "81", "86", "41", "43", "46", "47", "84", "85", "89", "66", "61", "60", "93",
  ];

  const lines: UstvaLine[] = orderedKennzahlen.map((kz) => {
    const b = buckets.get(kz) ?? { net: 0, tax: 0 };
    return {
      kennzahl: kz,
      label: KENNZAHL_LABELS[kz] ?? kz,
      amount: Math.round(b.net * 100) / 100,
      taxAmount: Math.round(b.tax * 100) / 100,
    };
  });

  // Output-Tax (Schuld) und Input-Tax (Anspruch) summieren.
  // Schuld = KZ 47 (§13b) + KZ 81/86 Steuer + KZ 84/85 IGE-Steuer
  // Anspruch = KZ 66 + KZ 61 + KZ 93 (IGE-Vorsteuer) + KZ 60 (§13b-Vorsteuer)
  const totalTaxPayable =
    (buckets.get("81")?.tax ?? 0) +
    (buckets.get("86")?.tax ?? 0) +
    (buckets.get("47")?.tax ?? 0) +
    (buckets.get("84")?.tax ?? 0) +
    (buckets.get("85")?.tax ?? 0);

  const totalInputTax =
    (buckets.get("66")?.tax ?? 0) +
    (buckets.get("61")?.tax ?? 0) +
    (buckets.get("60")?.tax ?? 0) +
    (buckets.get("93")?.tax ?? 0);

  const balance = totalTaxPayable - totalInputTax;

  return {
    lines,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalTaxPayable: Math.round(totalTaxPayable * 100) / 100,
    totalInputTax: Math.round(totalInputTax * 100) / 100,
    balance: Math.round(balance * 100) / 100,
    kleinunternehmer: false,
    warnings,
  };
}
