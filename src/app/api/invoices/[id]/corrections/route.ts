import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { getInvoiceCorrectionHistory } from "@/lib/invoices/invoice-correction";
import { apiError } from "@/lib/api-errors";

// GET /api/invoices/[id]/corrections - List all corrections for an invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const history = await getInvoiceCorrectionHistory(id, check.tenantId!);

    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("nicht gefunden")) {
        return apiError("NOT_FOUND", undefined, { message: error.message });
      }
      if (error.message.includes("Keine Berechtigung")) {
        return apiError("FORBIDDEN", undefined, { message: error.message });
      }
    }

    logger.error({ err: error }, "Error fetching correction history");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Korrekturhistorie" });
  }
}
