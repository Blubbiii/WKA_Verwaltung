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
 * Schema für Aktualisierung von TurbineOperator-Einträgen
 * Turbine und Fund sind NICHT aenderbar - dafür neuen Operator anlegen
 */
const turbineOperatorUpdateSchema = z.object({
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
  status: z.enum(["ACTIVE", "HISTORICAL"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// =============================================================================
// GET /api/energy/turbine-operators/[id] - Einzelne Betreiber-Zuordnung abrufen
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Betreiber-Zuordnung mit allen Relationen laden
    const operator = await prisma.turbineOperator.findUnique({
      where: { id },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            serialNumber: true,
            manufacturer: true,
            model: true,
            ratedPowerKw: true,
            commissioningDate: true,
            park: {
              select: {
                id: true,
                name: true,
                shortName: true,
                tenantId: true,
              },
            },
          },
        },
        operatorFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            fundCategory: { select: { id: true, name: true, code: true, color: true } },
            registrationNumber: true,
            managingDirector: true,
            address: true,
          },
        },
      },
    });

    if (!operator) {
      return NextResponse.json(
        { error: "Betreiber-Zuordnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Multi-Tenancy Prüfung über Turbine -> Park -> Tenant
    if (operator.turbine.park.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Lade auch die Historie für diese Turbine (andere Operatoren)
    const operatorHistory = await prisma.turbineOperator.findMany({
      where: {
        turbineId: operator.turbineId,
        id: { not: id }, // Aktuellen Operator ausschliessen
      },
      select: {
        id: true,
        status: true,
        validFrom: true,
        validTo: true,
        ownershipPercentage: true,
        operatorFund: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { validFrom: "desc" },
    });

    return NextResponse.json({
      ...operator,
      turbine: {
        ...operator.turbine,
        park: {
          id: operator.turbine.park.id,
          name: operator.turbine.park.name,
          shortName: operator.turbine.park.shortName,
        },
      },
      _history: operatorHistory,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching turbine operator");
    return NextResponse.json(
      { error: "Fehler beim Laden der Betreiber-Zuordnung" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/energy/turbine-operators/[id] - Betreiber-Zuordnung aktualisieren
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validatedData = turbineOperatorUpdateSchema.parse(body);

    // Existenz und Tenant prüfen
    const existing = await prisma.turbineOperator.findUnique({
      where: { id },
      include: {
        turbine: {
          select: {
            designation: true,
            park: {
              select: { tenantId: true },
            },
          },
        },
        operatorFund: {
          select: { name: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Betreiber-Zuordnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Multi-Tenancy Prüfung
    if (existing.turbine.park.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Validierung: Wenn Status auf HISTORICAL gesetzt wird, muss validTo gesetzt sein
    const newStatus = validatedData.status || existing.status;
    const newValidTo = validatedData.validTo !== undefined
      ? validatedData.validTo
      : existing.validTo?.toISOString() || null;

    if (newStatus === "HISTORICAL" && !newValidTo) {
      return NextResponse.json(
        {
          error: "Ungültiger Status",
          details: "Bei Status 'HISTORICAL' muss ein Enddatum (validTo) angegeben werden",
        },
        { status: 400 }
      );
    }

    // Validierung: validFrom darf nicht nach validTo liegen
    const newValidFrom = validatedData.validFrom
      ? new Date(validatedData.validFrom)
      : existing.validFrom;

    if (newValidTo && newValidFrom >= new Date(newValidTo)) {
      return NextResponse.json(
        {
          error: "Ungültige Datumsangabe",
          details: "Das Startdatum (validFrom) muss vor dem Enddatum (validTo) liegen",
        },
        { status: 400 }
      );
    }

    // Alte Werte für Audit-Log speichern
    const oldValues = {
      ownershipPercentage: Number(existing.ownershipPercentage),
      validFrom: existing.validFrom.toISOString(),
      validTo: existing.validTo?.toISOString() || null,
      status: existing.status,
      notes: existing.notes,
    };

    // Update durchfuehren
    const operator = await prisma.turbineOperator.update({
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
        ...(validatedData.status !== undefined && {
          status: validatedData.status,
        }),
        ...(validatedData.notes !== undefined && {
          notes: validatedData.notes,
        }),
      },
      include: {
        turbine: {
          select: {
            id: true,
            designation: true,
            park: {
              select: { id: true, name: true },
            },
          },
        },
        operatorFund: {
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
      entityType: "TurbineOperator",
      entityId: id,
      oldValues,
      newValues: {
        ownershipPercentage: Number(operator.ownershipPercentage),
        validFrom: operator.validFrom.toISOString(),
        validTo: operator.validTo?.toISOString() || null,
        status: operator.status,
        notes: operator.notes,
      },
    });

    return NextResponse.json(operator);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating turbine operator");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Betreiber-Zuordnung" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/energy/turbine-operators/[id] - Betreiber-Zuordnung löschen
// ACHTUNG: Nur HISTORICAL-Einträge können gelöscht werden!
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:delete");
    if (!check.authorized) return check.error;

    // Zusätzliche Prüfung: Nur MANAGER, ADMIN oder SUPERADMIN duerfen löschen
    const user = await prisma.user.findUnique({
      where: { id: check.userId! },
      select: { role: true },
    });

    if (!user || !["MANAGER", "ADMIN", "SUPERADMIN"].includes(user.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung zum Löschen von Betreiber-Zuordnungen" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Existenz und Tenant prüfen
    const existing = await prisma.turbineOperator.findUnique({
      where: { id },
      include: {
        turbine: {
          select: {
            designation: true,
            park: {
              select: { tenantId: true, name: true },
            },
          },
        },
        operatorFund: {
          select: { name: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Betreiber-Zuordnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Multi-Tenancy Prüfung
    if (existing.turbine.park.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // WICHTIG: Aktive Betreiber-Zuordnungen können nicht gelöscht werden!
    // Stattdessen muss ein Betreiberwechsel durchgeführt werden (POST mit neuem Operator)
    if (existing.status === "ACTIVE") {
      return NextResponse.json(
        {
          error: "Aktive Betreiber-Zuordnungen können nicht gelöscht werden",
          details:
            "Um den Betreiber zu aendern, erstellen Sie einen neuen Operator-Eintrag. " +
            "Der aktuelle Eintrag wird dann automatisch auf HISTORICAL gesetzt.",
        },
        { status: 400 }
      );
    }

    // Löschen
    await prisma.turbineOperator.delete({ where: { id } });

    // Audit Log
    await logDeletion("TurbineOperator", id, {
      turbine: existing.turbine.designation,
      park: existing.turbine.park.name,
      operatorFund: existing.operatorFund.name,
      validFrom: existing.validFrom.toISOString(),
      validTo: existing.validTo?.toISOString() || null,
      ownershipPercentage: Number(existing.ownershipPercentage),
    });

    return NextResponse.json({
      success: true,
      message: `Betreiber-Zuordnung "${existing.operatorFund.name}" für Turbine "${existing.turbine.designation}" gelöscht`,
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting turbine operator");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Betreiber-Zuordnung" },
      { status: 500 }
    );
  }
}
