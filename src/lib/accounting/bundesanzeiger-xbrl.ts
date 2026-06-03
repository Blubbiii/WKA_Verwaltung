/**
 * C-3 Sprint 5: Bundesanzeiger-XBRL-Export (HGB-Taxonomie für Offenlegung).
 *
 * §325 HGB verpflichtet GmbHs, ihren Jahresabschluss binnen 12 Monaten
 * nach Bilanzstichtag offen zu legen. Das Bundesamt für Justiz nimmt
 * den XBRL-Datenstrom über die Plattform publikations-plattform.de
 * entgegen.
 *
 * Unterschied zu ELSTER §5b EStG (siehe ebilanz.ts):
 *  - ELSTER: Steuer-Taxonomie de-gcd (Bilanz + GuV + steuerl. Ergänzungen)
 *  - Bundesanzeiger: HGB-Offenlegungs-Taxonomie de-bge (zusätzlich Anhang,
 *    Lagebericht, Berichtsperiode, Größenklasse)
 *
 * Beide Taxonomien teilen ~80% der GCD-Kern-Elemente — wir liefern hier
 * eine HGB-fokussierte Variante, die für Klein-/Kleinst-GmbHs (§267 HGB)
 * ausreicht.
 *
 * **Hinweis:** Die tatsächliche Validierung gegen die Bundesanzeiger-
 * Taxonomie erfolgt beim Upload. Dieser Generator erzeugt ein Skelett,
 * das beim Bundesanzeiger-Test-Upload geprüft werden sollte vor Live-
 * Einreichung.
 */

import { computeBilanz } from "./reports/bilanz";
import { generateGuv } from "./reports/guv";
import { prisma } from "@/lib/prisma";

export type CompanySize = "kleinst" | "klein" | "mittel" | "gross";

export interface BundesanzeigerInput {
  tenantId: string;
  fiscalYear: number;
  /** Bilanz-Stichtag (üblicherweise 31.12.). */
  asOf: Date;
  /** Größenklasse nach §267 HGB. */
  companySize: CompanySize;
  /** Vollständiger Firmenname inkl. Rechtsform. */
  companyName: string;
  /** Handelsregister-Nummer (z.B. "HRB 12345 Amtsgericht München"). */
  handelsregisterNummer?: string;
  /** Sitz der Gesellschaft. */
  registeredOffice?: string;
}

export interface BundesanzeigerResult {
  xml: string;
  filename: string;
  positionCount: number;
  warnings: string[];
  /** True wenn Datenstrom grundsätzlich abgabefähig. */
  readyForSubmission: boolean;
}

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
 * Mapping BalanceSheetSection → de-bge-Element (Bundesanzeiger-Taxonomie).
 * Subset für Klein- und Kleinst-GmbHs.
 */
const BGE_ELEMENTS: Record<string, string> = {
  ASSET_FIXED: "de-bge:bs.ass.fixedAssets",
  ASSET_CURRENT: "de-bge:bs.ass.currentAssets",
  ASSET_DEFERRED: "de-bge:bs.ass.prepaidExpenses",
  EQUITY: "de-bge:bs.eqLiab.equity",
  PROVISION: "de-bge:bs.eqLiab.provisions",
  LIABILITY_LONG: "de-bge:bs.eqLiab.liabilities.longterm",
  LIABILITY_SHORT: "de-bge:bs.eqLiab.liabilities.shortterm",
  LIABILITY_DEFERRED: "de-bge:bs.eqLiab.deferredIncome",
};

const SIZE_CODES: Record<CompanySize, string> = {
  kleinst: "kleinstkapitalgesellschaft",
  klein: "kleinekapitalgesellschaft",
  mittel: "mittelgrosse_kapitalgesellschaft",
  gross: "grosse_kapitalgesellschaft",
};

export async function generateBundesanzeigerXbrl(
  input: BundesanzeigerInput,
): Promise<BundesanzeigerResult> {
  const warnings: string[] = [];
  let readyForSubmission = true;

  const [bilanz, guv, tenant] = await Promise.all([
    computeBilanz(input.tenantId, input.fiscalYear, input.asOf),
    generateGuv(
      input.tenantId,
      new Date(Date.UTC(input.fiscalYear, 0, 1)),
      input.asOf,
    ),
    prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { name: true, city: true, postalCode: true, street: true },
    }),
  ]);

  warnings.push(...bilanz.warnings);

  if (Math.abs(bilanz.differenz) > 0.01) {
    warnings.push(
      `Bilanz nicht ausgeglichen (Differenz ${bilanz.differenz.toFixed(2)} €) — Übermittlung wird abgelehnt`,
    );
    readyForSubmission = false;
  }

  if (bilanz.aktiva.length === 0 || bilanz.passiva.length === 0) {
    warnings.push("Bilanz hat keine Aktiva oder Passiva — Pflichtfeld");
    readyForSubmission = false;
  }

  if (!input.handelsregisterNummer) {
    warnings.push(
      "Handelsregister-Nummer fehlt — Bundesanzeiger lehnt Einreichung ab",
    );
    readyForSubmission = false;
  }

  const periodStart = isoDate(new Date(Date.UTC(input.fiscalYear, 0, 1)));
  const periodEnd = isoDate(input.asOf);

  // Größenklassen-Eintrag (§267 HGB)
  const sizeCode = SIZE_CODES[input.companySize];

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<xbrl xmlns="http://www.xbrl.org/2003/instance"' +
      ' xmlns:xbrli="http://www.xbrl.org/2003/instance"' +
      ' xmlns:xlink="http://www.w3.org/1999/xlink"' +
      ' xmlns:link="http://www.xbrl.org/2003/linkbase"' +
      ' xmlns:iso4217="http://www.xbrl.org/2003/iso4217"' +
      ' xmlns:de-bge="http://www.xbrl.de/taxonomies/de-bge-2024"' +
      ' xmlns:de-gcd="http://www.xbrl.de/taxonomies/de-gcd-2024">',
  );

  lines.push(
    '  <link:schemaRef xlink:type="simple" xlink:href="de-bge-2024-core.xsd"/>',
  );

  // Kontext: Instant (Bilanz-Stichtag)
  lines.push('  <xbrli:context id="ctx-instant">');
  lines.push("    <xbrli:entity>");
  lines.push(
    `      <xbrli:identifier scheme="http://www.bundesanzeiger.de/hrb">${escapeXml(input.handelsregisterNummer ?? "UNBEKANNT")}</xbrli:identifier>`,
  );
  lines.push("    </xbrli:entity>");
  lines.push("    <xbrli:period>");
  lines.push(`      <xbrli:instant>${periodEnd}</xbrli:instant>`);
  lines.push("    </xbrli:period>");
  lines.push("  </xbrli:context>");

  // Kontext: Periode (für GuV)
  lines.push('  <xbrli:context id="ctx-period">');
  lines.push("    <xbrli:entity>");
  lines.push(
    `      <xbrli:identifier scheme="http://www.bundesanzeiger.de/hrb">${escapeXml(input.handelsregisterNummer ?? "UNBEKANNT")}</xbrli:identifier>`,
  );
  lines.push("    </xbrli:entity>");
  lines.push("    <xbrli:period>");
  lines.push(`      <xbrli:startDate>${periodStart}</xbrli:startDate>`);
  lines.push(`      <xbrli:endDate>${periodEnd}</xbrli:endDate>`);
  lines.push("    </xbrli:period>");
  lines.push("  </xbrli:context>");

  // Unit
  lines.push('  <xbrli:unit id="EUR">');
  lines.push("    <xbrli:measure>iso4217:EUR</xbrli:measure>");
  lines.push("  </xbrli:unit>");

  // Stammdaten
  lines.push(
    `  <de-bge:companyName contextRef="ctx-instant">${escapeXml(input.companyName)}</de-bge:companyName>`,
  );
  lines.push(
    `  <de-bge:companySize contextRef="ctx-instant">${sizeCode}</de-bge:companySize>`,
  );
  if (input.handelsregisterNummer) {
    lines.push(
      `  <de-bge:handelsregisterNummer contextRef="ctx-instant">${escapeXml(input.handelsregisterNummer)}</de-bge:handelsregisterNummer>`,
    );
  }
  if (input.registeredOffice || tenant?.city) {
    const office = input.registeredOffice || tenant?.city || "";
    lines.push(
      `  <de-bge:registeredOffice contextRef="ctx-instant">${escapeXml(office)}</de-bge:registeredOffice>`,
    );
  }
  lines.push(
    `  <de-bge:fiscalYear contextRef="ctx-instant">${input.fiscalYear}</de-bge:fiscalYear>`,
  );

  // Bilanz-Positionen (Aggregat-Ebene)
  let positionCount = 0;
  for (const group of bilanz.aktiva) {
    const element = BGE_ELEMENTS[group.section];
    if (element && group.total !== 0) {
      lines.push(
        `  <${element} contextRef="ctx-instant" unitRef="EUR" decimals="2">${fmtAmount(group.total)}</${element}>`,
      );
      positionCount++;
    }
  }
  for (const group of bilanz.passiva) {
    const element = BGE_ELEMENTS[group.section];
    if (element && group.total !== 0) {
      lines.push(
        `  <${element} contextRef="ctx-instant" unitRef="EUR" decimals="2">${fmtAmount(group.total)}</${element}>`,
      );
      positionCount++;
    }
  }

  // Bilanzsummen (Kontroll-Positionen)
  lines.push(
    `  <de-bge:bs.ass.totalAssets contextRef="ctx-instant" unitRef="EUR" decimals="2">${fmtAmount(bilanz.summeAktiva)}</de-bge:bs.ass.totalAssets>`,
  );
  lines.push(
    `  <de-bge:bs.eqLiab.totalEquityLiabilities contextRef="ctx-instant" unitRef="EUR" decimals="2">${fmtAmount(bilanz.summePassiva)}</de-bge:bs.eqLiab.totalEquityLiabilities>`,
  );

  // Jahresergebnis aus GuV
  const jahresergebnis = guv.netIncome;
  const element =
    jahresergebnis >= 0
      ? "de-bge:is.netIncome"
      : "de-bge:is.netLoss";
  lines.push(
    `  <${element} contextRef="ctx-period" unitRef="EUR" decimals="2">${fmtAmount(Math.abs(jahresergebnis))}</${element}>`,
  );
  positionCount++;

  lines.push("</xbrl>");

  const xml = lines.join("\n");
  const safeName = (input.handelsregisterNummer ?? "unbekannt")
    .replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `bundesanzeiger_${input.fiscalYear}_${safeName}.xbrl`;

  if (!tenant) {
    warnings.push("Tenant nicht gefunden — Stammdaten unvollständig");
  }

  return {
    xml,
    filename,
    positionCount,
    warnings,
    readyForSubmission,
  };
}
