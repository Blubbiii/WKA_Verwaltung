/**
 * E-Bilanz §5b EStG — XBRL-Export (Phase 26).
 *
 * §5b EStG schreibt vor, dass bilanzierende Unternehmen ihren Jahres-
 * abschluss elektronisch nach amtlich vorgeschriebenem Datensatz (XBRL)
 * an das Finanzamt übermitteln. Das Format basiert auf der GCD-Taxonomie
 * der HGB-Bilanz-Strukturen (Generalauszug bzw. Kerntaxonomie).
 *
 * Diese Lib generiert das XBRL-Instanzdokument aus den vorhandenen
 * Bilanz-Daten. Vollständige Taxonomie-Validierung erfolgt erst beim
 * ELSTER-Upload — wir erzeugen die Kern-Elemente.
 *
 * **Wichtig:** Dies ist eine Basis-Implementation. Für produktiven
 * Einsatz mit allen ELSTER-Pflichtfeldern wäre eine vollständige
 * GCD-Taxonomie-Anbindung nötig (geschätzt 5-8 PT zusätzlich).
 */

import { computeBilanz, type BilanzResult } from "./reports/bilanz";
import { getTenantSettings } from "@/lib/tenant-settings";
import {
  GCD_SECTION_ELEMENTS,
  GCD_BS_TOTALS,
  mapAccountToGcdElement,
} from "./gcd-taxonomy";
import type { ChartOfAccountsVersion } from "./chart-of-accounts";

export interface EbilanzInput {
  tenantId: string;
  /** Wirtschaftsjahr (z.B. 2025). */
  fiscalYear: number;
  /** Bilanz-Stichtag (üblicherweise 31.12.). */
  asOf: Date;
  /** Unternehmensbezeichnung. */
  companyName: string;
  /** Steuernummer des Unternehmens. */
  taxNumber: string;
  /** Optional: USt-IdNr. */
  vatId?: string;
  /** Rechtsform-Code (KS=Kapitalgesellschaft, PE=Personengesellschaft,
   *  EU=Einzelunternehmen). */
  legalForm: "KS" | "PE" | "EU";
}

export interface EbilanzResult {
  /** XBRL-XML-Inhalt. */
  xml: string;
  /** Filename-Vorschlag für Download. */
  filename: string;
  /** Anzahl Bilanzpositionen, die exportiert wurden. */
  positionCount: number;
  /** Warnings vom Bilanz-Generator. */
  warnings: string[];
  /** True wenn alle Pflicht-Validierungen erfüllt sind. */
  ebilanzReady: boolean;
}

// Aggregat-Mapping (BalanceSheetSection → GCD-Element). Wird als Fallback
// genutzt, wenn keine granulare Position aus dem Konten-Range gemappt
// werden kann. Detail-Map: src/lib/accounting/gcd-taxonomy.ts
const XBRL_ELEMENTS = GCD_SECTION_ELEMENTS;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtAmount(n: number): string {
  return n.toFixed(2);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Generiert das E-Bilanz-XBRL-Instanzdokument.
 *
 * Validation:
 *  - Bilanz muss ausgeglichen sein (|differenz| ≤ 0.01)
 *  - Mindestens Eigenkapital + Aktiva müssen Positionen haben
 *  - Steuernummer formatiert (XX/XXX/XXXXX)
 */
export async function generateEbilanz(input: EbilanzInput): Promise<EbilanzResult> {
  const bilanz: BilanzResult = await computeBilanz(
    input.tenantId,
    input.fiscalYear,
    input.asOf,
  );

  const warnings = [...bilanz.warnings];
  let ebilanzReady = true;

  if (Math.abs(bilanz.differenz) > 0.01) {
    warnings.push(
      `E-Bilanz-Übermittlung blockiert: Bilanz nicht ausgeglichen (Differenz ${bilanz.differenz.toFixed(2)} €)`,
    );
    ebilanzReady = false;
  }

  if (bilanz.aktiva.length === 0 || bilanz.passiva.length === 0) {
    warnings.push("E-Bilanz benötigt Aktiva UND Passiva Positionen");
    ebilanzReady = false;
  }

  // Kontext-IDs
  const periodEnd = isoDate(input.asOf);
  const periodStart = isoDate(
    new Date(Date.UTC(input.fiscalYear, 0, 1)),
  );

  // P26.7: Granulares GCD-Mapping pro Account.
  // Aggregiert dann auf XBRL-Element-Ebene, sodass mehrere Konten auf das
  // selbe GCD-Element addiert werden (z.B. mehrere Forderungs-Konten
  // → eine "de-gcd:bs.ass.currentAssets.receivables.tradeReceivables").
  const settings = await getTenantSettings(input.tenantId);
  const chartVersion =
    (settings.chartOfAccountsVersion as ChartOfAccountsVersion) ?? "SKR03";

  const aggregated = new Map<string, number>();

  for (const group of bilanz.aktiva) {
    for (const acc of group.accounts) {
      const element = mapAccountToGcdElement(
        acc.accountNumber,
        group.section,
        chartVersion,
      );
      if (element) {
        aggregated.set(element, (aggregated.get(element) ?? 0) + acc.amount);
      }
    }
    // Wenn die Group keine Konten hat (z.B. nur Aggregat), liefern wir
    // dennoch das Aggregat-Element für die XBRL-Validierung.
    if (group.accounts.length === 0 && group.total !== 0) {
      const fallback = XBRL_ELEMENTS[group.section];
      if (fallback) {
        aggregated.set(fallback, (aggregated.get(fallback) ?? 0) + group.total);
      }
    }
  }
  for (const group of bilanz.passiva) {
    for (const acc of group.accounts) {
      const element = mapAccountToGcdElement(
        acc.accountNumber,
        group.section,
        chartVersion,
      );
      if (element) {
        aggregated.set(element, (aggregated.get(element) ?? 0) + acc.amount);
      }
    }
    if (group.accounts.length === 0 && group.total !== 0) {
      const fallback = XBRL_ELEMENTS[group.section];
      if (fallback) {
        aggregated.set(fallback, (aggregated.get(fallback) ?? 0) + group.total);
      }
    }
  }

  const positions: Array<{ element: string; amount: number }> = Array.from(
    aggregated.entries(),
  )
    .filter(([, amount]) => Math.abs(amount) >= 0.005) // sub-cent rauswerfen
    .map(([element, amount]) => ({ element, amount }));

  // Jahresergebnis als separate Position
  if (bilanz.jahresergebnis !== 0) {
    positions.push({
      element:
        bilanz.jahresergebnis > 0
          ? "de-gcd:is.netIncome"
          : "de-gcd:is.netLoss",
      amount: Math.abs(bilanz.jahresergebnis),
    });
  }

  // XBRL-Instanzdokument bauen
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:de-gcd="http://www.xbrl.de/taxonomies/de-gcd-2024">`,
  );

  // Schema-Referenz
  lines.push(
    '  <link:schemaRef xlink:type="simple" xlink:href="de-gcd-2024-core.xsd"/>',
  );

  // Kontext: Instant (Bilanz-Stichtag)
  lines.push('  <xbrli:context id="ctx-instant">');
  lines.push("    <xbrli:entity>");
  lines.push(`      <xbrli:identifier scheme="http://www.elster.de">${escapeXml(input.taxNumber)}</xbrli:identifier>`);
  lines.push("    </xbrli:entity>");
  lines.push("    <xbrli:period>");
  lines.push(`      <xbrli:instant>${periodEnd}</xbrli:instant>`);
  lines.push("    </xbrli:period>");
  lines.push("  </xbrli:context>");

  // Kontext: Duration (Wirtschaftsjahr — für GuV/Jahresergebnis)
  lines.push('  <xbrli:context id="ctx-period">');
  lines.push("    <xbrli:entity>");
  lines.push(`      <xbrli:identifier scheme="http://www.elster.de">${escapeXml(input.taxNumber)}</xbrli:identifier>`);
  lines.push("    </xbrli:entity>");
  lines.push("    <xbrli:period>");
  lines.push(`      <xbrli:startDate>${periodStart}</xbrli:startDate>`);
  lines.push(`      <xbrli:endDate>${periodEnd}</xbrli:endDate>`);
  lines.push("    </xbrli:period>");
  lines.push("  </xbrli:context>");

  // Unit (EUR)
  lines.push('  <xbrli:unit id="EUR">');
  lines.push("    <xbrli:measure>iso4217:EUR</xbrli:measure>");
  lines.push("  </xbrli:unit>");

  // Stammdaten
  lines.push(`  <de-gcd:companyName contextRef="ctx-instant">${escapeXml(input.companyName)}</de-gcd:companyName>`);
  lines.push(`  <de-gcd:legalForm contextRef="ctx-instant">${input.legalForm}</de-gcd:legalForm>`);
  if (input.vatId) {
    lines.push(`  <de-gcd:vatId contextRef="ctx-instant">${escapeXml(input.vatId)}</de-gcd:vatId>`);
  }

  // Bilanz-Positionen
  for (const pos of positions) {
    const isPnl = pos.element.startsWith("de-gcd:is.");
    const ctx = isPnl ? "ctx-period" : "ctx-instant";
    lines.push(
      `  <${pos.element} contextRef="${ctx}" unitRef="EUR" decimals="2">${fmtAmount(pos.amount)}</${pos.element}>`,
    );
  }

  // Bilanzsumme als Kontroll-Position
  lines.push(
    `  <${GCD_BS_TOTALS.totalAssets} contextRef="ctx-instant" unitRef="EUR" decimals="2">${fmtAmount(bilanz.summeAktiva)}</${GCD_BS_TOTALS.totalAssets}>`,
  );
  lines.push(
    `  <${GCD_BS_TOTALS.totalEquityLiabilities} contextRef="ctx-instant" unitRef="EUR" decimals="2">${fmtAmount(bilanz.summePassiva)}</${GCD_BS_TOTALS.totalEquityLiabilities}>`,
  );

  lines.push("</xbrl>");

  const xml = lines.join("\n");
  const filename = `ebilanz_${input.fiscalYear}_${input.taxNumber.replace(/\//g, "_")}.xbrl`;

  return {
    xml,
    filename,
    positionCount: positions.length,
    warnings,
    ebilanzReady,
  };
}
