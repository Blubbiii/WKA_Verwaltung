import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import {
  grantResourceAccess,
  revokeResourceAccess,
  RESOURCE_TYPES,
  ACCESS_LEVELS,
} from "@/lib/auth/resourceAccess";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const resourceAccessCreateSchema = z.object({
  userId: z.string().uuid("Ungueltige User-ID"),
  resourceType: z.enum(
    Object.values(RESOURCE_TYPES) as [string, ...string[]],
    { errorMap: () => ({ message: "Ungueltiger Ressourcen-Typ" }) }
  ),
  resourceId: z.string().uuid("Ungueltige Ressourcen-ID"),
  accessLevel: z.enum(
    Object.values(ACCESS_LEVELS) as [string, ...string[]],
    { errorMap: () => ({ message: "Ungueltiges Zugriffslevel" }) }
  ),
  expiresAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const resourceAccessDeleteSchema = z.object({
  userId: z.string().uuid("Ungueltige User-ID"),
  resourceType: z.string().min(1, "Ressourcen-Typ erforderlich"),
  resourceId: z.string().uuid("Ungueltige Ressourcen-ID"),
});

// ============================================================================
// GET /api/admin/resource-access
// Liste aller ResourceAccess Eintraege (mit Filtern)
// ============================================================================

export async function GET(request: NextRequest) {
  try {
const check = await requireAdmin();
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const resourceType = searchParams.get("resourceType");
    const resourceId = searchParams.get("resourceId");
    const includeExpired = searchParams.get("includeExpired") === "true";

    // Baue Where-Clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (resourceType) {
      where.resourceType = resourceType;
    }

    if (resourceId) {
      where.resourceId = resourceId;
    }

    // Standardmaessig keine abgelaufenen Zugriffe
    if (!includeExpired) {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    }

    const accessList = await prisma.resourceAccess.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: [
        { resourceType: "asc" },
        { createdAt: "desc" },
      ],
    });

    // Batch-fetch resource names to avoid N+1 queries
    const resourceNameMap = await getResourceNamesBatch(accessList);

    const enrichedList = accessList.map((access) => ({
      ...access,
      resourceName:
        resourceNameMap.get(`${access.resourceType}:${access.resourceId}`) ??
        `${access.resourceType} (${access.resourceId.slice(0, 8)}...)`,
    }));

    return NextResponse.json({ data: enrichedList });
  } catch (error) {
    logger.error({ err: error }, "Error fetching resource access");
    return NextResponse.json(
      { error: "Fehler beim Laden der Zugriffsrechte" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/admin/resource-access
// Neuen Zugriff gewaehren
// ============================================================================

export async function POST(request: NextRequest) {
  try {
const check = await requireAdmin();
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = resourceAccessCreateSchema.parse(body);

    // Pruefen ob User existiert
    const user = await prisma.user.findUnique({
      where: { id: validatedData.userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefen ob Ressource existiert
    const resourceExists = await checkResourceExists(
      validatedData.resourceType,
      validatedData.resourceId
    );

    if (!resourceExists) {
      return NextResponse.json(
        { error: "Ressource nicht gefunden" },
        { status: 404 }
      );
    }

    // Zugriff gewaehren
    const access = await grantResourceAccess(
      validatedData.userId,
      validatedData.resourceType,
      validatedData.resourceId,
      validatedData.accessLevel,
      check.userId!,
      {
        expiresAt: validatedData.expiresAt
          ? new Date(validatedData.expiresAt)
          : undefined,
        notes: validatedData.notes ?? undefined,
      }
    );

    // Ressourcen-Name fuer Response
    const resourceName = await getResourceName(
      access.resourceType,
      access.resourceId
    );

    return NextResponse.json(
      {
        data: {
          ...access,
          resourceName,
        },
        message: "Zugriff erfolgreich gewaehrt",
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
    logger.error({ err: error }, "Error granting resource access");
    return NextResponse.json(
      { error: "Fehler beim Gewaehren des Zugriffs" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/admin/resource-access
// Zugriff entziehen
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
const check = await requireAdmin();
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = resourceAccessDeleteSchema.parse(body);

    const revoked = await revokeResourceAccess(
      validatedData.userId,
      validatedData.resourceType,
      validatedData.resourceId
    );

    if (!revoked) {
      return NextResponse.json(
        { error: "Zugriffsrecht nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Zugriff erfolgreich entzogen",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error revoking resource access");
    return NextResponse.json(
      { error: "Fehler beim Entziehen des Zugriffs" },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Prueft ob eine Ressource existiert
 */
async function checkResourceExists(
  resourceType: string,
  resourceId: string
): Promise<boolean> {
  try {
    switch (resourceType) {
      case RESOURCE_TYPES.PARK: {
        const park = await prisma.park.findUnique({ where: { id: resourceId } });
        return !!park;
      }
      case RESOURCE_TYPES.FUND: {
        const fund = await prisma.fund.findUnique({ where: { id: resourceId } });
        return !!fund;
      }
      case RESOURCE_TYPES.TURBINE: {
        const turbine = await prisma.turbine.findUnique({ where: { id: resourceId } });
        return !!turbine;
      }
      case RESOURCE_TYPES.DOCUMENT: {
        const doc = await prisma.document.findUnique({ where: { id: resourceId } });
        return !!doc;
      }
      case RESOURCE_TYPES.CONTRACT: {
        const contract = await prisma.contract.findUnique({ where: { id: resourceId } });
        return !!contract;
      }
      case RESOURCE_TYPES.LEASE: {
        const lease = await prisma.lease.findUnique({ where: { id: resourceId } });
        return !!lease;
      }
      case RESOURCE_TYPES.INVOICE: {
        const invoice = await prisma.invoice.findUnique({ where: { id: resourceId } });
        return !!invoice;
      }
      case RESOURCE_TYPES.SHAREHOLDER: {
        const shareholder = await prisma.shareholder.findUnique({ where: { id: resourceId } });
        return !!shareholder;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Batch-fetches resource names for a list of access records.
 * Groups IDs by resource type and performs one query per type instead of N individual queries.
 * Returns a Map keyed by "TYPE:ID" -> display name.
 */
async function getResourceNamesBatch(
  accessList: { resourceType: string; resourceId: string }[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // Group resource IDs by type
  const idsByType = new Map<string, string[]>();
  for (const access of accessList) {
    const ids = idsByType.get(access.resourceType) ?? [];
    ids.push(access.resourceId);
    idsByType.set(access.resourceType, ids);
  }

  // Batch queries in parallel - one query per resource type
  const queries: Promise<void>[] = [];

  const parkIds = idsByType.get(RESOURCE_TYPES.PARK);
  if (parkIds?.length) {
    queries.push(
      prisma.park
        .findMany({ where: { id: { in: parkIds } }, select: { id: true, name: true } })
        .then((parks) => {
          for (const p of parks) result.set(`${RESOURCE_TYPES.PARK}:${p.id}`, p.name ?? "Unbekannter Windpark");
        })
    );
  }

  const fundIds = idsByType.get(RESOURCE_TYPES.FUND);
  if (fundIds?.length) {
    queries.push(
      prisma.fund
        .findMany({ where: { id: { in: fundIds } }, select: { id: true, name: true } })
        .then((funds) => {
          for (const f of funds) result.set(`${RESOURCE_TYPES.FUND}:${f.id}`, f.name ?? "Unbekannte Gesellschaft");
        })
    );
  }

  const turbineIds = idsByType.get(RESOURCE_TYPES.TURBINE);
  if (turbineIds?.length) {
    queries.push(
      prisma.turbine
        .findMany({ where: { id: { in: turbineIds } }, select: { id: true, designation: true } })
        .then((turbines) => {
          for (const t of turbines) result.set(`${RESOURCE_TYPES.TURBINE}:${t.id}`, t.designation ?? "Unbekannte Turbine");
        })
    );
  }

  const docIds = idsByType.get(RESOURCE_TYPES.DOCUMENT);
  if (docIds?.length) {
    queries.push(
      prisma.document
        .findMany({ where: { id: { in: docIds } }, select: { id: true, title: true } })
        .then((docs) => {
          for (const d of docs) result.set(`${RESOURCE_TYPES.DOCUMENT}:${d.id}`, d.title ?? "Unbekanntes Dokument");
        })
    );
  }

  const contractIds = idsByType.get(RESOURCE_TYPES.CONTRACT);
  if (contractIds?.length) {
    queries.push(
      prisma.contract
        .findMany({ where: { id: { in: contractIds } }, select: { id: true, title: true } })
        .then((contracts) => {
          for (const c of contracts) result.set(`${RESOURCE_TYPES.CONTRACT}:${c.id}`, c.title ?? "Unbekannter Vertrag");
        })
    );
  }

  const leaseIds = idsByType.get(RESOURCE_TYPES.LEASE);
  if (leaseIds?.length) {
    queries.push(
      prisma.lease
        .findMany({
          where: { id: { in: leaseIds } },
          select: {
            id: true,
            lessor: { select: { firstName: true, lastName: true, companyName: true } },
          },
        })
        .then((leases) => {
          for (const l of leases) {
            if (l.lessor) {
              const name =
                l.lessor.companyName ??
                `${l.lessor.firstName ?? ""} ${l.lessor.lastName ?? ""}`.trim();
              result.set(`${RESOURCE_TYPES.LEASE}:${l.id}`, `Pachtvertrag ${name}`);
            } else {
              result.set(`${RESOURCE_TYPES.LEASE}:${l.id}`, "Unbekannter Pachtvertrag");
            }
          }
        })
    );
  }

  const invoiceIds = idsByType.get(RESOURCE_TYPES.INVOICE);
  if (invoiceIds?.length) {
    queries.push(
      prisma.invoice
        .findMany({ where: { id: { in: invoiceIds } }, select: { id: true, invoiceNumber: true } })
        .then((invoices) => {
          for (const i of invoices) result.set(`${RESOURCE_TYPES.INVOICE}:${i.id}`, i.invoiceNumber ?? "Unbekannte Rechnung");
        })
    );
  }

  const shareholderIds = idsByType.get(RESOURCE_TYPES.SHAREHOLDER);
  if (shareholderIds?.length) {
    queries.push(
      prisma.shareholder
        .findMany({
          where: { id: { in: shareholderIds } },
          select: {
            id: true,
            person: { select: { firstName: true, lastName: true, companyName: true } },
          },
        })
        .then((shareholders) => {
          for (const sh of shareholders) {
            if (sh.person) {
              const name =
                sh.person.companyName ??
                `${sh.person.firstName ?? ""} ${sh.person.lastName ?? ""}`.trim();
              result.set(`${RESOURCE_TYPES.SHAREHOLDER}:${sh.id}`, name || "Unbekannter Gesellschafter");
            } else {
              result.set(`${RESOURCE_TYPES.SHAREHOLDER}:${sh.id}`, "Unbekannter Gesellschafter");
            }
          }
        })
    );
  }

  await Promise.all(queries);
  return result;
}

/**
 * Holt den Namen einer einzelnen Ressource (fuer POST-Response).
 */
async function getResourceName(
  resourceType: string,
  resourceId: string
): Promise<string> {
  const batch = await getResourceNamesBatch([{ resourceType, resourceId }]);
  return (
    batch.get(`${resourceType}:${resourceId}`) ??
    `${resourceType} (${resourceId.slice(0, 8)}...)`
  );
}
