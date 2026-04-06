import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

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
      return NextResponse.json({ error: "PPA nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ ppa });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden des PPA");
    return NextResponse.json({ error: "Fehler beim Laden des PPA" }, { status: 500 });
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
      return NextResponse.json({ error: "PPA nicht gefunden" }, { status: 404 });
    }

    const body = await request.json();

    const ppa = await prisma.powerPurchaseAgreement.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.contractNumber !== undefined && { contractNumber: body.contractNumber }),
        ...(body.counterparty !== undefined && { counterparty: body.counterparty }),
        ...(body.pricingMode !== undefined && { pricingMode: body.pricingMode }),
        ...(body.fixedPriceCentKwh !== undefined && { fixedPriceCentKwh: body.fixedPriceCentKwh }),
        ...(body.floorPriceCentKwh !== undefined && { floorPriceCentKwh: body.floorPriceCentKwh }),
        ...(body.capPriceCentKwh !== undefined && { capPriceCentKwh: body.capPriceCentKwh }),
        ...(body.indexBase !== undefined && { indexBase: body.indexBase }),
        ...(body.indexMarkupCentKwh !== undefined && { indexMarkupCentKwh: body.indexMarkupCentKwh }),
        ...(body.minQuantityMwh !== undefined && { minQuantityMwh: body.minQuantityMwh }),
        ...(body.maxQuantityMwh !== undefined && { maxQuantityMwh: body.maxQuantityMwh }),
        ...(body.billingPeriod !== undefined && { billingPeriod: body.billingPeriod }),
        ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
        ...(body.endDate !== undefined && { endDate: new Date(body.endDate) }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: {
        park: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ppa });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Aktualisieren des PPA");
    return NextResponse.json({ error: "Fehler beim Aktualisieren des PPA" }, { status: 500 });
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
      return NextResponse.json({ error: "PPA nicht gefunden" }, { status: 404 });
    }

    await prisma.powerPurchaseAgreement.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Löschen des PPA");
    return NextResponse.json({ error: "Fehler beim Löschen des PPA" }, { status: 500 });
  }
}
