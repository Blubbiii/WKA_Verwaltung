import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { logDeletion } from "@/lib/audit";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";

const contractUpdateSchema = z.object({
  contractType: z
    .enum([
      "LEASE",
      "SERVICE",
      "INSURANCE",
      "GRID_CONNECTION",
      "MARKETING",
      "OTHER",
    ])
    .optional(),
  contractNumber: z.string().optional().nullable(),
  title: z.string().min(1).optional(),
  startDate: z
    .string()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
  endDate: z
    .string()
    .optional()
    .nullable()
    .transform((s) => (s ? new Date(s) : null)),
  noticePeriodMonths: z.number().int().positive().optional().nullable(),
  noticeDeadline: z
    .string()
    .optional()
    .nullable()
    .transform((s) => (s ? new Date(s) : null)),
  autoRenewal: z.boolean().optional(),
  renewalPeriodMonths: z.number().int().positive().optional().nullable(),
  annualValue: z.number().positive().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  status: z
    .enum(["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"])
    .optional(),
  documentUrl: z.string().url().optional().nullable(),
  reminderDays: z.array(z.number().int().positive()).optional(),
  notes: z.string().optional().nullable(),
  parkId: z.string().uuid().optional().nullable(),
  turbineId: z.string().uuid().optional().nullable(),
  fundId: z.string().uuid().optional().nullable(),
  partnerId: z.string().uuid().optional().nullable(),
});

// GET /api/contracts/[id] - Get contract details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const contract = await prisma.contract.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        park: {
          select: { id: true, name: true, shortName: true },
        },
        fund: {
          select: { id: true, name: true },
        },
        turbine: {
          select: { id: true, designation: true },
        },
        partner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
            phone: true,
            personType: true,
          },
        },
        documents: {
          where: { isArchived: false },
          select: {
            id: true,
            title: true,
            fileName: true,
            category: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Vertrag nicht gefunden" },
        { status: 404 }
      );
    }

    // Calculate days until end/notice
    let daysUntilEnd: number | null = null;
    let daysUntilNotice: number | null = null;

    if (contract.endDate) {
      const now = new Date();
      daysUntilEnd = Math.ceil(
        (contract.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    if (contract.noticeDeadline) {
      const now = new Date();
      daysUntilNotice = Math.ceil(
        (contract.noticeDeadline.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24)
      );
    }

    return NextResponse.json({
      id: contract.id,
      contractType: contract.contractType,
      contractNumber: contract.contractNumber,
      title: contract.title,
      startDate: contract.startDate.toISOString(),
      endDate: contract.endDate?.toISOString() || null,
      noticePeriodMonths: contract.noticePeriodMonths,
      noticeDeadline: contract.noticeDeadline?.toISOString() || null,
      autoRenewal: contract.autoRenewal,
      renewalPeriodMonths: contract.renewalPeriodMonths,
      annualValue: contract.annualValue ? Number(contract.annualValue) : null,
      paymentTerms: contract.paymentTerms,
      status: contract.status,
      documentUrl: contract.documentUrl,
      reminderDays: contract.reminderDays,
      notes: contract.notes,
      park: contract.park,
      fund: contract.fund,
      turbine: contract.turbine,
      partner: contract.partner ? {
        id: contract.partner.id,
        name: contract.partner.personType === "legal"
          ? contract.partner.companyName
          : `${contract.partner.firstName || ""} ${contract.partner.lastName || ""}`.trim(),
        email: contract.partner.email,
        phone: contract.partner.phone,
        personType: contract.partner.personType,
      } : null,
      documents: contract.documents.map((d: { id: string; title: string; fileName: string; category: string; createdAt: Date }) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      })),
      daysUntilEnd,
      daysUntilNotice,
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching contract");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// PUT /api/contracts/[id] - Update contract
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify contract exists and belongs to tenant
    const existing = await prisma.contract.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Vertrag nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = contractUpdateSchema.parse(body);

    // Calculate notice deadline if end date or notice period changed
    let noticeDeadline = validatedData.noticeDeadline;
    const endDate = validatedData.endDate ?? existing.endDate;
    const noticePeriodMonths =
      validatedData.noticePeriodMonths ?? existing.noticePeriodMonths;

    if (
      noticeDeadline === undefined &&
      endDate &&
      noticePeriodMonths &&
      (validatedData.endDate !== undefined ||
        validatedData.noticePeriodMonths !== undefined)
    ) {
      noticeDeadline = new Date(endDate);
      noticeDeadline.setMonth(noticeDeadline.getMonth() - noticePeriodMonths);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any


    const updateData: any = {};

    // Only include defined values
    if (validatedData.contractType !== undefined) {
      updateData.contractType = validatedData.contractType;
    }
    if (validatedData.contractNumber !== undefined) {
      updateData.contractNumber = validatedData.contractNumber;
    }
    if (validatedData.title !== undefined) {
      updateData.title = validatedData.title;
    }
    if (validatedData.startDate !== undefined) {
      updateData.startDate = validatedData.startDate;
    }
    if (validatedData.endDate !== undefined) {
      updateData.endDate = validatedData.endDate;
    }
    if (validatedData.noticePeriodMonths !== undefined) {
      updateData.noticePeriodMonths = validatedData.noticePeriodMonths;
    }
    if (noticeDeadline !== undefined) {
      updateData.noticeDeadline = noticeDeadline;
    }
    if (validatedData.autoRenewal !== undefined) {
      updateData.autoRenewal = validatedData.autoRenewal;
    }
    if (validatedData.renewalPeriodMonths !== undefined) {
      updateData.renewalPeriodMonths = validatedData.renewalPeriodMonths;
    }
    if (validatedData.annualValue !== undefined) {
      updateData.annualValue = validatedData.annualValue;
    }
    if (validatedData.paymentTerms !== undefined) {
      updateData.paymentTerms = validatedData.paymentTerms;
    }
    if (validatedData.status !== undefined) {
      updateData.status = validatedData.status;
    }
    if (validatedData.documentUrl !== undefined) {
      updateData.documentUrl = validatedData.documentUrl;
    }
    if (validatedData.reminderDays !== undefined) {
      updateData.reminderDays = validatedData.reminderDays;
    }
    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes;
    }
    if (validatedData.parkId !== undefined) {
      updateData.parkId = validatedData.parkId;
    }
    if (validatedData.turbineId !== undefined) {
      updateData.turbineId = validatedData.turbineId;
    }
    if (validatedData.fundId !== undefined) {
      updateData.fundId = validatedData.fundId;
    }
    if (validatedData.partnerId !== undefined) {
      updateData.partnerId = validatedData.partnerId;
    }

    const contract = await prisma.contract.update({
      where: { id },
      data: updateData,
      include: {
        park: { select: { id: true, name: true } },
        fund: { select: { id: true, name: true } },
        partner: { select: { id: true, firstName: true, lastName: true, companyName: true, personType: true } },
      },
    });

    // Fire-and-forget webhook when contract status changes to EXPIRED
    if (validatedData.status === "EXPIRED") {
      dispatchWebhook(check.tenantId!, "contract.expired", {
        contractId: contract.id,
        title: contract.title,
        endDate: contract.endDate?.toISOString() ?? null,
      }).catch(() => {});
    }

    // Transform partner to include name
    const response = {
      ...contract,
      partner: contract.partner ? {
        id: contract.partner.id,
        name: contract.partner.personType === "legal"
          ? contract.partner.companyName
          : `${contract.partner.firstName || ""} ${contract.partner.lastName || ""}`.trim(),
      } : null,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungültige Daten", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating contract");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// DELETE /api/contracts/[id] - Delete contract
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Before delete, get the full data for audit log
    const contractToDelete = await prisma.contract.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!contractToDelete) {
      return NextResponse.json(
        { error: "Vertrag nicht gefunden" },
        { status: 404 }
      );
    }

    // Perform the deletion
    await prisma.contract.delete({
      where: { id },
    });

    // Log the deletion
    await logDeletion("Contract", id, contractToDelete as Record<string, unknown>);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting contract");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
