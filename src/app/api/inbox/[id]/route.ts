import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const updateSchema = z.object({
  invoiceType: z.enum(["INVOICE", "CREDIT_NOTE"]).optional(),
  vendorId: z.uuid().optional().nullable(),
  vendorNameFallback: z.string().max(200).optional().nullable(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceDate: z.iso.datetime().optional().nullable(),
  dueDate: z.iso.datetime().optional().nullable(),
  netAmount: z.number().optional().nullable(),
  vatAmount: z.number().optional().nullable(),
  grossAmount: z.number().optional().nullable(),
  vatRate: z.number().optional().nullable(),
  currency: z.string().max(3).optional(),
  iban: z.string().max(34).optional().nullable(),
  bic: z.string().max(11).optional().nullable(),
  paymentReference: z.string().max(140).optional().nullable(),
  recipientFundId: z.uuid().optional().nullable(),
  datevAccount: z.string().max(20).optional().nullable(),
  notes: z.string().optional().nullable(),
});

async function checkInbox(tenantId: string) {
  if (!await getConfigBoolean("inbox.enabled", tenantId, false)) {
    return apiError("FEATURE_DISABLED", 404, { message: "Inbox nicht aktiviert" });
  }
  return null;
}

// GET /api/inbox/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("inbox:read");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;
    const { id } = await params;

    const invoice = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true, iban: true, bic: true, email: true } },
        recipientFund: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        lines: { orderBy: { position: "asc" } },
        splits: {
          orderBy: { position: "asc" },
          include: {
            fund: { select: { id: true, name: true } },
            outgoingInvoice: { select: { id: true, invoiceNumber: true, status: true } },
          },
        },
      },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
    }

    return NextResponse.json(serializePrisma(invoice));
  } catch (error) {
    logger.error({ err: error }, "Error fetching inbox invoice");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden" });
  }
}

// PUT /api/inbox/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("inbox:update");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;
    const { id } = await params;

    const existing = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }

    const d = parsed.data;
    const updated = await prisma.incomingInvoice.update({
      where: { id },
      data: {
        ...(d.invoiceType !== undefined && { invoiceType: d.invoiceType }),
        ...(d.vendorId !== undefined && { vendorId: d.vendorId }),
        ...(d.vendorNameFallback !== undefined && { vendorNameFallback: d.vendorNameFallback }),
        ...(d.invoiceNumber !== undefined && { invoiceNumber: d.invoiceNumber }),
        ...(d.invoiceDate !== undefined && { invoiceDate: d.invoiceDate ? new Date(d.invoiceDate) : null }),
        ...(d.dueDate !== undefined && { dueDate: d.dueDate ? new Date(d.dueDate) : null }),
        ...(d.netAmount !== undefined && { netAmount: d.netAmount }),
        ...(d.vatAmount !== undefined && { vatAmount: d.vatAmount }),
        ...(d.grossAmount !== undefined && { grossAmount: d.grossAmount }),
        ...(d.vatRate !== undefined && { vatRate: d.vatRate }),
        ...(d.currency !== undefined && { currency: d.currency }),
        ...(d.iban !== undefined && { iban: d.iban }),
        ...(d.bic !== undefined && { bic: d.bic }),
        ...(d.paymentReference !== undefined && { paymentReference: d.paymentReference }),
        ...(d.recipientFundId !== undefined && { recipientFundId: d.recipientFundId }),
        ...(d.datevAccount !== undefined && { datevAccount: d.datevAccount }),
        ...(d.notes !== undefined && { notes: d.notes }),
      },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating inbox invoice");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren" });
  }
}

// DELETE /api/inbox/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("inbox:delete");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;
    const { id } = await params;

    const existing = await prisma.incomingInvoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Rechnung nicht gefunden" });
    }

    if (!["INBOX", "REVIEW"].includes(existing.status)) {
      return apiError("CONFLICT", 409, { message: "Nur Rechnungen im Status INBOX oder REVIEW können gelöscht werden" });
    }

    await prisma.incomingInvoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting inbox invoice");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen" });
  }
}
