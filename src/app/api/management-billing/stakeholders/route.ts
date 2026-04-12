/**
 * Park Stakeholder API - List and Create
 *
 * GET  - List stakeholders (for current tenant or all if SUPERADMIN)
 * POST - Create a new park stakeholder assignment
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma, ParkStakeholderRole } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const stakeholderCreateSchema = z.object({
  stakeholderTenantId: z.string().min(1),
  parkTenantId: z.string().min(1),
  parkId: z.string().min(1),
  role: z.enum(["DEVELOPER", "GRID_OPERATOR", "TECHNICAL_BF", "COMMERCIAL_BF", "OPERATOR"]),
  visibleFundIds: z.array(z.string()).optional(),
  billingEnabled: z.boolean().optional().default(false),
  feePercentage: z.number().positive().optional(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).optional().default("STANDARD"),
  sepaMandate: z.string().nullish(),
  creditorId: z.string().nullish(),
  validFrom: z.string().optional(),
  validTo: z.string().nullish(),
  notes: z.string().nullish(),
});

// =============================================================================
// Feature Flag Check
// =============================================================================

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("NOT_FOUND", 404, { message: "Management-Billing Feature ist nicht aktiviert" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/stakeholders
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { searchParams } = new URL(request.url);
    const parkTenantId = searchParams.get("parkTenantId");
    const parkId = searchParams.get("parkId");
    const role = searchParams.get("role");
    const isActive = searchParams.get("isActive");

    // Build where clause
    const where: Prisma.ParkStakeholderWhereInput = {};

    // SUPERADMIN sees all, others only their tenant's stakeholder entries
    if (check.tenantId) {
      // Non-superadmin: show entries where their tenant is the stakeholder
      where.stakeholderTenantId = check.tenantId;
    }

    if (parkTenantId) where.parkTenantId = parkTenantId;
    if (parkId) where.parkId = parkId;
    if (role) where.role = role as ParkStakeholderRole;
    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const stakeholders = await prisma.parkStakeholder.findMany({
      where,
      include: {
        stakeholderTenant: {
          select: { id: true, name: true, slug: true, logoUrl: true },
        },
        _count: {
          select: { managementBillings: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Batch-load parks and tenants to avoid N+1 queries
    const parkIds = [...new Set(stakeholders.map((s) => s.parkId).filter(Boolean))];
    const tenantIds = [...new Set(stakeholders.map((s) => s.parkTenantId).filter(Boolean))];
    const [parks, parkTenants] = await Promise.all([
      prisma.park.findMany({
        where: { id: { in: parkIds } },
        select: { id: true, name: true },
      }),
      prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      }),
    ]);
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));
    const tenantMap = new Map(parkTenants.map((t) => [t.id, t.name]));

    const enriched = stakeholders.map((s) => ({
      ...s,
      feePercentage: s.feePercentage ? Number(s.feePercentage) : null,
      parkName: parkMap.get(s.parkId) || "Unbekannt",
      parkTenantName: tenantMap.get(s.parkTenantId) || "Unbekannt",
      billingsCount: s._count.managementBillings,
    }));

    return NextResponse.json({ stakeholders: enriched });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET stakeholders error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Stakeholder" });
  }
}

// =============================================================================
// POST /api/management-billing/stakeholders
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:create");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const body = await request.json();
    const parsed = stakeholderCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { stakeholderTenantId, parkTenantId, parkId, role, visibleFundIds, billingEnabled, feePercentage, taxType, sepaMandate, creditorId, validFrom, validTo, notes } = parsed.data;

    // Verify stakeholder tenant exists
    const stakeholderTenant = await prisma.tenant.findUnique({
      where: { id: stakeholderTenantId },
    });
    if (!stakeholderTenant) {
      return apiError("NOT_FOUND", 404, { message: "Stakeholder-Mandant nicht gefunden" });
    }

    // Verify park exists in the park tenant
    const park = await prisma.park.findFirst({
      where: { id: parkId, tenantId: parkTenantId },
    });
    if (!park) {
      return apiError("NOT_FOUND", 404, { message: "Park nicht gefunden im angegebenen Mandanten" });
    }

    // Check for duplicate
    const existing = await prisma.parkStakeholder.findUnique({
      where: {
        stakeholderTenantId_parkId_role: {
          stakeholderTenantId,
          parkId,
          role,
        },
      },
    });
    if (existing) {
      return apiError("CONFLICT", 409, { message: "Diese Rolle ist für diesen Mandanten und Park bereits vergeben" });
    }

    // BF roles need billing config
    const isBfRole = role === "TECHNICAL_BF" || role === "COMMERCIAL_BF";
    if (isBfRole && billingEnabled && (!feePercentage || feePercentage <= 0)) {
      return apiError("BAD_REQUEST", 400, { message: "BF-Rollen mit Abrechnung benoetigen einen Gebührensatz (feePercentage)" });
    }

    const stakeholder = await prisma.parkStakeholder.create({
      data: {
        stakeholderTenantId,
        parkTenantId,
        parkId,
        role,
        visibleFundIds: visibleFundIds || [],
        billingEnabled: billingEnabled || false,
        feePercentage: feePercentage || null,
        taxType: taxType || "STANDARD",
        sepaMandate: sepaMandate || null,
        creditorId: creditorId || null,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validTo: validTo ? new Date(validTo) : null,
        notes: notes || null,
      },
    });

    // Create initial fee history entry if fee is set
    if (feePercentage && feePercentage > 0) {
      await prisma.stakeholderFeeHistory.create({
        data: {
          stakeholderId: stakeholder.id,
          feePercentage,
          validFrom: validFrom ? new Date(validFrom) : new Date(),
          reason: "Erstanlage",
        },
      });
    }

    logger.info(
      { stakeholderId: stakeholder.id, role, parkId },
      "[Management-Billing] Stakeholder created"
    );

    return NextResponse.json({ stakeholder }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] POST stakeholder error");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen des Stakeholders" });
  }
}
