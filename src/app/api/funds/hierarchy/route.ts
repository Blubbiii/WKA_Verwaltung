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
 * Schema fuer neue FundHierarchy-Eintraege
 * Definiert eine Eltern-Kind-Beziehung zwischen zwei Funds
 * (Ein Fund kann Gesellschafter eines anderen Funds sein)
 */
const fundHierarchyCreateSchema = z.object({
  parentFundId: z.string().uuid("Ungueltige Eltern-Fund-ID"),
  childFundId: z.string().uuid("Ungueltige Kind-Fund-ID"),
  ownershipPercentage: z
    .number()
    .min(0, "Anteil muss >= 0% sein")
    .max(100, "Anteil darf nicht > 100% sein"),
  validFrom: z.string().datetime({ message: "Ungueltiges Datum (ISO 8601 Format erwartet)" }),
  validTo: z
    .string()
    .datetime({ message: "Ungueltiges Datum (ISO 8601 Format erwartet)" })
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

type FundHierarchyCreateInput = z.infer<typeof fundHierarchyCreateSchema>;

// =============================================================================
// HELPER: Zirkulaere Referenzen pruefen
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
    // Hole Fund-Namen fuer bessere Fehlermeldung
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
    // Berechtigungspruefung: MANAGER+ fuer Funds-Modul
    const check = await requirePermission(["funds:read"]);
    if (!check.authorized) return check.error;

    // URL-Parameter extrahieren
    const { searchParams } = new URL(request.url);

    // Filter-Parameter
    const parentFundId = searchParams.get("parentFundId");
    const childFundId = searchParams.get("childFundId");
    const activeOnly = searchParams.get("activeOnly") === "true";

    // Paginierung
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Where-Clause aufbauen mit Multi-Tenancy Filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {
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
        skip: (page - 1) * limit,
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Fund-Hierarchien" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/funds/hierarchy - Neue Fund-Hierarchie erstellen
// Mit Pruefung auf zirkulaere Referenzen
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Berechtigungspruefung: MANAGER+ fuer Funds-Modul
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
      return NextResponse.json(
        { error: "Eltern-Fund nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
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
      return NextResponse.json(
        { error: "Kind-Fund nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // KRITISCH: Pruefung auf zirkulaere Referenzen
    const circularCheck = await checkCircularReference(
      validatedData.parentFundId,
      validatedData.childFundId,
      check.tenantId!
    );

    if (circularCheck.isCircular) {
      return NextResponse.json(
        {
          error: "Zirkulaere Referenz erkannt",
          details: `Die Hierarchie wuerde einen Zyklus erzeugen: ${circularCheck.path?.join(" -> ")}`,
        },
        { status: 400 }
      );
    }

    // Pruefung auf Duplikat (bereits existierende Beziehung fuer denselben Zeitraum)
    const existing = await prisma.fundHierarchy.findFirst({
      where: {
        parentFundId: validatedData.parentFundId,
        childFundId: validatedData.childFundId,
        validTo: null, // Aktive Beziehung
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: "Duplikat erkannt",
          details: `Es existiert bereits eine aktive Hierarchie-Beziehung zwischen "${childFund.name}" und "${parentFund.name}"`,
        },
        { status: 409 }
      );
    }

    // Pruefung: Gesamtanteil am Parent Fund darf nicht > 100% sein
    const existingHierarchies = await prisma.fundHierarchy.findMany({
      where: {
        parentFundId: validatedData.parentFundId,
        validTo: null, // Nur aktive
      },
      select: {
        ownershipPercentage: true,
      },
    });

    const currentTotal = existingHierarchies.reduce(
      (sum, h) => sum + Number(h.ownershipPercentage),
      0
    );

    if (currentTotal + validatedData.ownershipPercentage > 100) {
      return NextResponse.json(
        {
          error: "Anteil uebersteigt 100%",
          details: `Aktueller Gesamtanteil: ${currentTotal.toFixed(2)}%. ` +
            `Mit neuem Anteil (${validatedData.ownershipPercentage}%) waeren es ${(currentTotal + validatedData.ownershipPercentage).toFixed(2)}%`,
        },
        { status: 400 }
      );
    }

    // Fund-Hierarchie erstellen
    const hierarchy = await prisma.fundHierarchy.create({
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

    // Audit-Log
    await createAuditLog({
      action: "CREATE",
      entityType: "FundHierarchy",
      entityId: hierarchy.id,
      newValues: {
        parentFundName: parentFund.name,
        childFundName: childFund.name,
        ownershipPercentage: validatedData.ownershipPercentage,
        validFrom: validatedData.validFrom,
      },
      description: `Fund-Hierarchie erstellt: "${childFund.name}" ist Gesellschafter von "${parentFund.name}" (${validatedData.ownershipPercentage}%)`,
    });

    return NextResponse.json(hierarchy, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating fund hierarchy");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Fund-Hierarchie" },
      { status: 500 }
    );
  }
}
