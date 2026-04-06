import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const status = searchParams.get("status");

    const ppas = await prisma.powerPurchaseAgreement.findMany({
      where: {
        tenantId,
        ...(parkId ? { parkId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: {
        park: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json({ ppas });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der PPAs");
    return NextResponse.json({ error: "Fehler beim Laden der PPAs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;

    const body = await request.json();

    // Validate required fields
    if (!body.title || !body.counterparty || !body.parkId || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: "Pflichtfelder fehlen" }, { status: 400 });
    }

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: { id: body.parkId, tenantId, deletedAt: null },
    });
    if (!park) {
      return NextResponse.json({ error: "Park nicht gefunden" }, { status: 404 });
    }

    const ppa = await prisma.powerPurchaseAgreement.create({
      data: {
        title: body.title,
        contractNumber: body.contractNumber || null,
        counterparty: body.counterparty,
        pricingMode: body.pricingMode || "FIXED",
        fixedPriceCentKwh: body.fixedPriceCentKwh ?? null,
        floorPriceCentKwh: body.floorPriceCentKwh ?? null,
        capPriceCentKwh: body.capPriceCentKwh ?? null,
        indexBase: body.indexBase || null,
        indexMarkupCentKwh: body.indexMarkupCentKwh ?? null,
        minQuantityMwh: body.minQuantityMwh ?? null,
        maxQuantityMwh: body.maxQuantityMwh ?? null,
        billingPeriod: body.billingPeriod || "MONTHLY",
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        status: body.status || "DRAFT",
        notes: body.notes || null,
        parkId: body.parkId,
        tenantId,
      },
      include: {
        park: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ppa }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Erstellen des PPA");
    return NextResponse.json({ error: "Fehler beim Erstellen des PPA" }, { status: 500 });
  }
}
