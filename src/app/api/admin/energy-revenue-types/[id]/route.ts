/**
 * API Route: /api/admin/energy-revenue-types/[id]
 * GET: Einzelne Vergütungsart abrufen
 * PATCH: Vergütungsart aktualisieren
 * DELETE: Vergütungsart löschen (Hard-Delete oder Soft-Delete via isActive)
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
 * Schema für das Aktualisieren einer Vergütungsart
 * Alle Felder sind optional (Partial Update)
 */
const updateEnergyRevenueTypeSchema = z.object({
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
  calculationType: z.enum(["FIXED_RATE", "MARKET_PRICE", "MANUAL"]).optional(),
  hasTax: z.boolean().optional(),
  taxRate: z.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ============================================================================
// GET /api/admin/energy-revenue-types/[id]
// ============================================================================

/**
 * Ruft eine einzelne Vergütungsart anhand der ID ab
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

    // Vergütungsart abrufen mit Tenant-Filter
    const energyRevenueType = await prisma.energyRevenueType.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    // Nicht gefunden?
    if (!energyRevenueType) {
      return NextResponse.json(
        { error: "Vergütungsart nicht gefunden" },
        { status: 404 }
      );
    }

    // Response mit transformierten Daten
    return NextResponse.json({
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
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching energy revenue type");
    return NextResponse.json(
      { error: "Fehler beim Laden der Vergütungsart" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/admin/energy-revenue-types/[id]
// ============================================================================

/**
 * Aktualisiert eine Vergütungsart
 *
 * Validierung:
 * - Bei Code-Änderung: Neuer Code muss eindeutig sein
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
    const validatedData = updateEnergyRevenueTypeSchema.parse(body);

    // Prüfen ob Vergütungsart existiert
    const existingType = await prisma.energyRevenueType.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingType) {
      return NextResponse.json(
        { error: "Vergütungsart nicht gefunden" },
        { status: 404 }
      );
    }

    // Bei Code-Änderung: Prüfen ob neuer Code bereits existiert
    if (validatedData.code && validatedData.code !== existingType.code) {
      const codeExists = await prisma.energyRevenueType.findFirst({
        where: {
          code: validatedData.code,
          tenantId: check.tenantId!,
          NOT: { id }, // Eigene ID ausschliessen
        },
      });

      if (codeExists) {
        return NextResponse.json(
          { error: `Eine Vergütungsart mit dem Code "${validatedData.code}" existiert bereits` },
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
    if (validatedData.calculationType !== undefined) {
      updateData.calculationType = validatedData.calculationType;
    }
    if (validatedData.hasTax !== undefined) {
      updateData.hasTax = validatedData.hasTax;
    }
    if (validatedData.taxRate !== undefined) {
      updateData.taxRate = validatedData.taxRate;
    }
    if (validatedData.isActive !== undefined) {
      updateData.isActive = validatedData.isActive;
    }
    if (validatedData.sortOrder !== undefined) {
      updateData.sortOrder = validatedData.sortOrder;
    }

    // Vergütungsart aktualisieren
    const updatedType = await prisma.energyRevenueType.update({
      where: { id },
      data: updateData,
    });

    // Response mit aktualisierten Daten
    return NextResponse.json({
      id: updatedType.id,
      name: updatedType.name,
      code: updatedType.code,
      description: updatedType.description,
      calculationType: updatedType.calculationType,
      hasTax: updatedType.hasTax,
      taxRate: updatedType.taxRate ? Number(updatedType.taxRate) : null,
      isActive: updatedType.isActive,
      sortOrder: updatedType.sortOrder,
      createdAt: updatedType.createdAt.toISOString(),
      updatedAt: updatedType.updatedAt.toISOString(),
    });
  } catch (error) {
    // Zod Validation Error
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }

    logger.error({ err: error }, "Error updating energy revenue type");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Vergütungsart" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/admin/energy-revenue-types/[id]
// ============================================================================

/**
 * Loescht eine Vergütungsart
 *
 * Standardverhalten: Soft-Delete (setzt isActive auf false)
 * Mit Query-Parameter ?hard=true: Permanentes Löschen
 *
 * ACHTUNG: Hard-Delete nur moeglich wenn keine Referenzen existieren!
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

    // Query-Parameter für Hard-Delete prüfen
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get("hard") === "true";

    // Prüfen ob Vergütungsart existiert
    const existingType = await prisma.energyRevenueType.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingType) {
      return NextResponse.json(
        { error: "Vergütungsart nicht gefunden" },
        { status: 404 }
      );
    }

    if (hardDelete) {
      // Hard-Delete: Permanent löschen
      // Hinweis: Falls Referenzen existieren (z.B. in Rechnungen),
      // wird Prisma einen Fehler werfen
      try {
        await prisma.energyRevenueType.delete({
          where: { id },
        });

        return NextResponse.json({
          success: true,
          message: "Vergütungsart permanent gelöscht",
        });
      } catch (deleteError: unknown) {
        // Foreign Key Constraint Violation
        if (
          deleteError &&
          typeof deleteError === "object" &&
          "code" in deleteError &&
          deleteError.code === "P2003"
        ) {
          return NextResponse.json(
            {
              error:
                "Vergütungsart kann nicht gelöscht werden, da sie noch in Verwendung ist. Nutzen Sie stattdessen die Deaktivierung.",
            },
            { status: 409 }
          );
        }
        throw deleteError;
      }
    } else {
      // Soft-Delete: Nur deaktivieren
      await prisma.energyRevenueType.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({
        success: true,
        message: "Vergütungsart deaktiviert",
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Error deleting energy revenue type");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Vergütungsart" },
      { status: 500 }
    );
  }
}
