import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// GET /api/buchhaltung/sepa/[id] — Get batch details or download XML
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");

    const batch = await prisma.sepaPaymentBatch.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        items: {
          include: {
            invoice: { select: { id: true, invoiceNumber: true, recipientName: true } },
          },
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "SEPA-Batch nicht gefunden" }, { status: 404 });
    }

    // Download XML
    if (format === "xml" && batch.xmlContent) {
      return new NextResponse(batch.xmlContent, {
        headers: {
          "Content-Type": "application/xml",
          "Content-Disposition": `attachment; filename="${batch.batchNumber}.xml"`,
        },
      });
    }

    return NextResponse.json({ data: batch });
  } catch (error) {
    logger.error({ err: error }, "Error fetching SEPA batch");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// PATCH /api/buchhaltung/sepa/[id] — Update status (approve/cancel)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!["APPROVED", "EXPORTED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
    }

    const batch = await prisma.sepaPaymentBatch.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!batch) {
      return NextResponse.json({ error: "SEPA-Batch nicht gefunden" }, { status: 404 });
    }

    const updated = await prisma.sepaPaymentBatch.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Error updating SEPA batch");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
