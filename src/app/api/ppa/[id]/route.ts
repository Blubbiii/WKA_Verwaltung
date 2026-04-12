import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

const ppaUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  counterparty: z.string().min(1).optional(),
  pricingMode: z.enum(["FIXED", "INDEXED", "COLLAR"]).optional(),
  fixedPriceCentKwh: z.number().optional().nullable(),
  floorPriceCentKwh: z.number().optional().nullable(),
  capPriceCentKwh: z.number().optional().nullable(),
  indexBase: z.string().optional().nullable(),
  indexMarkupCentKwh: z.number().optional().nullable(),
  minQuantityMwh: z.number().optional().nullable(),
  maxQuantityMwh: z.number().optional().nullable(),
  billingPeriod: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"]).optional(),
  notes: z.string().optional().nullable(),
  contractNumber: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;
    const { id } = await params;

    const ppa = await prisma.powerPurchaseAgreement.findFirst({
      where: { id, tenantId },
      include: {
        park: { select: { id: true, name: true, totalCapacityKw: true, _count: { select: { turbines: true } } } },
      },
    });

    if (!ppa) {
      return apiError("NOT_FOUND", 404, { message: "PPA nicht gefunden" });
    }

    return NextResponse.json({ ppa });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden des PPA");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden des PPA" });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;
    const { id } = await params;

    // Verify PPA belongs to tenant
    const existing = await prisma.powerPurchaseAgreement.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "PPA nicht gefunden" });
    }

    const body = await request.json();
    const result = ppaUpdateSchema.safeParse(body);
    if (!result.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: result.error.flatten().fieldErrors });
    }
    const data = result.data;

    const ppa = await prisma.powerPurchaseAgreement.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.contractNumber !== undefined && { contractNumber: data.contractNumber }),
        ...(data.counterparty !== undefined && { counterparty: data.counterparty }),
        ...(data.pricingMode !== undefined && { pricingMode: data.pricingMode }),
        ...(data.fixedPriceCentKwh !== undefined && { fixedPriceCentKwh: data.fixedPriceCentKwh }),
        ...(data.floorPriceCentKwh !== undefined && { floorPriceCentKwh: data.floorPriceCentKwh }),
        ...(data.capPriceCentKwh !== undefined && { capPriceCentKwh: data.capPriceCentKwh }),
        ...(data.indexBase !== undefined && { indexBase: data.indexBase }),
        ...(data.indexMarkupCentKwh !== undefined && { indexMarkupCentKwh: data.indexMarkupCentKwh }),
        ...(data.minQuantityMwh !== undefined && { minQuantityMwh: data.minQuantityMwh }),
        ...(data.maxQuantityMwh !== undefined && { maxQuantityMwh: data.maxQuantityMwh }),
        ...(data.billingPeriod !== undefined && { billingPeriod: data.billingPeriod }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        park: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ppa });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Aktualisieren des PPA");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren des PPA" });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:delete");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;
    const { id } = await params;

    const existing = await prisma.powerPurchaseAgreement.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "PPA nicht gefunden" });
    }

    await prisma.powerPurchaseAgreement.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Löschen des PPA");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen des PPA" });
  }
}
