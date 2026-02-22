import { renderToBuffer } from "@react-pdf/renderer";
import {
  PermissionMatrixTemplate,
  type PermissionMatrixPdfData,
} from "../templates/PermissionMatrixTemplate";

/**
 * Generiert ein PDF fuer die Berechtigungs-Matrix
 */
export async function generatePermissionMatrixPdf(
  data: PermissionMatrixPdfData
): Promise<Buffer> {
  // PDF generieren
  const pdfBuffer = await renderToBuffer(
    <PermissionMatrixTemplate data={data} />
  );

  return pdfBuffer;
}

/**
 * Generiert ein PDF fuer die Berechtigungs-Matrix als Base64
 */
export async function generatePermissionMatrixPdfBase64(
  data: PermissionMatrixPdfData
): Promise<string> {
  const buffer = await generatePermissionMatrixPdf(data);
  return buffer.toString("base64");
}
