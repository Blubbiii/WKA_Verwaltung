/**
 * API Route: /api/admin/energy-monthly-rates/[id]
 * GET: Einzelnen monatlichen Vergütungssatz abrufen
 * PATCH: Monatlichen Vergütungssatz aktualisieren
 * DELETE: Monatlichen Vergütungssatz löschen
 *
 * Nur für ADMIN und SUPERADMIN zugaenglich.
 * Multi-Tenancy: Alle Abfragen sind auf tenantId beschraenkt.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Validation Schema für Updates
 * Alle Felder sind optional - nur gesendete Felder werden aktualisiert.
 *
 * ACHTUNG: year, month und revenueTypeId können nicht geändert werden,
 * da sie Teil des Unique-Keys sind. Dafür muss der alte Eintrag gelöscht
 * und ein neuer erstellt werden.
 */
const updateMonthlyRateSchema = z.object({
  ratePerKwh: z
    .number()
    .min(0, "Vergütungssatz muss positiv sein")
    .max(100, "Vergütungssatz erscheint unrealistisch hoch")
    .optional(),
  marketValue: z
    .number()
    .min(0, "Marktwert muss positiv sein")
    .max(100, "Marktwert erscheint unrealistisch hoch")
    .optional()
    .nullable(),
  managementFee: z
    .number()
    .min(0, "Management-Gebühr muss positiv sein")
    .max(10, "Management-Gebühr erscheint unrealistisch hoch")
    .optional()
    .nullable(),
  notes: z.string().max(1000, "Bemerkungen duerfen maximal 1000 Zeichen haben").optional().nullable(),
});

// ============================================================================
// GET /api/admin/energy-monthly-rates/[id]
// ============================================================================

/**
 * Ruft einen einzelnen monatlichen Vergütungssatz ab.
 * Inkludiert Details zum zugehoerigen Vergütungstyp.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check: Nur ADMIN oder SUPERADMIN
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Lade den Vergütungssatz mit Tenant-Filter
    const rate = await prisma.energyMonthlyRate.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        revenueType: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            calculationType: true,
            hasTax: true,
            taxRate: true,
            isActive: true,
          },
        },
      },
    });

    if (!rate) {
      return NextResponse.json(
        { error: "Monatlicher Vergütungssatz nicht gefunden" },
        { status: 404 }
      );
    }

    // Response-Transformation (Decimal zu Number konvertieren)
    return NextResponse.json({
      id: rate.id,
      year: rate.year,
      month: rate.month,
      ratePerKwh: Number(rate.ratePerKwh),
      marketValue: rate.marketValue ? Number(rate.marketValue) : null,
      managementFee: rate.managementFee ? Number(rate.managementFee) : null,
      notes: rate.notes,
      revenueTypeId: rate.revenueTypeId,
      revenueType: {
        ...rate.revenueType,
        taxRate: rate.revenueType.taxRate ? Number(rate.revenueType.taxRate) : null,
      },
      createdAt: rate.createdAt.toISOString(),
      updatedAt: rate.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching energy monthly rate");
    return NextResponse.json(
      { error: "Fehler beim Laden des monatlichen Vergütungssatzes" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/admin/energy-monthly-rates/[id]
// ============================================================================

/**
 * Aktualisiert einen monatlichen Vergütungssatz.
 *
 * HINWEIS: year, month und revenueTypeId können NICHT geändert werden,
 * da sie Teil des Unique-Keys sind. Um diese zu aendern, muss der alte
 * Eintrag gelöscht und ein neuer erstellt werden.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check: Nur ADMIN oder SUPERADMIN
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();

    // Validiere Request-Body
    const validatedData = updateMonthlyRateSchema.parse(body);

    // Pruefe ob der Vergütungssatz existiert und zum Tenant gehoert
    const existingRate = await prisma.energyMonthlyRate.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingRate) {
      return NextResponse.json(
        { error: "Monatlicher Vergütungssatz nicht gefunden" },
        { status: 404 }
      );
    }

    // Baue das Update-Objekt auf (nur gesetzte Felder)
    const updateData: Prisma.EnergyMonthlyRateUpdateInput = {};

    if (validatedData.ratePerKwh !== undefined) {
      updateData.ratePerKwh = new Prisma.Decimal(validatedData.ratePerKwh);
    }

    if (validatedData.marketValue !== undefined) {
      updateData.marketValue = validatedData.marketValue
        ? new Prisma.Decimal(validatedData.marketValue)
        : null;
    }

    if (validatedData.managementFee !== undefined) {
      updateData.managementFee = validatedData.managementFee
        ? new Prisma.Decimal(validatedData.managementFee)
        : null;
    }

    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes;
    }

    // Fuehre das Update durch
    const updatedRate = await prisma.energyMonthlyRate.update({
      where: { id },
      data: updateData,
      include: {
        revenueType: {
          select: {
            id: true,
            name: true,
            code: true,
            calculationType: true,
          },
        },
      },
    });

    // Response-Transformation
    return NextResponse.json({
      id: updatedRate.id,
      year: updatedRate.year,
      month: updatedRate.month,
      ratePerKwh: Number(updatedRate.ratePerKwh),
      marketValue: updatedRate.marketValue ? Number(updatedRate.marketValue) : null,
      managementFee: updatedRate.managementFee ? Number(updatedRate.managementFee) : null,
      notes: updatedRate.notes,
      revenueTypeId: updatedRate.revenueTypeId,
      revenueType: updatedRate.revenueType,
      createdAt: updatedRate.createdAt.toISOString(),
      updatedAt: updatedRate.updatedAt.toISOString(),
    });
  } catch (error) {
    // Zod Validation Error
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }

    logger.error({ err: error }, "Error updating energy monthly rate");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des monatlichen Vergütungssatzes" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/admin/energy-monthly-rates/[id]
// ============================================================================

/**
 * Loescht einen monatlichen Vergütungssatz permanent.
 *
 * HINWEIS: Dies ist ein Hard-Delete (kein Soft-Delete), da Vergütungssaetze
 * in der Regel für Berechnungen verwendet werden und veraltete Daten
 * zu Verwirrung fuehren können.
 *
 * WARNUNG: Dieser Vorgang kann nicht rueckgaengig gemacht werden!
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check: Nur ADMIN oder SUPERADMIN
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Pruefe ob der Vergütungssatz existiert und zum Tenant gehoert
    const existingRate = await prisma.energyMonthlyRate.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        revenueType: {
          select: { name: true },
        },
      },
    });

    if (!existingRate) {
      return NextResponse.json(
        { error: "Monatlicher Vergütungssatz nicht gefunden" },
        { status: 404 }
      );
    }

    // Loesche den Vergütungssatz
    await prisma.energyMonthlyRate.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Vergütungssatz für ${existingRate.revenueType.name} (${existingRate.month}/${existingRate.year}) wurde gelöscht`,
      deletedId: id,
    });
  } catch (error) {
    // Prisma Foreign Key Constraint Error
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        return NextResponse.json(
          {
            error:
              "Dieser Vergütungssatz kann nicht gelöscht werden, da er noch von anderen Datensaetzen referenziert wird",
          },
          { status: 409 }
        );
      }
    }

    logger.error({ err: error }, "Error deleting energy monthly rate");
    return NextResponse.json(
      { error: "Fehler beim Löschen des monatlichen Vergütungssatzes" },
      { status: 500 }
    );
  }
}
