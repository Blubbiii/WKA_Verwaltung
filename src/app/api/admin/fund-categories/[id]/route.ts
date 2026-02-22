/**
 * API Route: /api/admin/fund-categories/[id]
 * GET: Einzelnen Gesellschaftstyp abrufen
 * PATCH: Gesellschaftstyp aktualisieren
 * DELETE: Gesellschaftstyp loeschen (nur wenn keine Gesellschaften zugeordnet)
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
 * Schema fuer das Aktualisieren eines Gesellschaftstyps
 * Alle Felder sind optional (Partial Update)
 */
const updateFundCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[A-Z0-9_]+$/,
      "Code darf nur Grossbuchstaben, Zahlen und Unterstriche enthalten"
    )
    .optional(),
  description: z.string().max(1000).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ============================================================================
// GET /api/admin/fund-categories/[id]
// ============================================================================

/**
 * Ruft einen einzelnen Gesellschaftstyp anhand der ID ab
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check: Nur Admins duerfen zugreifen
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // ID aus URL-Parametern extrahieren
    const { id } = await params;

    // Gesellschaftstyp abrufen mit Tenant-Filter
    const fundCategory = await prisma.fundCategory.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        _count: {
          select: { funds: true },
        },
      },
    });

    // Nicht gefunden?
    if (!fundCategory) {
      return NextResponse.json(
        { error: "Gesellschaftstyp nicht gefunden" },
        { status: 404 }
      );
    }

    // Response mit transformierten Daten
    return NextResponse.json({
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
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fund category");
    return NextResponse.json(
      { error: "Fehler beim Laden des Gesellschaftstyps" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/admin/fund-categories/[id]
// ============================================================================

/**
 * Aktualisiert einen Gesellschaftstyp
 *
 * Validierung:
 * - Bei Code-Aenderung: Neuer Code muss eindeutig sein
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check: Nur Admins duerfen zugreifen
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // ID aus URL-Parametern extrahieren
    const { id } = await params;

    // Request-Body parsen und validieren
    const body = await request.json();
    const validatedData = updateFundCategorySchema.parse(body);

    // Pruefen ob Gesellschaftstyp existiert
    const existingCategory = await prisma.fundCategory.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingCategory) {
      return NextResponse.json(
        { error: "Gesellschaftstyp nicht gefunden" },
        { status: 404 }
      );
    }

    // Bei Code-Aenderung: Pruefen ob neuer Code bereits existiert
    if (validatedData.code && validatedData.code !== existingCategory.code) {
      const codeExists = await prisma.fundCategory.findFirst({
        where: {
          code: validatedData.code,
          tenantId: check.tenantId!,
          NOT: { id }, // Eigene ID ausschliessen
        },
      });

      if (codeExists) {
        return NextResponse.json(
          { error: `Ein Gesellschaftstyp mit dem Code "${validatedData.code}" existiert bereits` },
          { status: 409 } // Conflict
        );
      }
    }

    // Update-Daten vorbereiten (nur gesetzte Felder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (validatedData.name !== undefined) {
      updateData.name = validatedData.name;
    }
    if (validatedData.code !== undefined) {
      updateData.code = validatedData.code;
    }
    if (validatedData.description !== undefined) {
      updateData.description = validatedData.description;
    }
    if (validatedData.color !== undefined) {
      updateData.color = validatedData.color;
    }
    if (validatedData.isActive !== undefined) {
      updateData.isActive = validatedData.isActive;
    }
    if (validatedData.sortOrder !== undefined) {
      updateData.sortOrder = validatedData.sortOrder;
    }

    // Gesellschaftstyp aktualisieren
    const updatedCategory = await prisma.fundCategory.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { funds: true },
        },
      },
    });

    // Response mit aktualisierten Daten
    return NextResponse.json({
      id: updatedCategory.id,
      name: updatedCategory.name,
      code: updatedCategory.code,
      description: updatedCategory.description,
      color: updatedCategory.color,
      isActive: updatedCategory.isActive,
      sortOrder: updatedCategory.sortOrder,
      fundsCount: updatedCategory._count.funds,
      createdAt: updatedCategory.createdAt.toISOString(),
      updatedAt: updatedCategory.updatedAt.toISOString(),
    });
  } catch (error) {
    // Zod Validation Error
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }

    logger.error({ err: error }, "Error updating fund category");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Gesellschaftstyps" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/admin/fund-categories/[id]
// ============================================================================

/**
 * Loescht einen Gesellschaftstyp
 *
 * Validierung:
 * - Nur moeglich wenn keine Gesellschaften diesem Typ zugeordnet sind
 * - Gibt 409 Conflict zurueck mit Anzahl der zugeordneten Gesellschaften
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth-Check: Nur Admins duerfen zugreifen
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // ID aus URL-Parametern extrahieren
    const { id } = await params;

    // Pruefen ob Gesellschaftstyp existiert
    const existingCategory = await prisma.fundCategory.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingCategory) {
      return NextResponse.json(
        { error: "Gesellschaftstyp nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefen ob Gesellschaften diesem Typ zugeordnet sind
    const fundsCount = await prisma.fund.count({
      where: { fundCategoryId: id },
    });

    if (fundsCount > 0) {
      return NextResponse.json(
        {
          error: `Kann nicht geloescht werden: ${fundsCount} ${
            fundsCount === 1 ? "Gesellschaft ist" : "Gesellschaften sind"
          } diesem Typ zugeordnet`,
        },
        { status: 409 } // Conflict
      );
    }

    // Gesellschaftstyp loeschen
    await prisma.fundCategory.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Gesellschaftstyp erfolgreich geloescht",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting fund category");
    return NextResponse.json(
      { error: "Fehler beim Loeschen des Gesellschaftstyps" },
      { status: 500 }
    );
  }
}
