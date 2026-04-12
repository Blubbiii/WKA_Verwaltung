/**
 * Park Stakeholder Detail API
 *
 * GET    - Get stakeholder details
 * PUT    - Update stakeholder
 * DELETE - Deactivate (soft-delete) stakeholder
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const stakeholderUpdateSchema = z.object({
  visibleFundIds: z.array(z.string()).optional(),
  billingEnabled: z.boolean().optional(),
  feePercentage: z.number().optional(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).optional(),
  sepaMandate: z.string().nullish(),
  creditorId: z.string().nullish(),
  validTo: z.string().nullish(),
  isActive: z.boolean().optional(),
  notes: z.string().nullish(),
  feeChangeReason: z.string().nullish(),
});

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("NOT_FOUND", 404, { message: "Management-Billing Feature ist nicht aktiviert" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/stakeholders/[id]
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;

    const stakeholder = await prisma.parkStakeholder.findUnique({
      where: { id },
      include: {
        stakeholderTenant: {
          select: { id: true, name: true, slug: true, logoUrl: true },
        },
        stakeholderFeeHistory: {
          orderBy: { validFrom: "desc" },
        },
        managementBillings: {
          orderBy: { year: "desc" },
          take: 20,
        },
      },
    });

    if (!stakeholder) {
      return apiError("NOT_FOUND", 404, { message: "Stakeholder nicht gefunden" });
    }

    // Access control: non-superadmin can only see their own tenant's entries
    if (check.tenantId && stakeholder.stakeholderTenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Enrich with park + tenant names
    const park = await prisma.park.findFirst({
      where: { id: stakeholder.parkId, tenantId: stakeholder.parkTenantId },
      select: { name: true },
    });
    const parkTenant = await prisma.tenant.findUnique({
      where: { id: stakeholder.parkTenantId },
      select: { name: true },
    });

    // Resolve visible fund names
    let visibleFundNames: string[] = [];
    if (stakeholder.visibleFundIds.length > 0) {
      const visibleFunds = await prisma.fund.findMany({
        where: { id: { in: stakeholder.visibleFundIds } },
        select: { name: true },
        orderBy: { name: "asc" },
      });
      visibleFundNames = visibleFunds.map((f) => f.name);
    }

    return NextResponse.json({
      stakeholder: {
        ...stakeholder,
        feePercentage: stakeholder.feePercentage
          ? Number(stakeholder.feePercentage)
          : null,
        feeHistory: stakeholder.stakeholderFeeHistory.map((h) => ({
          ...h,
          feePercentage: Number(h.feePercentage),
        })),
        billings: stakeholder.managementBillings.map((b) => ({
          ...b,
          baseRevenueEur: Number(b.baseRevenueEur),
          feePercentageUsed: Number(b.feePercentageUsed),
          feeAmountNetEur: Number(b.feeAmountNetEur),
          taxRate: Number(b.taxRate),
          taxAmountEur: Number(b.taxAmountEur),
          feeAmountGrossEur: Number(b.feeAmountGrossEur),
        })),
        visibleFundNames,
        parkName: park?.name || "Unbekannt",
        parkTenantName: parkTenant?.name || "Unbekannt",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET stakeholder detail error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden des Stakeholders" });
  }
}

// =============================================================================
// PUT /api/management-billing/stakeholders/[id]
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:update");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;
    const body = await request.json();
    const parsed = stakeholderUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { visibleFundIds, billingEnabled, feePercentage, taxType, sepaMandate, creditorId, validTo, isActive, notes } = parsed.data;

    const existing = await prisma.parkStakeholder.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Stakeholder nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.stakeholderTenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // If fee percentage changed, create a history entry
    if (
      feePercentage !== undefined &&
      feePercentage !== null &&
      Number(existing.feePercentage) !== feePercentage
    ) {
      // Close previous history entry
      const lastHistory = await prisma.stakeholderFeeHistory.findFirst({
        where: { stakeholderId: id, validUntil: null },
        orderBy: { validFrom: "desc" },
      });
      if (lastHistory) {
        await prisma.stakeholderFeeHistory.update({
          where: { id: lastHistory.id },
          data: { validUntil: new Date() },
        });
      }

      // Create new history entry
      await prisma.stakeholderFeeHistory.create({
        data: {
          stakeholderId: id,
          feePercentage,
          validFrom: new Date(),
          reason: parsed.data.feeChangeReason || null,
        },
      });
    }

    const updated = await prisma.parkStakeholder.update({
      where: { id },
      data: {
        ...(visibleFundIds !== undefined && { visibleFundIds }),
        ...(billingEnabled !== undefined && { billingEnabled }),
        ...(feePercentage !== undefined && { feePercentage }),
        ...(taxType !== undefined && { taxType }),
        ...(sepaMandate !== undefined && { sepaMandate }),
        ...(creditorId !== undefined && { creditorId }),
        ...(validTo !== undefined && {
          validTo: validTo ? new Date(validTo) : null,
        }),
        ...(isActive !== undefined && { isActive }),
        ...(notes !== undefined && { notes }),
      },
    });

    logger.info(
      { stakeholderId: id },
      "[Management-Billing] Stakeholder updated"
    );

    return NextResponse.json({ stakeholder: updated });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] PUT stakeholder error");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren des Stakeholders" });
  }
}

// =============================================================================
// DELETE /api/management-billing/stakeholders/[id]
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:delete");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;

    const existing = await prisma.parkStakeholder.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Stakeholder nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.stakeholderTenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Soft-delete: deactivate instead of hard delete
    await prisma.parkStakeholder.update({
      where: { id },
      data: {
        isActive: false,
        validTo: new Date(),
      },
    });

    logger.info(
      { stakeholderId: id },
      "[Management-Billing] Stakeholder deactivated"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] DELETE stakeholder error");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler beim Deaktivieren des Stakeholders" });
  }
}
