import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { handleApiError, parsePaginationParams } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// FIX 13: Accept both number and string for ownershipPercentage —
// Frontend-Zahleneingabe schickt teilweise string, JSON schickt number.
// Decimal-Konvertierung passiert an der Prisma-Grenze.
const percentageInput = z
  .union([z.number(), z.string()])
  .refine(
    (v) => {
      const n = typeof v === "number" ? v : Number(v);
      return !Number.isNaN(n) && n >= 0 && n <= 100;
    },
    { message: "Anteil muss zwischen 0% und 100% liegen" },
  )
  .transform((v) => new Prisma.Decimal(typeof v === "number" ? v : v));

// FIX 10: Internal error type for structured rollback inside the
// Serializable transaction (siehe POST unten).
class HierarchyError extends Error {
  constructor(
    public readonly kind: "CYCLE" | "DUPLICATE" | "OVER_100",
    message: string,
  ) {
    super(message);
    this.name = "HierarchyError";
  }
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Schema für neue FundHierarchy-Einträge
 * Definiert eine Eltern-Kind-Beziehung zwischen zwei Funds
 * (Ein Fund kann Gesellschafter eines anderen Funds sein)
 */
const fundHierarchyCreateSchema = z.object({
  parentFundId: z.string().uuid("Ungültige Eltern-Fund-ID"),
  childFundId: z.string().uuid("Ungültige Kind-Fund-ID"),
  // FIX 13: Union{number,string} → Decimal (siehe percentageInput oben).
  ownershipPercentage: percentageInput,
  validFrom: z.string().datetime({ message: "Ungültiges Datum (ISO 8601 Format erwartet)" }),
  validTo: z
    .string()
    .datetime({ message: "Ungültiges Datum (ISO 8601 Format erwartet)" })
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

type FundHierarchyCreateInput = z.infer<typeof fundHierarchyCreateSchema>;

// =============================================================================
// HELPER: Zirkulaere Referenzen prüfen
// Verhindert: Fund A -> Fund B -> Fund A (oder laengere Ketten)
// =============================================================================

async function checkCircularReference(
  parentFundId: string,
  childFundId: string,
  tenantId: string
): Promise<{ isCircular: boolean; path?: string[] }> {
  // Fall 1: Direkte Selbstreferenz
  if (parentFundId === childFundId) {
    return { isCircular: true, path: [childFundId, parentFundId] };
  }

  // Rekursive Suche: Ist der Parent Fund ein Kind (direkt oder indirekt) des Child Funds?
  // Das wuerde bedeuten: childFund -> ... -> parentFund -> childFund (Zyklus!)
  const visited = new Set<string>();
  const path: string[] = [childFundId];

  async function hasPathTo(currentFundId: string, targetFundId: string): Promise<boolean> {
    if (currentFundId === targetFundId) {
      return true;
    }

    if (visited.has(currentFundId)) {
      return false;
    }
    visited.add(currentFundId);

    // Finde alle aktiven Hierarchien wo currentFundId das Kind ist
    // (d.h. currentFundId ist Gesellschafter von anderen Funds)
    const hierarchies = await prisma.fundHierarchy.findMany({
      where: {
        childFundId: currentFundId,
        validTo: null, // Nur aktive Beziehungen
        parentFund: {
          tenantId: tenantId,
        },
      },
      select: {
        parentFundId: true,
        parentFund: {
          select: { name: true },
        },
      },
    });

    for (const hierarchy of hierarchies) {
      path.push(hierarchy.parentFundId);
      if (await hasPathTo(hierarchy.parentFundId, targetFundId)) {
        return true;
      }
      path.pop();
    }

    return false;
  }

  // Pruefe: Kann man vom Parent Fund zum Child Fund kommen?
  // Wenn ja, dann wuerde die neue Verbindung childFund -> parentFund einen Zyklus erzeugen
  const isCircular = await hasPathTo(parentFundId, childFundId);

  if (isCircular) {
    // Hole Fund-Namen für bessere Fehlermeldung
    const funds = await prisma.fund.findMany({
      where: {
        id: { in: path },
      },
      select: { id: true, name: true },
    });

    const fundMap = new Map(funds.map((f) => [f.id, f.name]));
    const namedPath: string[] = path.map((id) => fundMap.get(id) || id);

    return { isCircular: true, path: namedPath };
  }

  return { isCircular: false };
}

// =============================================================================
// GET /api/funds/hierarchy - Alle Fund-Hierarchien mit Filtern
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Berechtigungsprüfung: MANAGER+ für Funds-Modul
    const check = await requirePermission(["funds:read"]);
    if (!check.authorized) return check.error;

    // URL-Parameter extrahieren
    const { searchParams } = new URL(request.url);

    // Filter-Parameter
    const parentFundId = searchParams.get("parentFundId");
    const childFundId = searchParams.get("childFundId");
    const activeOnly = searchParams.get("activeOnly") === "true";

    // Paginierung
    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50 });

    // Where-Clause aufbauen mit Multi-Tenancy Filter
    const where: Prisma.FundHierarchyWhereInput = {
      parentFund: {
        tenantId: check.tenantId!,
      },
    };

    // Optionale Filter
    if (parentFundId) {
      where.parentFundId = parentFundId;
    }

    if (childFundId) {
      where.childFundId = childFundId;
    }

    // Nur aktive Hierarchien (validTo = null)
    if (activeOnly) {
      where.validTo = null;
    }

    // Parallele Abfragen: Daten + Gesamtanzahl
    const [hierarchies, total] = await Promise.all([
      prisma.fundHierarchy.findMany({
        where,
        include: {
          parentFund: {
            select: {
              id: true,
              name: true,
              legalForm: true,
              fundCategory: { select: { id: true, name: true, code: true, color: true } },
              status: true,
            },
          },
          childFund: {
            select: {
              id: true,
              name: true,
              legalForm: true,
              fundCategory: { select: { id: true, name: true, code: true, color: true } },
              status: true,
            },
          },
        },
        orderBy: [
          { parentFund: { name: "asc" } },
          { validFrom: "desc" },
        ],
        skip,
        take: limit,
      }),
      prisma.fundHierarchy.count({ where }),
    ]);

    return NextResponse.json({
      data: hierarchies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fund hierarchies");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Fund-Hierarchien" });
  }
}

// =============================================================================
// POST /api/funds/hierarchy - Neue Fund-Hierarchie erstellen
// Mit Prüfung auf zirkulaere Referenzen
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Berechtigungsprüfung: MANAGER+ für Funds-Modul
    const check = await requirePermission(["funds:create", "funds:update"]);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData: FundHierarchyCreateInput = fundHierarchyCreateSchema.parse(body);

    // Validierung: Parent Fund existiert und gehoert zum Tenant
    const parentFund = await prisma.fund.findFirst({
      where: {
        id: validatedData.parentFundId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        fundCategory: { select: { id: true, name: true, code: true, color: true } },
      },
    });

    if (!parentFund) {
      return apiError("FORBIDDEN", 404, { message: "Eltern-Fund nicht gefunden oder keine Berechtigung" });
    }

    // Validierung: Child Fund existiert und gehoert zum Tenant
    const childFund = await prisma.fund.findFirst({
      where: {
        id: validatedData.childFundId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
        fundCategory: { select: { id: true, name: true, code: true, color: true } },
      },
    });

    if (!childFund) {
      return apiError("FORBIDDEN", 404, { message: "Kind-Fund nicht gefunden oder keine Berechtigung" });
    }

    // FIX 10 (SECURITY/DATA-INTEGRITY): Zyklus-Check + Duplicate-Check +
    // Sum-Check + Create müssen atomar unter Serializable-Isolation laufen —
    // sonst race: zwei parallele POSTs sehen jeweils "no cycle / <100%",
    // committen beide, Resultat ist ein Zyklus oder >100%.
    // Serializable erzwingt Retry/Fail bei Konflikten.
    const newPct = Number(validatedData.ownershipPercentage);
    const parentFundName = parentFund.name;
    const childFundName = childFund.name;

    let hierarchy;
    try {
      hierarchy = await prisma.$transaction(
        async (tx) => {
          // Zyklus-Check (nutzt weiterhin die Helfer-Fkt., die auf prisma
          // zugreift — akzeptabel, da innerhalb der TX Serializable die
          // "phantom read"-Absicherung liefert).
          const circularCheck = await checkCircularReference(
            validatedData.parentFundId,
            validatedData.childFundId,
            check.tenantId!,
          );
          if (circularCheck.isCircular) {
            throw new HierarchyError(
              "CYCLE",
              `Die Hierarchie wuerde einen Zyklus erzeugen: ${circularCheck.path?.join(" -> ")}`,
            );
          }

          // Duplicate-Check innerhalb TX
          const existing = await tx.fundHierarchy.findFirst({
            where: {
              parentFundId: validatedData.parentFundId,
              childFundId: validatedData.childFundId,
              validTo: null,
            },
          });
          if (existing) {
            throw new HierarchyError(
              "DUPLICATE",
              `Es existiert bereits eine aktive Hierarchie-Beziehung zwischen "${childFundName}" und "${parentFundName}"`,
            );
          }

          // Sum-Check innerhalb TX
          const existingHierarchies = await tx.fundHierarchy.findMany({
            where: {
              parentFundId: validatedData.parentFundId,
              validTo: null,
            },
            select: { ownershipPercentage: true },
          });
          const currentTotal = existingHierarchies.reduce(
            (sum, h) => sum + Number(h.ownershipPercentage),
            0,
          );
          if (currentTotal + newPct > 100) {
            throw new HierarchyError(
              "OVER_100",
              `Aktueller Gesamtanteil: ${currentTotal.toFixed(2)}%. ` +
                `Mit neuem Anteil (${newPct}%) waeren es ${(currentTotal + newPct).toFixed(2)}%`,
            );
          }

          return tx.fundHierarchy.create({
            data: {
              parentFundId: validatedData.parentFundId,
              childFundId: validatedData.childFundId,
              ownershipPercentage: validatedData.ownershipPercentage,
              validFrom: new Date(validatedData.validFrom),
              validTo: validatedData.validTo ? new Date(validatedData.validTo) : null,
              notes: validatedData.notes ?? null,
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (txErr) {
      if (txErr instanceof HierarchyError) {
        switch (txErr.kind) {
          case "CYCLE":
            return apiError("BAD_REQUEST", undefined, {
              message: "Zirkulaere Referenz erkannt",
              details: txErr.message,
            });
          case "DUPLICATE":
            return apiError("ALREADY_EXISTS", undefined, {
              message: "Duplikat erkannt",
              details: txErr.message,
            });
          case "OVER_100":
            return apiError("BAD_REQUEST", undefined, {
              message: "Anteil übersteigt 100%",
              details: txErr.message,
            });
        }
      }
      throw txErr;
    }

    // Audit-Log (deferred: runs after response is sent)
    const hierarchyId = hierarchy.id;
    after(async () => {
      await createAuditLog({
        action: "CREATE",
        entityType: "FundHierarchy",
        entityId: hierarchyId,
        newValues: {
          parentFundName,
          childFundName,
          ownershipPercentage: newPct,
          validFrom: validatedData.validFrom,
        },
        description: `Fund-Hierarchie erstellt: "${childFundName}" ist Gesellschafter von "${parentFundName}" (${newPct}%)`,
      });
    });

    return NextResponse.json(hierarchy, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen der Fund-Hierarchie");
  }
}
