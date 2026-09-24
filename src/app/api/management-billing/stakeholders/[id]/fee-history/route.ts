/**
 * Stakeholder Fee History API
 *
 * GET  - List fee history for a stakeholder
 * POST - Add new fee percentage entry
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const feeHistoryCreateSchema = z.object({
  feePercentage: z.number().gt(0).lte(100),
  validFrom: z.string().optional(),
  reason: z.string().nullish(),
});

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
  }
  return null;
}

/**
 * The id alone is no access right: same rule as the stakeholder route —
 * only entries of the caller's own tenant (superadmin without tenant: all).
 */
async function checkStakeholderAccess(id: string, tenantId?: string | null): Promise<NextResponse | null> {
  const stakeholder = await prisma.parkStakeholder.findUnique({
    where: { id },
    select: { id: true, stakeholderTenantId: true },
  });
  if (!stakeholder) {
    return apiError("NOT_FOUND", 404, { message: "Stakeholder nicht gefunden" });
  }
  if (tenantId && stakeholder.stakeholderTenantId !== tenantId) {
    return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/stakeholders/[id]/fee-history
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
    const accessCheck = await checkStakeholderAccess(id, check.tenantId);
    if (accessCheck) return accessCheck;

    const history = await prisma.stakeholderFeeHistory.findMany({
      where: { stakeholderId: id },
      orderBy: { validFrom: "desc" },
    });

    return NextResponse.json({
      history: history.map((h) => ({
        ...h,
        feePercentage: Number(h.feePercentage),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET fee-history error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Gebühren-Historie" });
  }
}

// =============================================================================
// POST /api/management-billing/stakeholders/[id]/fee-history
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:update");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;
    const accessCheck = await checkStakeholderAccess(id, check.tenantId);
    if (accessCheck) return accessCheck;

    const body = await request.json();
    const parsed = feeHistoryCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { feePercentage, validFrom, reason } = parsed.data;

    const effectiveDate = validFrom ? new Date(validFrom) : new Date();

    // Close the open entry, add the new one and update the current fee
    // together — a half-written change would leave two open entries.
    const entry = await prisma.$transaction(async (tx) => {
      const lastEntry = await tx.stakeholderFeeHistory.findFirst({
        where: { stakeholderId: id, validUntil: null },
        orderBy: { validFrom: "desc" },
      });

      if (lastEntry) {
        await tx.stakeholderFeeHistory.update({
          where: { id: lastEntry.id },
          data: { validUntil: effectiveDate },
        });
      }

      const created = await tx.stakeholderFeeHistory.create({
        data: {
          stakeholderId: id,
          feePercentage,
          validFrom: effectiveDate,
          reason: reason || null,
        },
      });

      await tx.parkStakeholder.update({
        where: { id },
        data: { feePercentage },
      });

      return created;
    });

    logger.info(
      { stakeholderId: id, feePercentage },
      "[Management-Billing] Fee percentage updated"
    );

    return NextResponse.json(
      { entry: { ...entry, feePercentage: Number(entry.feePercentage) } },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] POST fee-history error");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren des Gebührensatzes" });
  }
}
