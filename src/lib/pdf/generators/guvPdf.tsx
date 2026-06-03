/**
 * F-1 Sprint 4: GuV-PDF-Generator mit Vorjahresvergleich.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import { GuvTemplate, type GuvPdfData } from "../templates/GuvTemplate";

export async function generateGuvPdf(data: GuvPdfData): Promise<Buffer> {
  return renderToBuffer(<GuvTemplate data={data} />);
}

export type { GuvPdfData };
