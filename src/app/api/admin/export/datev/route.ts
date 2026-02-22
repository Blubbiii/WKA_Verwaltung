import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import {
  generateDatevExportBuffer,
  generateDatevFilename,
  type DatevExportOptions,
  type DatevInvoiceData,
} from "@/lib/export";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datumsformat muss YYYY-MM-DD sein"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datumsformat muss YYYY-MM-DD sein"),
  type: z.enum(["invoices", "credit_notes", "all"]).default("all"),
  /** Optional: Only invoices with specific status */
  status: z.enum(["DRAFT", "SENT", "PAID", "CANCELLED"]).optional(),
  /** Optional: Filter by fund */
  fundId: z.string().uuid().optional(),
  /** DATEV configuration overrides */
  consultantNumber: z.string().max(20).optional(),
  clientNumber: z.string().max(20).optional(),
  revenueAccount: z.string().max(10).optional(),
  debtorStart: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_EXPORT_ENTRIES = 10000;

// ============================================================================
// GET /api/admin/export/datev
// ============================================================================

async function getHandler(request: NextRequest) {
  try {
    // Require invoices:export permission
    const check = await requirePermission("invoices:export");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const parseResult = querySchema.safeParse({
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      type: searchParams.get("type") || "all",
      status: searchParams.get("status") || undefined,
      fundId: searchParams.get("fundId") || undefined,
      consultantNumber: searchParams.get("consultantNumber") || undefined,
      clientNumber: searchParams.get("clientNumber") || undefined,
      revenueAccount: searchParams.get("revenueAccount") || undefined,
      debtorStart: searchParams.get("debtorStart") || undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Ungueltige Parameter",
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const params = parseResult.data;

    // Parse date range
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);

    // Validate date range
    if (fromDate > toDate) {
      return NextResponse.json(
        { error: "Startdatum muss vor Enddatum liegen" },
        { status: 400 }
      );
    }

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      tenantId: check.tenantId!,
      deletedAt: null,
      invoiceDate: {
        gte: fromDate,
        lte: new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999),
      },
    };

    // Filter by invoice type
    if (params.type === "invoices") {
      where.invoiceType = "INVOICE";
    } else if (params.type === "credit_notes") {
      where.invoiceType = "CREDIT_NOTE";
    }

    // Filter by status (default: only SENT and PAID)
    if (params.status) {
      where.status = params.status;
    } else {
      // By default, only export finalized invoices (not drafts or cancelled)
      where.status = { in: ["SENT", "PAID"] };
    }

    // Filter by fund
    if (params.fundId) {
      where.fundId = params.fundId;
    }

    // Fetch invoices with items and relations
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        fund: {
          select: { id: true, name: true },
        },
        park: {
          select: { id: true, name: true },
        },
        shareholder: {
          select: {
            id: true,
            shareholderNumber: true,
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
              },
            },
          },
        },
        items: {
          select: {
            description: true,
            netAmount: true,
            taxType: true,
            taxRate: true,
            taxAmount: true,
            grossAmount: true,
            datevKonto: true,
            datevGegenkonto: true,
            datevKostenstelle: true,
          },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { invoiceDate: "asc" },
      take: MAX_EXPORT_ENTRIES,
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        { error: "Keine Belege im angegebenen Zeitraum gefunden" },
        { status: 404 }
      );
    }

    // Get tenant name for the export
    let companyName = "WPM Export";
    if (check.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { name: true },
      });
      if (tenant?.name) {
        companyName = tenant.name;
      }
    }

    // Determine fiscal year from date range
    const fiscalYearStart = new Date(fromDate.getFullYear(), 0, 1); // Jan 1
    const fiscalYearEnd = new Date(fromDate.getFullYear(), 11, 31); // Dec 31

    // Build DATEV export options
    const datevOptions: DatevExportOptions = {
      consultantNumber: params.consultantNumber,
      clientNumber: params.clientNumber,
      fiscalYearStart,
      fiscalYearEnd,
      companyName,
      defaultRevenueAccount: params.revenueAccount,
      defaultDebtorStart: params.debtorStart,
    };

    // Convert Prisma Decimal objects to plain numbers for the export
    const invoiceData: DatevInvoiceData[] = invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      invoiceDate: inv.invoiceDate,
      recipientName: inv.recipientName,
      netAmount: Number(inv.netAmount),
      taxRate: Number(inv.taxRate),
      taxAmount: Number(inv.taxAmount ?? 0),
      grossAmount: Number(inv.grossAmount),
      currency: inv.currency,
      status: inv.status,
      fund: inv.fund,
      park: inv.park,
      shareholder: inv.shareholder
        ? {
            id: inv.shareholder.id,
            shareholderNumber: inv.shareholder.shareholderNumber,
            person: inv.shareholder.person,
          }
        : null,
      datevBuchungsschluessel: inv.datevBuchungsschluessel,
      items: inv.items.map((item) => ({
        description: item.description,
        netAmount: Number(item.netAmount),
        taxType: item.taxType as "STANDARD" | "REDUCED" | "EXEMPT",
        taxRate: Number(item.taxRate),
        taxAmount: Number(item.taxAmount),
        grossAmount: Number(item.grossAmount),
        datevKonto: item.datevKonto,
        datevGegenkonto: item.datevGegenkonto,
        datevKostenstelle: item.datevKostenstelle,
      })),
    }));

    // Generate the DATEV CSV buffer
    const buffer = generateDatevExportBuffer(invoiceData, datevOptions);
    const filename = generateDatevFilename(fromDate, toDate);

    // Optionally mark invoices as exported
    const invoiceIds = invoices.map((inv) => inv.id);
    await prisma.invoice.updateMany({
      where: { id: { in: invoiceIds } },
      data: { datevExportedAt: new Date() },
    });

    logger.info(
      {
        userId: check.userId,
        tenantId: check.tenantId,
        invoiceCount: invoices.length,
        from: params.from,
        to: params.to,
        type: params.type,
      },
      "DATEV export generated"
    );

    // Return the file
    const responseBody = new Uint8Array(buffer);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
        "X-Export-Count": invoices.length.toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungueltige Parameter", details: error.errors },
        { status: 400 }
      );
    }

    logger.error({ err: error }, "Error generating DATEV export");
    return NextResponse.json(
      { error: "Fehler beim Generieren des DATEV-Exports" },
      { status: 500 }
    );
  }
}

export const GET = withMonitoring(getHandler);
