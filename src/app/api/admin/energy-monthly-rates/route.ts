/**
 * API Route: /api/admin/energy-monthly-rates
 * GET: Liste aller monatlichen Verguetungssaetze (filterbar nach year, month, revenueTypeId)
 * POST: Neuen monatlichen Verguetungssatz erstellen
 *
 * Nur fuer ADMIN und SUPERADMIN zugaenglich.
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
 * Validation Schema fuer neue monatliche Verguetungssaetze
 * - year: 4-stelliges Jahr
 * - month: 1-12
 * - ratePerKwh: Hauptsatz in ct/kWh (erforderlich)
 * - marketValue: Marktwert in ct/kWh (optional)
 * - managementFee: Management-Gebuehr in ct/kWh (optional)
 * - notes: Bemerkungen (optional)
 * - revenueTypeId: UUID des Verguetungstyps (erforderlich)
 */
const createMonthlyRateSchema = z.object({
  year: z
    .number()
    .int()
    .min(2000, "Jahr muss mindestens 2000 sein")
    .max(2100, "Jahr darf maximal 2100 sein"),
  month: z
    .number()
    .int()
    .min(1, "Monat muss zwischen 1 und 12 liegen")
    .max(12, "Monat muss zwischen 1 und 12 liegen"),
  ratePerKwh: z
    .number()
    .min(0, "Verguetungssatz muss positiv sein")
    .max(100, "Verguetungssatz erscheint unrealistisch hoch"),
  marketValue: z
    .number()
    .min(0, "Marktwert muss positiv sein")
    .max(100, "Marktwert erscheint unrealistisch hoch")
    .optional()
    .nullable(),
  managementFee: z
    .number()
    .min(0, "Management-Gebuehr muss positiv sein")
    .max(10, "Management-Gebuehr erscheint unrealistisch hoch")
    .optional()
    .nullable(),
  notes: z.string().max(1000, "Bemerkungen duerfen maximal 1000 Zeichen haben").optional().nullable(),
  revenueTypeId: z.string().uuid("Ungueltige Verguetungstyp-ID"),
});

// ============================================================================
// GET /api/admin/energy-monthly-rates
// ============================================================================

/**
 * Listet alle monatlichen Verguetungssaetze mit optionalen Filtern.
 *
 * Query-Parameter:
 * - year: Filter nach Jahr (number)
 * - month: Filter nach Monat (1-12)
 * - revenueTypeId: Filter nach Verguetungstyp (UUID)
 * - page: Seitennummer (default: 1)
 * - limit: Eintraege pro Seite (default: 50)
 *
 * Sortierung: year DESC, month DESC (neueste zuerst)
 */
export async function GET(request: NextRequest) {
  try {
    // Auth-Check: Nur ADMIN oder SUPERADMIN
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Query-Parameter auslesen
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");
    const revenueTypeId = searchParams.get("revenueTypeId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Validiere Paginierung
    const validPage = Math.max(1, page);
    const validLimit = Math.min(Math.max(1, limit), 100);

    // WHERE-Bedingungen aufbauen
    const where: Prisma.EnergyMonthlyRateWhereInput = {
      tenantId: check.tenantId!,
      ...(yearParam && { year: parseInt(yearParam, 10) }),
      ...(monthParam && { month: parseInt(monthParam, 10) }),
      ...(revenueTypeId && { revenueTypeId }),
    };

    // Parallele Abfragen: Daten + Count
    const [rates, total] = await Promise.all([
      prisma.energyMonthlyRate.findMany({
        where,
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
        orderBy: [
          { year: "desc" },
          { month: "desc" },
        ],
        skip: (validPage - 1) * validLimit,
        take: validLimit,
      }),
      prisma.energyMonthlyRate.count({ where }),
    ]);

    // Response-Transformation (Decimal zu Number konvertieren)
    const transformedRates = rates.map((rate) => ({
      id: rate.id,
      year: rate.year,
      month: rate.month,
      ratePerKwh: Number(rate.ratePerKwh),
      marketValue: rate.marketValue ? Number(rate.marketValue) : null,
      managementFee: rate.managementFee ? Number(rate.managementFee) : null,
      notes: rate.notes,
      revenueTypeId: rate.revenueTypeId,
      revenueType: rate.revenueType,
      createdAt: rate.createdAt.toISOString(),
      updatedAt: rate.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      data: transformedRates,
      pagination: {
        page: validPage,
        limit: validLimit,
        total,
        totalPages: Math.ceil(total / validLimit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching energy monthly rates");
    return NextResponse.json(
      { error: "Fehler beim Laden der monatlichen Verguetungssaetze" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/admin/energy-monthly-rates
// ============================================================================

/**
 * Erstellt einen neuen monatlichen Verguetungssatz.
 *
 * Validierungen:
 * - Alle Pflichtfelder muessen vorhanden sein
 * - revenueTypeId muss existieren und zum gleichen Tenant gehoeren
 * - Kombination (revenueTypeId, year, month, tenantId) muss eindeutig sein
 */
export async function POST(request: NextRequest) {
  try {
    // Auth-Check: Nur ADMIN oder SUPERADMIN
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Request-Body parsen und validieren
    const body = await request.json();
    const validatedData = createMonthlyRateSchema.parse(body);

    // Pruefe ob der Verguetungstyp existiert und zum Tenant gehoert
    const revenueType = await prisma.energyRevenueType.findFirst({
      where: {
        id: validatedData.revenueTypeId,
        tenantId: check.tenantId!,
      },
    });

    if (!revenueType) {
      return NextResponse.json(
        { error: "Verguetungstyp nicht gefunden oder nicht berechtigt" },
        { status: 404 }
      );
    }

    // Pruefe auf Duplikat (unique constraint: revenueTypeId + year + month + tenantId)
    const existingRate = await prisma.energyMonthlyRate.findUnique({
      where: {
        revenueTypeId_year_month_tenantId: {
          revenueTypeId: validatedData.revenueTypeId,
          year: validatedData.year,
          month: validatedData.month,
          tenantId: check.tenantId!,
        },
      },
    });

    if (existingRate) {
      return NextResponse.json(
        {
          error: `Fuer diesen Verguetungstyp existiert bereits ein Satz fuer ${validatedData.month}/${validatedData.year}`,
        },
        { status: 409 }
      );
    }

    // Erstelle den neuen Verguetungssatz
    const newRate = await prisma.energyMonthlyRate.create({
      data: {
        year: validatedData.year,
        month: validatedData.month,
        ratePerKwh: new Prisma.Decimal(validatedData.ratePerKwh),
        marketValue: validatedData.marketValue
          ? new Prisma.Decimal(validatedData.marketValue)
          : null,
        managementFee: validatedData.managementFee
          ? new Prisma.Decimal(validatedData.managementFee)
          : null,
        notes: validatedData.notes,
        revenueTypeId: validatedData.revenueTypeId,
        tenantId: check.tenantId!,
      },
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
    return NextResponse.json(
      {
        id: newRate.id,
        year: newRate.year,
        month: newRate.month,
        ratePerKwh: Number(newRate.ratePerKwh),
        marketValue: newRate.marketValue ? Number(newRate.marketValue) : null,
        managementFee: newRate.managementFee ? Number(newRate.managementFee) : null,
        notes: newRate.notes,
        revenueTypeId: newRate.revenueTypeId,
        revenueType: newRate.revenueType,
        createdAt: newRate.createdAt.toISOString(),
        updatedAt: newRate.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    // Zod Validation Error
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }

    // Prisma Unique Constraint Error (Fallback)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Ein Verguetungssatz fuer diesen Monat/Jahr existiert bereits" },
          { status: 409 }
        );
      }
    }

    logger.error({ err: error }, "Error creating energy monthly rate");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des monatlichen Verguetungssatzes" },
      { status: 500 }
    );
  }
}
