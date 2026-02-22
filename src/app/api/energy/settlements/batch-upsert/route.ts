import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const monthlyEntrySchema = z.object({
  month: z.number().int().min(1).max(12),
  eegProductionKwh: z.number().nonnegative().nullable().optional(),
  eegRevenueEur: z.number().nonnegative().nullable().optional(),
  dvProductionKwh: z.number().nonnegative().nullable().optional(),
  dvRevenueEur: z.number().nonnegative().nullable().optional(),
});

const batchUpsertSchema = z.object({
  parkId: z.string().uuid("Ungueltige Park-ID"),
  year: z.number().int().min(2000).max(2100),
  entries: z.array(monthlyEntrySchema).min(1).max(12),
});

// =============================================================================
// POST /api/energy/settlements/batch-upsert
// Upsert monthly EnergySettlement records for a park/year.
// Only creates new DRAFT records or updates existing DRAFT records.
// Finalized records (CALCULATED/INVOICED/CLOSED) are NOT modified.
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { parkId, year, entries } = batchUpsertSchema.parse(body);

    // Validate park belongs to tenant
    const park = await prisma.park.findFirst({
      where: { id: parkId, tenantId: check.tenantId! },
      select: { id: true, name: true },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Load all existing settlements for this park/year
    const existing = await prisma.energySettlement.findMany({
      where: {
        parkId,
        year,
        tenantId: check.tenantId!,
        month: { in: entries.map((e) => e.month) },
      },
      select: { id: true, month: true, status: true },
    });

    const existingByMonth = new Map(existing.map((e) => [e.month, e]));

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: { month: number; reason: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        const totalProductionKwh =
          (entry.eegProductionKwh || 0) + (entry.dvProductionKwh || 0);
        const netOperatorRevenueEur =
          (entry.eegRevenueEur || 0) + (entry.dvRevenueEur || 0);

        // Skip entries with no data
        if (totalProductionKwh === 0 && netOperatorRevenueEur === 0) continue;

        const existingRecord = existingByMonth.get(entry.month);

        if (existingRecord) {
          // Only update DRAFT records
          if (existingRecord.status !== "DRAFT") {
            skipped.push({
              month: entry.month,
              reason: `Status ${existingRecord.status} - nur Entwuerfe werden aktualisiert`,
            });
            continue;
          }

          await tx.energySettlement.update({
            where: { id: existingRecord.id },
            data: {
              eegProductionKwh: entry.eegProductionKwh ?? null,
              eegRevenueEur: entry.eegRevenueEur ?? null,
              dvProductionKwh: entry.dvProductionKwh ?? null,
              dvRevenueEur: entry.dvRevenueEur ?? null,
              totalProductionKwh,
              netOperatorRevenueEur,
            },
          });
          updated.push(existingRecord.id);
        } else {
          // Create new DRAFT record
          const record = await tx.energySettlement.create({
            data: {
              parkId,
              year,
              month: entry.month,
              eegProductionKwh: entry.eegProductionKwh ?? null,
              eegRevenueEur: entry.eegRevenueEur ?? null,
              dvProductionKwh: entry.dvProductionKwh ?? null,
              dvRevenueEur: entry.dvRevenueEur ?? null,
              totalProductionKwh,
              netOperatorRevenueEur,
              status: "DRAFT",
              tenantId: check.tenantId!,
            },
          });
          created.push(record.id);
        }
      }
    });

    // Reload all settlements for the park/year to return updated data
    const settlements = await prisma.energySettlement.findMany({
      where: {
        parkId,
        year,
        tenantId: check.tenantId!,
      },
      include: {
        park: {
          select: { id: true, name: true, shortName: true },
        },
      },
      orderBy: [{ month: "asc" }],
    });

    return NextResponse.json({
      message: `${created.length} erstellt, ${updated.length} aktualisiert${skipped.length > 0 ? `, ${skipped.length} uebersprungen` : ""}`,
      settlements,
      summary: {
        created: created.length,
        updated: updated.length,
        skipped,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error batch upserting energy settlements");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Energiedaten" },
      { status: 500 }
    );
  }
}
