/**
 * API Route: /api/admin/fund-categories
 * GET: Liste aller Gesellschaftstypen (sortiert nach sortOrder)
 * POST: Neuen Gesellschaftstyp erstellen
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
 * Schema fuer das Erstellen eines neuen Gesellschaftstyps
 * - name: Pflichtfeld, max 200 Zeichen
 * - code: Pflichtfeld, eindeutig, max 50 Zeichen (z.B. "GMBH", "GMBH_CO_KG")
 * - description: Optionale Beschreibung
 * - color: Optionale Hex-Farbe fuer Badge-Anzeige
 * - isActive: Standard true
 * - sortOrder: Standard 0
 */
const createFundCategorySchema = z.object({
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
  color: z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
});

// ============================================================================
// GET /api/admin/fund-categories
// ============================================================================

/**
 * Listet alle Gesellschaftstypen fuer den aktuellen Tenant
 *
 * Query-Parameter:
 * - isActive: Filter nach aktivem Status (true/false)
 *
 * Sortierung: Nach sortOrder ASC, dann name ASC
 * Include: Anzahl der zugeordneten Gesellschaften (_count.funds)
 */
export async function GET(request: NextRequest) {
  try {
    // Auth-Check: Nur Admins duerfen zugreifen
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Query-Parameter auslesen
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");

    // Where-Bedingung aufbauen mit Multi-Tenancy Filter
    const where = {
      tenantId: check.tenantId!,
      // Optionale Filter
      ...(isActive !== null && { isActive: isActive === "true" }),
    };

    // Gesellschaftstypen abrufen mit Fund-Count
    const fundCategories = await prisma.fundCategory.findMany({
      where,
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
      include: {
        _count: {
          select: { funds: true },
        },
      },
    });

    // Response transformieren
    const transformedCategories = fundCategories.map((category) => ({
      id: category.id,
      name: category.name,
      code: category.code,
      description: category.description,
      color: category.color,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      fundsCount: category._count.funds,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      data: transformedCategories,
      total: transformedCategories.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fund categories");
    return NextResponse.json(
      { error: "Fehler beim Laden der Gesellschaftstypen" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/admin/fund-categories
// ============================================================================

/**
 * Erstellt einen neuen Gesellschaftstyp
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
    const validatedData = createFundCategorySchema.parse(body);

    // Pruefen ob Code bereits existiert (innerhalb des Tenants)
    const existingCategory = await prisma.fundCategory.findFirst({
      where: {
        code: validatedData.code,
        tenantId: check.tenantId!,
      },
    });

    if (existingCategory) {
      return NextResponse.json(
        { error: `Ein Gesellschaftstyp mit dem Code "${validatedData.code}" existiert bereits` },
        { status: 409 } // Conflict
      );
    }

    // Neuen Gesellschaftstyp erstellen
    const fundCategory = await prisma.fundCategory.create({
      data: {
        name: validatedData.name,
        code: validatedData.code,
        description: validatedData.description,
        color: validatedData.color,
        isActive: validatedData.isActive,
        sortOrder: validatedData.sortOrder,
        tenantId: check.tenantId!,
      },
      include: {
        _count: {
          select: { funds: true },
        },
      },
    });

    // Response mit erstelltem Objekt
    return NextResponse.json(
      {
        id: fundCategory.id,
        name: fundCategory.name,
        code: fundCategory.code,
        description: fundCategory.description,
        color: fundCategory.color,
        isActive: fundCategory.isActive,
        sortOrder: fundCategory.sortOrder,
        fundsCount: fundCategory._count.funds,
        createdAt: fundCategory.createdAt.toISOString(),
        updatedAt: fundCategory.updatedAt.toISOString(),
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

    logger.error({ err: error }, "Error creating fund category");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Gesellschaftstyps" },
      { status: 500 }
    );
  }
}
