import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/withPermission";
import { calculateSkontoDiscount, calculateSkontoDeadline } from "@/lib/invoices/skonto";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";

const invoiceUpdateSchema = z.object({
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  recipientType: z.string().optional(),
  recipientName: z.string().optional(),
  recipientAddress: z.string().optional(),
  serviceStartDate: z.string().optional().nullable(),
  serviceEndDate: z.string().optional().nullable(),
  paymentReference: z.string().optional(),
  notes: z.string().optional().nullable(),
  fundId: z.string().uuid().optional().nullable(),
  shareholderId: z.string().uuid().optional().nullable(),
  leaseId: z.string().uuid().optional().nullable(),
  parkId: z.string().uuid().optional().nullable(),
  // Skonto (early payment discount) - both optional
  skontoPercent: z.number().min(0.01).max(99.99).optional().nullable(),
  skontoDays: z.number().int().min(1).max(365).optional().nullable(),
  // E-Invoice: Leitweg-ID for public sector recipients (XRechnung)
  leitwegId: z.string().max(46).optional().nullable(),
});

// GET /api/invoices/[id] - Einzelne Rechnung mit Details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
        fund: {
          select: { id: true, name: true },
        },
        shareholder: {
          select: {
            id: true,
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
                street: true,
                postalCode: true,
                city: true,
                bankIban: true,
                bankBic: true,
                bankName: true,
              },
            },
          },
        },
        park: {
          select: {
            id: true,
            name: true,
            billingEntityFund: {
              select: {
                id: true,
                name: true,
                legalForm: true,
                address: true,
              },
            },
          },
        },
        lease: {
          select: {
            id: true,
            lessor: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
                street: true,
                postalCode: true,
                city: true,
                bankIban: true,
                bankBic: true,
                bankName: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        cancelledInvoice: {
          select: { id: true, invoiceNumber: true },
        },
        cancellationInvoices: {
          select: { id: true, invoiceNumber: true, invoiceDate: true },
        },
        correctedInvoice: {
          select: { id: true, invoiceNumber: true },
        },
        correctionInvoices: {
          where: { deletedAt: null },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            correctionType: true,
            netAmount: true,
            grossAmount: true,
            notes: true,
          },
          orderBy: { createdAt: "asc" },
        },
        settlementPeriod: {
          select: { id: true, year: true, status: true },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            street: true,
            houseNumber: true,
            postalCode: true,
            city: true,
            contactEmail: true,
            contactPhone: true,
            bankName: true,
            iban: true,
            bic: true,
            taxId: true,
            vatId: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Rechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant-Check
    if (invoice.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    return NextResponse.json(invoice);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice");
    return NextResponse.json(
      { error: "Fehler beim Laden der Rechnung" },
      { status: 500 }
    );
  }
}

// PATCH /api/invoices/[id] - Rechnung aktualisieren (nur DRAFT)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = invoiceUpdateSchema.parse(body);

    // Prüfe ob Rechnung existiert und DRAFT ist
    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true, invoiceDate: true, grossAmount: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Rechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Nur Entwürfe können bearbeitet werden" },
        { status: 400 }
      );
    }

    // Build Skonto update data if provided
    let skontoUpdateData: Record<string, unknown> = {};
    if (validatedData.skontoPercent !== undefined || validatedData.skontoDays !== undefined) {
      const skontoPercent = validatedData.skontoPercent ?? null;
      const skontoDays = validatedData.skontoDays ?? null;

      if (skontoPercent && skontoDays) {
        // Recalculate Skonto fields - use updated invoiceDate if provided, else existing
        const effectiveInvoiceDate = validatedData.invoiceDate
          ? new Date(validatedData.invoiceDate)
          : existing.invoiceDate;
        const grossAmount = Number(existing.grossAmount);
        const skontoDiscount = calculateSkontoDiscount(grossAmount, skontoPercent);
        const skontoDeadline = calculateSkontoDeadline(effectiveInvoiceDate, skontoDays);

        skontoUpdateData = {
          skontoPercent,
          skontoDays,
          skontoDeadline,
          skontoAmount: skontoDiscount,
        };
      } else {
        // Clear Skonto fields when one value is null/removed
        skontoUpdateData = {
          skontoPercent: null,
          skontoDays: null,
          skontoDeadline: null,
          skontoAmount: null,
          skontoPaid: false,
        };
      }
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(validatedData.invoiceDate && {
          invoiceDate: new Date(validatedData.invoiceDate),
        }),
        ...(validatedData.dueDate !== undefined && {
          dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
        }),
        ...(validatedData.recipientType !== undefined && {
          recipientType: validatedData.recipientType,
        }),
        ...(validatedData.recipientName !== undefined && {
          recipientName: validatedData.recipientName,
        }),
        ...(validatedData.recipientAddress !== undefined && {
          recipientAddress: validatedData.recipientAddress,
        }),
        ...(validatedData.serviceStartDate !== undefined && {
          serviceStartDate: validatedData.serviceStartDate
            ? new Date(validatedData.serviceStartDate)
            : null,
        }),
        ...(validatedData.serviceEndDate !== undefined && {
          serviceEndDate: validatedData.serviceEndDate
            ? new Date(validatedData.serviceEndDate)
            : null,
        }),
        ...(validatedData.paymentReference !== undefined && {
          paymentReference: validatedData.paymentReference,
        }),
        ...(validatedData.notes !== undefined && {
          notes: validatedData.notes,
        }),
        ...(validatedData.fundId !== undefined && {
          fundId: validatedData.fundId,
        }),
        ...(validatedData.shareholderId !== undefined && {
          shareholderId: validatedData.shareholderId,
        }),
        ...(validatedData.leaseId !== undefined && {
          leaseId: validatedData.leaseId,
        }),
        ...(validatedData.parkId !== undefined && {
          parkId: validatedData.parkId,
        }),
        // E-Invoice: Leitweg-ID update (also clear cached XML when Leitweg-ID changes)
        ...(validatedData.leitwegId !== undefined && {
          leitwegId: validatedData.leitwegId,
          einvoiceXml: null, // Invalidate cached XML when Leitweg-ID changes
          einvoiceFormat: null,
          einvoiceGeneratedAt: null,
        }),
        ...skontoUpdateData,
      },
      include: {
        items: { orderBy: { position: "asc" } },
      },
    });

    // Invalidate dashboard caches after invoice update
    invalidate.onInvoiceChange(check.tenantId!, id, 'update').catch((err) => {
      logger.warn({ err }, '[Invoices] Cache invalidation error after update');
    });

    return NextResponse.json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating invoice");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Rechnung" },
      { status: 500 }
    );
  }
}

// DELETE /api/invoices/[id] - Rechnung soft-löschen (AO §147, HGB §257: 10 Jahre Aufbewahrungspflicht)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:delete");
    if (!check.authorized) return check.error;

    // Zusätzliche Prüfung: Nur ADMIN oder SUPERADMIN dürfen löschen
    const session = await prisma.user.findUnique({
      where: { id: check.userId! },
      select: { role: true },
    });

    if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json(
        { error: "Nur Administratoren dürfen Rechnungen löschen" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, tenantId: true, invoiceNumber: true, deletedAt: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Rechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (existing.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (existing.deletedAt) {
      return NextResponse.json(
        { error: "Rechnung wurde bereits gelöscht" },
        { status: 400 }
      );
    }

    // Soft-delete + audit log in einer Transaktion (Datenkonsistenz)
    await prisma.$transaction(async (tx) => {
      // 1. Rechnung als gelöscht markieren (gesetzliche Aufbewahrungspflicht)
      await tx.invoice.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // 2. Log deletion for audit trail
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entityType: "Invoice",
          entityId: id,
          oldValues: existing as unknown as Prisma.InputJsonValue,
          newValues: Prisma.JsonNull,
          tenantId: check.tenantId!,
          userId: check.userId!,
        },
      });
    });

    // Invalidate dashboard caches after invoice deletion
    invalidate.onInvoiceChange(check.tenantId!, id, 'delete').catch((err) => {
      logger.warn({ err }, '[Invoices] Cache invalidation error after delete');
    });

    return NextResponse.json({
      success: true,
      message: "Rechnung wurde als gelöscht markiert (Aufbewahrungspflicht gem. AO §147, HGB §257)",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting invoice");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Rechnung" },
      { status: 500 }
    );
  }
}
