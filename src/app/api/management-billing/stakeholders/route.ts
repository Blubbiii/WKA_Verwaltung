/**
 * Park Stakeholder API - List and Create
 *
 * GET  - List stakeholders (for current tenant or all if SUPERADMIN)
 * POST - Create a new park stakeholder assignment
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Feature Flag Check
// =============================================================================

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json(
      { error: "Management-Billing Feature ist nicht aktiviert" },
      { status: 404 }
    );
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // SUPERADMIN sees all, others only their tenant's stakeholder entries
    if (check.tenantId) {
      // Non-superadmin: show entries where their tenant is the stakeholder
      where.stakeholderTenantId = check.tenantId;
    }

    if (parkTenantId) where.parkTenantId = parkTenantId;
    if (parkId) where.parkId = parkId;
    if (role) where.role = role;
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

    // Enrich with park name from the park tenant (cross-tenant lookup)
    const enriched = await Promise.all(
      stakeholders.map(async (s) => {
        const park = await prisma.park.findFirst({
          where: { id: s.parkId, tenantId: s.parkTenantId },
          select: { name: true },
        });
        const parkTenant = await prisma.tenant.findUnique({
          where: { id: s.parkTenantId },
          select: { name: true },
        });
        return {
          ...s,
          feePercentage: s.feePercentage ? Number(s.feePercentage) : null,
          parkName: park?.name || "Unbekannt",
          parkTenantName: parkTenant?.name || "Unbekannt",
          billingsCount: s._count.managementBillings,
        };
      })
    );

    return NextResponse.json({ stakeholders: enriched });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET stakeholders error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Stakeholder" },
      { status: 500 }
    );
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

    const {
      stakeholderTenantId,
      parkTenantId,
      parkId,
      role,
      visibleFundIds,
      billingEnabled,
      feePercentage,
      taxType,
      sepaMandate,
      creditorId,
      validFrom,
      validTo,
      notes,
    } = body;

    // Validation
    if (!stakeholderTenantId || !parkTenantId || !parkId || !role) {
      return NextResponse.json(
        { error: "stakeholderTenantId, parkTenantId, parkId und role sind erforderlich" },
        { status: 400 }
      );
    }

    const validRoles = ["DEVELOPER", "GRID_OPERATOR", "TECHNICAL_BF", "COMMERCIAL_BF", "OPERATOR"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Ungültige Rolle. Erlaubt: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify stakeholder tenant exists
    const stakeholderTenant = await prisma.tenant.findUnique({
      where: { id: stakeholderTenantId },
    });
    if (!stakeholderTenant) {
      return NextResponse.json(
        { error: "Stakeholder-Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    // Verify park exists in the park tenant
    const park = await prisma.park.findFirst({
      where: { id: parkId, tenantId: parkTenantId },
    });
    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden im angegebenen Mandanten" },
        { status: 404 }
      );
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
      return NextResponse.json(
        { error: "Diese Rolle ist für diesen Mandanten und Park bereits vergeben" },
        { status: 409 }
      );
    }

    // BF roles need billing config
    const isBfRole = role === "TECHNICAL_BF" || role === "COMMERCIAL_BF";
    if (isBfRole && billingEnabled && (!feePercentage || feePercentage <= 0)) {
      return NextResponse.json(
        { error: "BF-Rollen mit Abrechnung benoetigen einen Gebührensatz (feePercentage)" },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Stakeholders" },
      { status: 500 }
    );
  }
}
