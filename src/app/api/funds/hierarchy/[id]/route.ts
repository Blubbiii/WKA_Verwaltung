import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";
import { logDeletion, createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

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
      return apiError("NOT_FOUND", undefined, { message: "Fund-Hierarchie nicht gefunden" });
    }

    // Multi-Tenancy Prüfung über Parent Fund -> Tenant
    if (hierarchy.parentFund.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Fund-Hierarchie" });
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
      return apiError("NOT_FOUND", undefined, { message: "Fund-Hierarchie nicht gefunden" });
    }

    // Multi-Tenancy Prüfung
    if (existing.parentFund.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
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
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Datumsangabe", details: "Das Startdatum (validFrom) muss vor dem Enddatum (validTo) liegen" });
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
        return apiError("BAD_REQUEST", undefined, { message: "Anteil übersteigt 100%", details: `Andere Gesellschafter: ${othersTotal.toFixed(2)}%. ` +
              `Mit neuem Anteil (${validatedData.ownershipPercentage}%) waeren es ${(othersTotal + validatedData.ownershipPercentage).toFixed(2)}%` });
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

    // Audit-Log (deferred: runs after response is sent)
    const oldValuesSnapshot = oldValues;
    const newValuesSnapshot = {
      ownershipPercentage: Number(hierarchy.ownershipPercentage),
      validFrom: hierarchy.validFrom.toISOString(),
      validTo: hierarchy.validTo?.toISOString() || null,
      notes: hierarchy.notes,
    };
    after(async () => {
      await createAuditLog({
        action: "UPDATE",
        entityType: "FundHierarchy",
        entityId: id,
        oldValues: oldValuesSnapshot,
        newValues: newValuesSnapshot,
      });
    });

    return NextResponse.json(hierarchy);
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Fund-Hierarchie");
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
    const hierarchy = await getUserHighestHierarchy(check.userId!);
    if (hierarchy < 60) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung zum Löschen von Fund-Hierarchien" });
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
      return apiError("NOT_FOUND", undefined, { message: "Fund-Hierarchie nicht gefunden" });
    }

    // Multi-Tenancy Prüfung
    if (existing.parentFund.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    // Löschen
    await prisma.fundHierarchy.delete({ where: { id } });

    // Audit Log (deferred: runs after response is sent)
    const deletionData = {
      parentFund: existing.parentFund.name,
      childFund: existing.childFund.name,
      ownershipPercentage: Number(existing.ownershipPercentage),
      validFrom: existing.validFrom.toISOString(),
      validTo: existing.validTo?.toISOString() || null,
    };
    after(async () => {
      await logDeletion("FundHierarchy", id, deletionData);
    });

    return NextResponse.json({
      success: true,
      message: `Fund-Hierarchie "${existing.childFund.name}" -> "${existing.parentFund.name}" gelöscht`,
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting fund hierarchy");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Fund-Hierarchie" });
  }
}
