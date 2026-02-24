import { renderToBuffer } from "@react-pdf/renderer";
import { AccessReportTemplate, type AccessReportPdfData } from "../templates/AccessReportTemplate";

/**
 * Generiert ein PDF für den Zugriffsreport
 */
export async function generateAccessReportPdf(
  data: AccessReportPdfData
): Promise<Buffer> {
  // PDF generieren
  const pdfBuffer = await renderToBuffer(
    <AccessReportTemplate data={data} />
  );

  return pdfBuffer;
}

/**
 * Generiert ein PDF für den Zugriffsreport als Base64
 */
export async function generateAccessReportPdfBase64(
  data: AccessReportPdfData
): Promise<string> {
  const buffer = await generateAccessReportPdf(data);
  return buffer.toString("base64");
}
