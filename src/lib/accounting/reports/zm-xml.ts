/**
 * ZM XML Generator (BZSt Format)
 *
 * Generates the XML file for submission to the Bundeszentralamt für Steuern.
 */

import type { ZmResult } from "./zm";

interface ZmXmlOptions {
  /** Own USt-IdNr of the reporting company */
  ownVatId: string;
  /** Company name */
  companyName: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateZmXml(data: ZmResult, options: ZmXmlOptions): string {
  const { ownVatId, companyName } = options;

  // Strip country prefix from own VAT ID for the Melder block
  const ownVatIdClean = ownVatId.replace(/^DE/i, "").trim();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<ZM xmlns="http://www.bzst.de/zmxml">\n`;
  xml += `  <Melder>\n`;
  xml += `    <UStIdNr>${escapeXml(ownVatIdClean)}</UStIdNr>\n`;
  xml += `    <Name>${escapeXml(companyName)}</Name>\n`;
  xml += `  </Melder>\n`;
  xml += `  <Zeitraum>\n`;
  xml += `    <Jahr>${data.year}</Jahr>\n`;
  xml += `    <Quartal>${data.quarter}</Quartal>\n`;
  xml += `  </Zeitraum>\n`;
  xml += `  <Meldungen>\n`;

  for (const line of data.lines) {
    // Strip country prefix from recipient VAT ID
    const recipientVatClean = line.vatId.replace(new RegExp(`^${line.countryCode}`, "i"), "").trim();

    xml += `    <ZmAngabe>\n`;
    xml += `      <LandKz>${escapeXml(line.countryCode)}</LandKz>\n`;
    xml += `      <UStIdNr>${escapeXml(recipientVatClean)}</UStIdNr>\n`;
    xml += `      <Betrag>${line.amount}</Betrag>\n`;
    xml += `      <Art>${line.type === "L" ? "L" : "S"}</Art>\n`;
    xml += `    </ZmAngabe>\n`;
  }

  xml += `  </Meldungen>\n`;
  xml += `</ZM>\n`;

  return xml;
}
