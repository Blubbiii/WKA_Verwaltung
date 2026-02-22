import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const bulkCreateSchema = z.object({
  parkId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  frequency: z.enum(["MONTHLY", "QUARTERLY"]),
  createFinalPeriod: z.boolean().default(true), // Erstelle auch FINAL Periode fuer das Jahr
  notes: z.string().optional(),
});

// Quartals-Mapping: Welche Monate gehoeren zu welchem Quartal
const QUARTERLY_MONTHS = [
  [1, 2, 3],   // Q1
  [4, 5, 6],   // Q2
  [7, 8, 9],   // Q3
  [10, 11, 12] // Q4
];

// POST /api/admin/settlement-periods/bulk-create - Mehrere Perioden erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { parkId, year, frequency, createFinalPeriod, notes } = bulkCreateSchema.parse(body);

    // Pruefe ob Park existiert und zum Tenant gehoert
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: { id: true, name: true },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Windpark nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefe auf existierende Perioden fuer dieses Jahr
    const existingPeriods = await prisma.leaseSettlementPeriod.findMany({
      where: {
        parkId,
        year,
        tenantId: check.tenantId!,
      },
      select: { id: true, month: true, periodType: true },
    });

    const existingMonths = new Set(existingPeriods.filter(p => p.month).map(p => p.month));
    const hasFinalPeriod = existingPeriods.some(p => p.periodType === "FINAL" && !p.month);

    // Bestimme zu erstellende Monate basierend auf Frequenz
    let monthsToCreate: number[] = [];

    if (frequency === "MONTHLY") {
      // Alle 12 Monate
      monthsToCreate = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    } else if (frequency === "QUARTERLY") {
      // Nur Quartalsmonate (Maerz, Juni, September, Dezember)
      monthsToCreate = [3, 6, 9, 12];
    }

    // Filtere bereits existierende Monate
    const newMonths = monthsToCreate.filter(m => !existingMonths.has(m));

    if (newMonths.length === 0 && (hasFinalPeriod || !createFinalPeriod)) {
      return NextResponse.json(
        { error: `Alle ${frequency === "MONTHLY" ? "monatlichen" : "quartalsweisen"} ADVANCE Perioden fuer ${year} existieren bereits` },
        { status: 409 }
      );
    }

    // Erstelle Perioden in einer Transaktion
    const createdPeriods = await prisma.$transaction(async (tx) => {
      const created = [];

      // Erstelle ADVANCE Perioden
      for (const month of newMonths) {
        const period = await tx.leaseSettlementPeriod.create({
          data: {
            year,
            month,
            periodType: "ADVANCE",
            parkId,
            tenantId: check.tenantId!,
            createdById: check.userId,
            notes: notes ? `${notes} (${getMonthName(month)} ${year})` : undefined,
          },
          include: {
            park: { select: { id: true, name: true } },
          },
        });
        created.push(period);
      }

      // Erstelle FINAL Periode wenn gewuenscht und nicht vorhanden
      if (createFinalPeriod && !hasFinalPeriod) {
        const finalPeriod = await tx.leaseSettlementPeriod.create({
          data: {
            year,
            month: null, // FINAL hat keinen Monat
            periodType: "FINAL",
            parkId,
            tenantId: check.tenantId!,
            createdById: check.userId,
            notes: notes ? `${notes} (Jahresendabrechnung ${year})` : undefined,
          },
          include: {
            park: { select: { id: true, name: true } },
          },
        });
        created.push(finalPeriod);
      }

      return created;
    });

    const advanceCount = createdPeriods.filter(p => p.periodType === "ADVANCE").length;
    const finalCount = createdPeriods.filter(p => p.periodType === "FINAL").length;

    return NextResponse.json({
      message: `${advanceCount} ADVANCE Periode(n) und ${finalCount} FINAL Periode(n) fuer ${park.name} ${year} erstellt`,
      summary: {
        year,
        frequency,
        parkName: park.name,
        advancePeriodsCreated: advanceCount,
        finalPeriodCreated: finalCount > 0,
        totalCreated: createdPeriods.length,
      },
      periods: createdPeriods.map(p => ({
        id: p.id,
        year: p.year,
        month: p.month,
        periodType: p.periodType,
        status: p.status,
        parkName: p.park.name,
      })),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error bulk creating settlement periods");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Abrechnungsperioden" },
      { status: 500 }
    );
  }
}

// GET /api/admin/settlement-periods/bulk-create - Pruefe Status fuer ein Jahr
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const year = searchParams.get("year");

    if (!parkId || !year) {
      return NextResponse.json(
        { error: "parkId und year sind erforderlich" },
        { status: 400 }
      );
    }

    const yearNum = parseInt(year, 10);

    // Lade existierende Perioden
    const existingPeriods = await prisma.leaseSettlementPeriod.findMany({
      where: {
        parkId,
        year: yearNum,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        month: true,
        periodType: true,
        status: true,
      },
      orderBy: [{ month: "asc" }],
    });

    // Erstelle Status-Uebersicht
    const monthlyStatus = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const period = existingPeriods.find(p => p.month === month && p.periodType === "ADVANCE");
      return {
        month,
        monthName: getMonthName(month),
        exists: !!period,
        periodId: period?.id || null,
        status: period?.status || null,
      };
    });

    const finalPeriod = existingPeriods.find(p => p.periodType === "FINAL" && !p.month);

    return NextResponse.json({
      year: yearNum,
      parkId,
      monthlyPeriods: monthlyStatus,
      finalPeriod: finalPeriod ? {
        exists: true,
        periodId: finalPeriod.id,
        status: finalPeriod.status,
      } : {
        exists: false,
        periodId: null,
        status: null,
      },
      summary: {
        monthlyPeriodsExisting: monthlyStatus.filter(m => m.exists).length,
        monthlyPeriodsMissing: monthlyStatus.filter(m => !m.exists).length,
        hasFinalPeriod: !!finalPeriod,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error checking settlement periods");
    return NextResponse.json(
      { error: "Fehler beim Pruefen der Abrechnungsperioden" },
      { status: 500 }
    );
  }
}

// Hilfsfunktion: Monatsname
function getMonthName(month: number): string {
  const names = [
    "", "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
  ];
  return names[month] || "";
}
