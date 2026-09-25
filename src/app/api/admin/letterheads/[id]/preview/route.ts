import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { generateLetterheadPreviewPdf } from "@/lib/pdf/generators/letterheadPreviewPdf";

// GET /api/admin/letterheads/[id]/preview — sample invoice with this letterhead.
// The preview button called this route since the first commit; it never existed.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;
    const { id } = await params;

    const pdf = await generateLetterheadPreviewPdf(check.tenantId!, id);
    if (!pdf) return apiError("NOT_FOUND", 404, { message: "Briefpapier nicht gefunden" });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="briefpapier-vorschau.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating letterhead preview");
    return apiError("PROCESS_FAILED", 500, { message: "Vorschau konnte nicht erstellt werden" });
  }
}
