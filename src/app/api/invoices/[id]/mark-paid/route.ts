import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { isSkontoValid } from "@/lib/invoices/skonto";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";

const markPaidSchema = z.object({
  paidAt: z.string().optional(), // ISO date string, defaults to now
  applySkonto: z.boolean().optional(), // Whether to apply Skonto discount
});

// POST /api/invoices/[id]/mark-paid - Rechnung als bezahlt markieren
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    let paidAt = new Date();
    let applySkonto = false;
    try {
      const body = await request.json();
      const validated = markPaidSchema.parse(body);
      if (validated.paidAt) {
        paidAt = new Date(validated.paidAt);
      }
      if (validated.applySkonto) {
        applySkonto = true;
      }
    } catch {
      // Body ist optional, verwende Standardwert
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        skontoPercent: true,
        skontoDays: true,
        skontoDeadline: true,
        skontoAmount: true,
        grossAmount: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Rechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (invoice.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (invoice.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Stornierte Rechnungen koennen nicht als bezahlt markiert werden" },
        { status: 400 }
      );
    }

    if (invoice.status === "PAID") {
      return NextResponse.json(
        { error: "Rechnung ist bereits als bezahlt markiert" },
        { status: 400 }
      );
    }

    if (invoice.status === "DRAFT") {
      return NextResponse.json(
        { error: "Entwuerfe koennen nicht als bezahlt markiert werden. Bitte erst versenden." },
        { status: 400 }
      );
    }

    // Handle Skonto application
    let skontoPaid = false;
    if (applySkonto) {
      // Verify Skonto is configured
      if (!invoice.skontoPercent || !invoice.skontoDeadline) {
        return NextResponse.json(
          { error: "Kein Skonto fuer diese Rechnung konfiguriert" },
          { status: 400 }
        );
      }

      // Verify Skonto deadline has not expired (check against paidAt date)
      if (!isSkontoValid(invoice.skontoDeadline, paidAt)) {
        return NextResponse.json(
          { error: "Skonto-Frist ist abgelaufen. Zahlung nach dem Stichtag." },
          { status: 400 }
        );
      }

      skontoPaid = true;
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt,
        ...(skontoPaid && { skontoPaid: true }),
      },
      include: {
        items: { orderBy: { position: "asc" } },
      },
    });

    // Invalidate dashboard caches after marking invoice as paid
    invalidate.onInvoiceChange(check.tenantId!, id, 'update').catch((err) => {
      logger.warn({ err }, '[Invoices] Cache invalidation error after mark-paid');
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "Error marking invoice as paid");
    return NextResponse.json(
      { error: "Fehler beim Markieren als bezahlt" },
      { status: 500 }
    );
  }
}
