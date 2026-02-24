import { renderToBuffer } from "@react-pdf/renderer";
import {
  AuditLogTemplate,
  type AuditLogPdfData,
} from "../templates/AuditLogTemplate";

/**
 * Generiert ein PDF für den Audit-Log Export
 *
 * @param data - Die Audit-Log Daten inklusive Logs, Filter und Statistiken
 * @returns Promise<Buffer> - PDF als Buffer
 */
export async function generateAuditLogPdf(
  data: AuditLogPdfData
): Promise<Buffer> {
  // PDF generieren
  const pdfBuffer = await renderToBuffer(
    <AuditLogTemplate data={data} />
  );

  return pdfBuffer;
}

/**
 * Generiert ein PDF für den Audit-Log Export als Base64
 *
 * @param data - Die Audit-Log Daten inklusive Logs, Filter und Statistiken
 * @returns Promise<string> - PDF als Base64 String
 */
export async function generateAuditLogPdfBase64(
  data: AuditLogPdfData
): Promise<string> {
  const buffer = await generateAuditLogPdf(data);
  return buffer.toString("base64");
}

// Re-export type for convenience
export type { AuditLogPdfData };
