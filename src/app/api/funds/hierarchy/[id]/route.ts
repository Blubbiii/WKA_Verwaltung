import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { logDeletion, createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema für Aktualisierung von FundHierarchy-Einträgen
 * Parent/Child Fund sind NICHT aenderbar - dafür neuen Eintrag anlegen
 */
const fundHierarchyUpdateSchema = z.object({
  ownershipPercentage: z
    .number()
    .min(0, "Anteil muss >= 0% sein")
    .max(100, "Anteil darf nicht > 100% sein")
    .optional(),
  validFrom: z
    .string()
    .datetime({ message: "Ungültiges Datum (ISO 8601 Format erwartet)" })
    .optional(),
  validTo: z
    .string()
    .datetime({ message: "Ungültiges Datum (ISO 8601 Format erwartet)" })
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// =============================================================================
// GET /api/funds/hierarchy/[id] - Einzelne Fund-Hierarchie abrufen
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Berechtigungsprüfung
    const check = await requirePermission(["funds:read"]);
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Fund-Hierarchie mit allen Relationen laden
    const hierarchy = await prisma.fundHierarchy.findUnique({
      where: { id },
      include: {
        parentFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            fundCategory: { select: { id: true, name: true, code: true, color: true } },
            registrationNumber: true,
            managingDirector: true,
            street: true,
            houseNumber: true,
            postalCode: true,
            city: true,
            tenantId: true,
            status: true,
            // Lade auch andere Hierarchien wo dieser Fund Parent ist
            childHierarchies: {
              where: { validTo: null },
              select: {
                id: true,
                ownershipPercentage: true,
                childFund: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        childFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            fundCategory: { select: { id: true, name: true, code: true, color: true } },
            registrationNumber: true,
            managingDirector: true,
            street: true,
            houseNumber: true,
            postalCode: true,
            city: true,
            status: true,
            // Lade auch andere Hierarchien wo dieser Fund Child ist
            parentHierarchies: {
              where: { validTo: null },
              select: {
                id: true,
                ownershipPercentage: true,
                parentFund: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!hierarchy) {
      return NextResponse.json(
        { error: "Fund-Hierarchie nicht gefunden" },
        { status: 404 }
      );
    }

    // Multi-Tenancy Prüfung über Parent Fund -> Tenant
    if (hierarchy.parentFund.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Lade auch historische Einträge für diese Beziehung
    const historyEntries = await prisma.fundHierarchy.findMany({
      where: {
        parentFundId: hierarchy.parentFundId,
        childFundId: hierarchy.childFundId,
        id: { not: id }, // Aktuellen Eintrag ausschliessen
      },
      select: {
        id: true,
        ownershipPercentage: true,
        validFrom: true,
        validTo: true,
        notes: true,
      },
      orderBy: { validFrom: "desc" },
    });

    return NextResponse.json({
      ...hierarchy,
      parentFund: {
        ...hierarchy.parentFund,
        tenantId: undefined, // Tenant-ID nicht nach aussen geben
      },
      _history: historyEntries,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fund hierarchy");
    return NextResponse.json(
      { error: "Fehler beim Laden der Fund-Hierarchie" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/funds/hierarchy/[id] - Fund-Hierarchie aktualisieren
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Berechtigungsprüfung: MANAGER+ für Funds-Modul
    const check = await requirePermission(["funds:update"]);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = fundHierarchyUpdateSchema.parse(body);

    // Existenz und Tenant prüfen
    const existing = await prisma.fundHierarchy.findUnique({
      where: { id },
      include: {
        parentFund: {
          select: {
            name: true,
            tenantId: true,
          },
        },
        childFund: {
          select: { name: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Fund-Hierarchie nicht gefunden" },
        { status: 404 }
      );
    }

    // Multi-Tenancy Prüfung
    if (existing.parentFund.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Validierung: validFrom darf nicht nach validTo liegen
    const newValidFrom = validatedData.validFrom
      ? new Date(validatedData.validFrom)
      : existing.validFrom;
    const newValidTo = validatedData.validTo !== undefined
      ? validatedData.validTo
        ? new Date(validatedData.validTo)
        : null
      : existing.validTo;

    if (newValidTo && newValidFrom >= newValidTo) {
      return NextResponse.json(
        {
          error: "Ungültige Datumsangabe",
          details: "Das Startdatum (validFrom) muss vor dem Enddatum (validTo) liegen",
        },
        { status: 400 }
      );
    }

    // Prüfung: Gesamtanteil am Parent Fund darf nicht > 100% sein (bei Änderung des Anteils)
    if (validatedData.ownershipPercentage !== undefined) {
      const otherHierarchies = await prisma.fundHierarchy.findMany({
        where: {
          parentFundId: existing.parentFundId,
          validTo: null,
          id: { not: id }, // Aktuellen Eintrag ausschliessen
        },
        select: { ownershipPercentage: true },
      });

      const othersTotal = otherHierarchies.reduce(
        (sum, h) => sum + Number(h.ownershipPercentage),
        0
      );

      if (othersTotal + validatedData.ownershipPercentage > 100) {
        return NextResponse.json(
          {
            error: "Anteil übersteigt 100%",
            details: `Andere Gesellschafter: ${othersTotal.toFixed(2)}%. ` +
              `Mit neuem Anteil (${validatedData.ownershipPercentage}%) waeren es ${(othersTotal + validatedData.ownershipPercentage).toFixed(2)}%`,
          },
          { status: 400 }
        );
      }
    }

    // Alte Werte für Audit-Log speichern
    const oldValues = {
      ownershipPercentage: Number(existing.ownershipPercentage),
      validFrom: existing.validFrom.toISOString(),
      validTo: existing.validTo?.toISOString() || null,
      notes: existing.notes,
    };

    // Update durchfuehren
    const hierarchy = await prisma.fundHierarchy.update({
      where: { id },
      data: {
        ...(validatedData.ownershipPercentage !== undefined && {
          ownershipPercentage: validatedData.ownershipPercentage,
        }),
        ...(validatedData.validFrom !== undefined && {
          validFrom: new Date(validatedData.validFrom),
        }),
        ...(validatedData.validTo !== undefined && {
          validTo: validatedData.validTo ? new Date(validatedData.validTo) : null,
        }),
        ...(validatedData.notes !== undefined && {
          notes: validatedData.notes,
        }),
      },
      include: {
        parentFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            fundCategory: { select: { id: true, name: true, code: true, color: true } },
          },
        },
        childFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            fundCategory: { select: { id: true, name: true, code: true, color: true } },
          },
        },
      },
    });

    // Audit-Log
    await createAuditLog({
      action: "UPDATE",
      entityType: "FundHierarchy",
      entityId: id,
      oldValues,
      newValues: {
        ownershipPercentage: Number(hierarchy.ownershipPercentage),
        validFrom: hierarchy.validFrom.toISOString(),
        validTo: hierarchy.validTo?.toISOString() || null,
        notes: hierarchy.notes,
      },
    });

    return NextResponse.json(hierarchy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating fund hierarchy");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Fund-Hierarchie" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/funds/hierarchy/[id] - Fund-Hierarchie löschen
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Berechtigungsprüfung: MANAGER+ für Funds-Modul
    const check = await requirePermission(["funds:delete"]);
    if (!check.authorized) return check.error;

    // Zusätzliche Prüfung: Nur MANAGER, ADMIN oder SUPERADMIN duerfen löschen
    const user = await prisma.user.findUnique({
      where: { id: check.userId! },
      select: { role: true },
    });

    if (!user || !["MANAGER", "ADMIN", "SUPERADMIN"].includes(user.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung zum Löschen von Fund-Hierarchien" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Existenz und Tenant prüfen
    const existing = await prisma.fundHierarchy.findUnique({
      where: { id },
      include: {
        parentFund: {
          select: {
            name: true,
            tenantId: true,
          },
        },
        childFund: {
          select: { name: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Fund-Hierarchie nicht gefunden" },
        { status: 404 }
      );
    }

    // Multi-Tenancy Prüfung
    if (existing.parentFund.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Löschen
    await prisma.fundHierarchy.delete({ where: { id } });

    // Audit Log
    await logDeletion("FundHierarchy", id, {
      parentFund: existing.parentFund.name,
      childFund: existing.childFund.name,
      ownershipPercentage: Number(existing.ownershipPercentage),
      validFrom: existing.validFrom.toISOString(),
      validTo: existing.validTo?.toISOString() || null,
    });

    return NextResponse.json({
      success: true,
      message: `Fund-Hierarchie "${existing.childFund.name}" -> "${existing.parentFund.name}" gelöscht`,
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting fund hierarchy");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Fund-Hierarchie" },
      { status: 500 }
    );
  }
}
