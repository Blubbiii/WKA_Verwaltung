import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceTemplate } from "../templates/InvoiceTemplate";
import { applyLetterheadBackground, loadLetterheadById, resolveTemplate } from "../utils/templateResolver";
import type { LetterheadCompanyInfo } from "@/types/pdf";
import { musterRechnung } from "./muster-rechnung";

/**
 * Sample invoice rendered with exactly this letterhead (watermark "Muster").
 * Returns null when the letterhead does not belong to the tenant.
 */
export async function generateLetterheadPreviewPdf(tenantId: string, letterheadId: string): Promise<Buffer | null> {
  const letterhead = await loadLetterheadById(tenantId, letterheadId);
  if (!letterhead) return null;
  const template = await resolveTemplate(tenantId, "INVOICE");

  const pdf = await renderToBuffer(
    <InvoiceTemplate
      invoice={musterRechnung()}
      template={template}
      letterhead={letterhead}
      watermark={{ type: "SAMPLE" }}
      companyInfo={(letterhead.companyInfo as unknown as LetterheadCompanyInfo | null) ?? undefined}
    />
  );
  return applyLetterheadBackground(pdf, letterhead);
}
