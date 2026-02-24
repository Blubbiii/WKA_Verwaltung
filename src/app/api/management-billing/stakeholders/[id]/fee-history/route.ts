/**
 * Stakeholder Fee History API
 *
 * GET  - List fee history for a stakeholder
 * POST - Add new fee percentage entry
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Gebühren-Historie" },
      { status: 500 }
    );
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
    const body = await request.json();

    const { feePercentage, validFrom, reason } = body;

    if (!feePercentage || feePercentage <= 0 || feePercentage > 100) {
      return NextResponse.json(
        { error: "Gebührensatz muss zwischen 0 und 100 liegen" },
        { status: 400 }
      );
    }

    // Close the current open entry
    const lastEntry = await prisma.stakeholderFeeHistory.findFirst({
      where: { stakeholderId: id, validUntil: null },
      orderBy: { validFrom: "desc" },
    });

    const effectiveDate = validFrom ? new Date(validFrom) : new Date();

    if (lastEntry) {
      await prisma.stakeholderFeeHistory.update({
        where: { id: lastEntry.id },
        data: { validUntil: effectiveDate },
      });
    }

    // Create new entry
    const entry = await prisma.stakeholderFeeHistory.create({
      data: {
        stakeholderId: id,
        feePercentage,
        validFrom: effectiveDate,
        reason: reason || null,
      },
    });

    // Also update the stakeholder's current fee
    await prisma.parkStakeholder.update({
      where: { id },
      data: { feePercentage },
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
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Gebührensatzes" },
      { status: 500 }
    );
  }
}
