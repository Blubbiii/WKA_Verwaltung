import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { getInvoiceCorrectionHistory } from "@/lib/invoices/invoice-correction";

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
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
      if (error.message.includes("Keine Berechtigung")) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    logger.error({ err: error }, "Error fetching correction history");
    return NextResponse.json(
      { error: "Fehler beim Laden der Korrekturhistorie" },
      { status: 500 }
    );
  }
}
