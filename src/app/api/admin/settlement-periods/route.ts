import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const createPeriodSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional().nullable(),
  parkId: z.string().uuid(),
  periodType: z.enum(["ADVANCE", "FINAL"]).default("FINAL"),
  advanceInterval: z.enum(["YEARLY", "QUARTERLY", "MONTHLY"]).optional().nullable(),
  linkedEnergySettlementId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

// GET /api/admin/settlement-periods - Liste aller Perioden
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const periodType = searchParams.get("periodType");
    const status = searchParams.get("status");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any


    const where: any = {
      tenantId: check.tenantId!,
    };

    if (parkId) where.parkId = parkId;
    if (year) where.year = parseInt(year, 10);
    if (month) where.month = parseInt(month, 10);
    if (periodType) where.periodType = periodType;
    if (status) where.status = status;

    const periods = await prisma.leaseSettlementPeriod.findMany({
      where,
      include: {
        park: {
          select: { id: true, name: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { invoices: true },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { park: { name: "asc" } }],
    });

    return NextResponse.json(periods);
  } catch (error) {
    logger.error({ err: error }, "Error fetching settlement periods");
    return NextResponse.json(
      { error: "Fehler beim Laden der Abrechnungsperioden" },
      { status: 500 }
    );
  }
}

// POST /api/admin/settlement-periods - Neue Periode erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { year, month, parkId, periodType, advanceInterval, linkedEnergySettlementId, notes } = createPeriodSchema.parse(body);

    // Prüfe ob Park existiert und zum Tenant gehört
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Windpark nicht gefunden" },
        { status: 404 }
      );
    }

    // Validiere periodType/month Kombination
    const interval = periodType === "ADVANCE" ? (advanceInterval ?? "MONTHLY") : null;
    if (periodType === "ADVANCE" && interval !== "YEARLY" && !month) {
      return NextResponse.json(
        { error: "ADVANCE Perioden (Quartals-/Monatsvorschuss) benoetigen einen Monat/Quartal" },
        { status: 400 }
      );
    }

    // Prüfe auf Duplikat (mit month + periodType fuer unique constraint)
    const existing = await prisma.leaseSettlementPeriod.findFirst({
      where: {
        tenantId: check.tenantId!,
        parkId,
        year,
        month: month ?? null,
        periodType,
      },
      include: {
        park: {
          select: { id: true, name: true },
        },
      },
    });

    if (existing) {
      // If the existing period is still in a working state, reuse it (allows re-calculation)
      if (existing.status === "OPEN" || existing.status === "IN_PROGRESS") {
        return NextResponse.json(existing, { status: 200 });
      }
      // Cancelled periods can be replaced with a new one
      if (existing.status === "CANCELLED") {
        // Allow creation - the unique constraint includes periodType,
        // but we need to skip this cancelled record. Delete it first.
        await prisma.leaseSettlementPeriod.delete({ where: { id: existing.id } });
      } else {
        const periodDesc = month
          ? `${month}/${year} (${periodType})`
          : `${year} (${periodType})`;
        return NextResponse.json(
          { error: `Abrechnungsperiode ${periodDesc} fuer diesen Park existiert bereits (Status: ${existing.status})` },
          { status: 409 }
        );
      }
    }

    // Falls linkedEnergySettlementId angegeben, prüfe ob sie existiert
    if (linkedEnergySettlementId) {
      const energySettlement = await prisma.energySettlement.findFirst({
        where: {
          id: linkedEnergySettlementId,
          tenantId: check.tenantId!,
        },
      });

      if (!energySettlement) {
        return NextResponse.json(
          { error: "Verknuepfte Stromabrechnung nicht gefunden" },
          { status: 404 }
        );
      }
    }

    const period = await prisma.leaseSettlementPeriod.create({
      data: {
        year,
        month: month ?? null,
        periodType,
        parkId,
        advanceInterval: interval,
        linkedEnergySettlementId: linkedEnergySettlementId ?? null,
        notes,
        tenantId: check.tenantId!,
        createdById: check.userId,
      },
      include: {
        park: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(period, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating settlement period");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Abrechnungsperiode" },
      { status: 500 }
    );
  }
}
