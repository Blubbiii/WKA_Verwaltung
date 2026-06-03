/**
 * F-3 Sprint 4: KapESt-PDF-Generator (§44a EStG Beiblatt).
 */

import { renderToBuffer } from "@react-pdf/renderer";
import { KapEStTemplate, type KapEStPdfData } from "../templates/KapEStTemplate";

export async function generateKapEStPdf(data: KapEStPdfData): Promise<Buffer> {
  return renderToBuffer(<KapEStTemplate data={data} />);
}

export type { KapEStPdfData };
