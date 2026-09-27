import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { ppaCreateSchema } from "@/lib/ppa/schemas";
import { requirePermission } from "@/lib/auth/withPermission";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { apiLogger as logger } from "@/lib/logger";


export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);
    const tenantId = check.tenantId!;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const status = searchParams.get("status");

    const ppas = await db.powerPurchaseAgreement.findMany({
      where: {
        tenantId,
        ...(parkId ? { parkId } : {}),
        ...(status ? { status: status as "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED" } : {}),
      },
      include: {
        park: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json({ ppas });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der PPAs");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der PPAs" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);
    const tenantId = check.tenantId!;

    const body = await request.json();
    const result = ppaCreateSchema.safeParse(body);
    if (!result.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: result.error.flatten().fieldErrors });
    }
    const data = result.data;

    // Verify park belongs to tenant
    const park = await db.park.findFirst({
      where: { id: data.parkId, tenantId, deletedAt: null },
    });
    if (!park) {
      return apiError("NOT_FOUND", 404, { message: "Park nicht gefunden" });
    }

    const ppa = await db.powerPurchaseAgreement.create({
      data: {
        title: data.title,
        contractNumber: data.contractNumber || null,
        counterparty: data.counterparty,
        pricingMode: data.pricingMode,
        fixedPriceCentKwh: data.fixedPriceCentKwh ?? null,
        floorPriceCentKwh: data.floorPriceCentKwh ?? null,
        capPriceCentKwh: data.capPriceCentKwh ?? null,
        indexBase: data.indexBase || null,
        indexMarkupCentKwh: data.indexMarkupCentKwh ?? null,
        minQuantityMwh: data.minQuantityMwh ?? null,
        maxQuantityMwh: data.maxQuantityMwh ?? null,
        billingPeriod: data.billingPeriod,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status,
        notes: data.notes || null,
        parkId: data.parkId,
        tenantId,
      },
      include: {
        park: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ppa }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Erstellen des PPA");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen des PPA" });
  }
}
