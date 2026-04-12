import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

const ppaCreateSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  counterparty: z.string().min(1, "Vertragspartner erforderlich"),
  parkId: z.string().uuid("Ungültige Park-ID"),
  startDate: z.string().min(1, "Startdatum erforderlich"),
  endDate: z.string().min(1, "Enddatum erforderlich"),
  contractNumber: z.string().optional().nullable(),
  pricingMode: z.enum(["FIXED", "INDEXED", "COLLAR"]).default("FIXED"),
  fixedPriceCentKwh: z.number().optional().nullable(),
  floorPriceCentKwh: z.number().optional().nullable(),
  capPriceCentKwh: z.number().optional().nullable(),
  indexBase: z.string().optional().nullable(),
  indexMarkupCentKwh: z.number().optional().nullable(),
  minQuantityMwh: z.number().optional().nullable(),
  maxQuantityMwh: z.number().optional().nullable(),
  billingPeriod: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"]).default("DRAFT"),
  notes: z.string().optional().nullable(),
});

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
    const tenantId = check.tenantId!;

    const body = await request.json();
    const result = ppaCreateSchema.safeParse(body);
    if (!result.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: result.error.flatten().fieldErrors });
    }
    const data = result.data;

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: { id: data.parkId, tenantId, deletedAt: null },
    });
    if (!park) {
      return apiError("NOT_FOUND", 404, { message: "Park nicht gefunden" });
    }

    const ppa = await prisma.powerPurchaseAgreement.create({
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
