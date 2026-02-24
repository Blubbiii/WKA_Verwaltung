import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema für neue TurbineOperator-Einträge
 * Validiert die Betreiber-Zuordnung einer WKA zu einem Fund
 */
const turbineOperatorCreateSchema = z.object({
  turbineId: z.string().uuid("Ungültige Turbinen-ID"),
  operatorFundId: z.string().uuid("Ungültige Betreiber-Fund-ID"),
  ownershipPercentage: z
    .number()
    .min(0, "Anteil muss >= 0% sein")
    .max(100, "Anteil darf nicht > 100% sein")
    .default(100),
  validFrom: z.string().datetime({ message: "Ungültiges Datum (ISO 8601 Format erwartet)" }),
  validTo: z
    .string()
    .datetime({ message: "Ungültiges Datum (ISO 8601 Format erwartet)" })
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

type TurbineOperatorCreateInput = z.infer<typeof turbineOperatorCreateSchema>;

// =============================================================================
// GET /api/energy/turbine-operators - Alle Betreiber-Zuordnungen mit Filtern
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    // URL-Parameter extrahieren
    const { searchParams } = new URL(request.url);

    // Filter-Parameter
    const turbineId = searchParams.get("turbineId");
    const operatorFundId = searchParams.get("operatorFundId");
    const parkId = searchParams.get("parkId");
    const status = searchParams.get("status"); // ACTIVE oder HISTORICAL

    // Paginierung
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Where-Clause aufbauen
    // Multi-Tenancy: Filter über Turbine -> Park -> Tenant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {
      turbine: {
        park: {
          tenantId: check.tenantId!,
        },
      },
    };

    // Optionale Filter
    if (turbineId) {
      where.turbineId = turbineId;
    }

    if (operatorFundId) {
      where.operatorFundId = operatorFundId;
    }

    if (parkId) {
      where.turbine = {
        ...((where.turbine as object) || {}),
        parkId: parkId,
      };
    }

    // Status-Filter: ACTIVE = validTo ist null, HISTORICAL = validTo ist nicht null
    if (status === "ACTIVE") {
      where.status = "ACTIVE";
      where.validTo = null;
    } else if (status === "HISTORICAL") {
      where.status = "HISTORICAL";
    }

    // Parallele Abfragen: Daten + Gesamtanzahl
    const [operators, total] = await Promise.all([
      prisma.turbineOperator.findMany({
        where,
        include: {
          turbine: {
            select: {
              id: true,
              designation: true,
              serialNumber: true,
              ratedPowerKw: true,
              park: {
                select: {
                  id: true,
                  name: true,
                  shortName: true,
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
            },
          },
        },
        orderBy: [
          { turbine: { designation: "asc" } },
          { validFrom: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.turbineOperator.count({ where }),
    ]);

    return NextResponse.json({
      data: operators,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching turbine operators");
    return NextResponse.json(
      { error: "Fehler beim Laden der Betreiber-Zuordnungen" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/energy/turbine-operators - Neue Betreiber-Zuordnung erstellen
// Bei Betreiberwechsel: Alten Operator auf HISTORICAL setzen
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData: TurbineOperatorCreateInput = turbineOperatorCreateSchema.parse(body);

    // Validierung: Turbine existiert und gehoert zum Tenant
    const turbine = await prisma.turbine.findFirst({
      where: {
        id: validatedData.turbineId,
        park: {
          tenantId: check.tenantId!,
        },
      },
      select: {
        id: true,
        designation: true,
        park: { select: { id: true, name: true } },
      },
    });

    if (!turbine) {
      return NextResponse.json(
        { error: "Turbine nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Validierung: Operator Fund existiert und gehoert zum Tenant
    const operatorFund = await prisma.fund.findFirst({
      where: {
        id: validatedData.operatorFundId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        fundCategory: { select: { id: true, name: true, code: true, color: true } },
      },
    });

    if (!operatorFund) {
      return NextResponse.json(
        { error: "Betreiber-Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    // Prüfung: Gibt es bereits einen AKTIVEN Betreiber für diese WKA?
    const existingActiveOperator = await prisma.turbineOperator.findFirst({
      where: {
        turbineId: validatedData.turbineId,
        status: "ACTIVE",
        validTo: null,
      },
      select: {
        id: true,
        operatorFund: {
          select: { name: true },
        },
        validFrom: true,
      },
    });

    // Validierung: validFrom darf nicht vor dem validFrom des aktuellen Operators liegen
    if (existingActiveOperator) {
      const newValidFrom = new Date(validatedData.validFrom);
      const existingValidFrom = new Date(existingActiveOperator.validFrom);

      if (newValidFrom < existingValidFrom) {
        return NextResponse.json(
          {
            error: "Ungültige Datumsangabe",
            details: `Das Startdatum (${newValidFrom.toISOString().split("T")[0]}) darf nicht vor dem Startdatum des aktuellen Betreibers (${existingValidFrom.toISOString().split("T")[0]}) liegen`,
          },
          { status: 400 }
        );
      }
    }

    // Transaction: Alten Operator auf HISTORICAL setzen + neuen erstellen
    const result = await prisma.$transaction(async (tx) => {
      // Wenn es einen aktiven Operator gibt: auf HISTORICAL setzen
      if (existingActiveOperator) {
        const validFrom = new Date(validatedData.validFrom);
        // validTo des alten Operators = validFrom des neuen Operators (minus 1 Tag für saubere Abgrenzung)
        const validTo = new Date(validFrom);
        validTo.setDate(validTo.getDate() - 1);

        await tx.turbineOperator.update({
          where: { id: existingActiveOperator.id },
          data: {
            status: "HISTORICAL",
            validTo: validTo,
          },
        });
      }

      // Neuen Operator erstellen
      const newOperator = await tx.turbineOperator.create({
        data: {
          turbineId: validatedData.turbineId,
          operatorFundId: validatedData.operatorFundId,
          ownershipPercentage: validatedData.ownershipPercentage,
          validFrom: new Date(validatedData.validFrom),
          validTo: validatedData.validTo ? new Date(validatedData.validTo) : null,
          status: validatedData.validTo ? "HISTORICAL" : "ACTIVE",
          notes: validatedData.notes ?? null,
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

      return {
        newOperator,
        previousOperator: existingActiveOperator
          ? {
              id: existingActiveOperator.id,
              fundName: existingActiveOperator.operatorFund.name,
            }
          : null,
      };
    });

    // Audit-Log für Betreiberwechsel
    if (result.previousOperator) {
      await createAuditLog({
        action: "UPDATE",
        entityType: "TurbineOperator",
        entityId: result.newOperator.id,
        oldValues: {
          operatorFundName: result.previousOperator.fundName,
          operatorId: result.previousOperator.id,
        },
        newValues: {
          operatorFundName: result.newOperator.operatorFund.name,
          turbineDesignation: result.newOperator.turbine.designation,
          validFrom: result.newOperator.validFrom.toISOString(),
        },
        description: `Betreiberwechsel: ${turbine.designation} von "${result.previousOperator.fundName}" zu "${result.newOperator.operatorFund.name}"`,
      });
    }

    return NextResponse.json(
      {
        ...result.newOperator,
        _operatorChange: result.previousOperator
          ? {
              previousOperator: result.previousOperator.fundName,
              message: `Betreiberwechsel durchgeführt. Vorheriger Betreiber "${result.previousOperator.fundName}" wurde auf HISTORICAL gesetzt.`,
            }
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating turbine operator");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Betreiber-Zuordnung" },
      { status: 500 }
    );
  }
}
