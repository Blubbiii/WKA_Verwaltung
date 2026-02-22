/**
 * API Route: /api/admin/energy-revenue-types
 * GET: Liste aller Verguetungsarten (sortiert nach sortOrder)
 * POST: Neue Verguetungsart erstellen
 *
 * Multi-Tenancy: Filtert automatisch nach tenantId aus der Session
 * Berechtigung: Nur ADMIN und SUPERADMIN
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema fuer das Erstellen einer neuen Verguetungsart
 * - name: Pflichtfeld, max 200 Zeichen
 * - code: Pflichtfeld, eindeutig, max 50 Zeichen (z.B. "EEG_2023", "MARKET_DIRECT")
 * - calculationType: Art der Berechnung (FIXED_RATE, MARKET_PRICE, MANUAL)
 * - hasTax: Ob MwSt. anfaellt (Standard: true)
 * - taxRate: MwSt.-Satz in Prozent (Standard: 19.0)
 */
const createEnergyRevenueTypeSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  code: z
    .string()
    .min(1, "Code ist erforderlich")
    .max(50)
    .regex(
      /^[A-Z0-9_]+$/,
      "Code darf nur Grossbuchstaben, Zahlen und Unterstriche enthalten"
    ),
  description: z.string().max(1000).optional().nullable(),
  calculationType: z
    .enum(["FIXED_RATE", "MARKET_PRICE", "MANUAL"])
    .optional()
    .default("FIXED_RATE"),
  hasTax: z.boolean().optional().default(true),
  taxRate: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .nullable()
    .default(19.0),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
});

// ============================================================================
// GET /api/admin/energy-revenue-types
// ============================================================================

/**
 * Listet alle Verguetungsarten fuer den aktuellen Tenant
 *
 * Query-Parameter:
 * - isActive: Filter nach aktivem Status (true/false)
 * - calculationType: Filter nach Berechnungstyp
 *
 * Sortierung: Nach sortOrder ASC, dann name ASC
 */
export async function GET(request: NextRequest) {
  try {
    // Auth-Check: Nur Admins duerfen zugreifen
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Query-Parameter auslesen
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");
    const calculationType = searchParams.get("calculationType");

    // Where-Bedingung aufbauen mit Multi-Tenancy Filter
    const where = {
      tenantId: check.tenantId!,
      // Optionale Filter
      ...(isActive !== null && { isActive: isActive === "true" }),
      ...(calculationType && {
        calculationType: calculationType as "FIXED_RATE" | "MARKET_PRICE" | "MANUAL",
      }),
    };

    // Verguetungsarten abrufen
    const energyRevenueTypes = await prisma.energyRevenueType.findMany({
      where,
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    // Response transformieren (Decimal zu Number konvertieren)
    const transformedTypes = energyRevenueTypes.map((type) => ({
      id: type.id,
      name: type.name,
      code: type.code,
      description: type.description,
      calculationType: type.calculationType,
      hasTax: type.hasTax,
      taxRate: type.taxRate ? Number(type.taxRate) : null,
      isActive: type.isActive,
      sortOrder: type.sortOrder,
      createdAt: type.createdAt.toISOString(),
      updatedAt: type.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      data: transformedTypes,
      total: transformedTypes.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching energy revenue types");
    return NextResponse.json(
      { error: "Fehler beim Laden der Verguetungsarten" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/admin/energy-revenue-types
// ============================================================================

/**
 * Erstellt eine neue Verguetungsart
 *
 * Validierung:
 * - Code muss eindeutig sein (innerhalb des Tenants)
 * - Alle Pflichtfelder muessen vorhanden sein
 */
export async function POST(request: NextRequest) {
  try {
    // Auth-Check: Nur Admins duerfen zugreifen
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Request-Body parsen und validieren
    const body = await request.json();
    const validatedData = createEnergyRevenueTypeSchema.parse(body);

    // Pruefen ob Code bereits existiert (innerhalb des Tenants)
    const existingType = await prisma.energyRevenueType.findFirst({
      where: {
        code: validatedData.code,
        tenantId: check.tenantId!,
      },
    });

    if (existingType) {
      return NextResponse.json(
        { error: `Eine Verguetungsart mit dem Code "${validatedData.code}" existiert bereits` },
        { status: 409 } // Conflict
      );
    }

    // Neue Verguetungsart erstellen
    const energyRevenueType = await prisma.energyRevenueType.create({
      data: {
        name: validatedData.name,
        code: validatedData.code,
        description: validatedData.description,
        calculationType: validatedData.calculationType,
        hasTax: validatedData.hasTax,
        taxRate: validatedData.taxRate,
        isActive: validatedData.isActive,
        sortOrder: validatedData.sortOrder,
        tenantId: check.tenantId!,
      },
    });

    // Response mit erstelltem Objekt
    return NextResponse.json(
      {
        id: energyRevenueType.id,
        name: energyRevenueType.name,
        code: energyRevenueType.code,
        description: energyRevenueType.description,
        calculationType: energyRevenueType.calculationType,
        hasTax: energyRevenueType.hasTax,
        taxRate: energyRevenueType.taxRate ? Number(energyRevenueType.taxRate) : null,
        isActive: energyRevenueType.isActive,
        sortOrder: energyRevenueType.sortOrder,
        createdAt: energyRevenueType.createdAt.toISOString(),
        updatedAt: energyRevenueType.updatedAt.toISOString(),
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

    logger.error({ err: error }, "Error creating energy revenue type");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Verguetungsart" },
      { status: 500 }
    );
  }
}
