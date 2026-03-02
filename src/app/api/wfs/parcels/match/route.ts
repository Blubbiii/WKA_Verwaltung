import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { matchParcelsToLeases } from "@/lib/wfs/parcel-matcher";
import type { WfsParcelFeature } from "@/lib/wfs/wfs-client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// POST /api/wfs/parcels/match
// Matches WFS parcel features against existing Plots/Leases for a park.
//
// Body: { parkId: string, features: WfsParcelFeature[] }
// Returns: MatchedParcelFeature[] with matchStatus, leaseId, lessorName, etc.
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { parkId, features } = body;

    if (!parkId || typeof parkId !== "string") {
      return NextResponse.json(
        { error: "parkId ist erforderlich" },
        { status: 400 },
      );
    }

    if (!Array.isArray(features) || features.length === 0) {
      return NextResponse.json(
        { error: "features Array ist erforderlich" },
        { status: 400 },
      );
    }

    const matched = await matchParcelsToLeases(
      check.tenantId!,
      parkId,
      features as WfsParcelFeature[],
    );

    // Count statistics
    const stats = {
      total: matched.length,
      active: matched.filter((f) => f.properties.matchStatus === "matched_active").length,
      expiring: matched.filter((f) => f.properties.matchStatus === "matched_expiring").length,
      expired: matched.filter((f) => f.properties.matchStatus === "matched_expired").length,
      draft: matched.filter((f) => f.properties.matchStatus === "matched_draft").length,
      unmatched: matched.filter((f) => f.properties.matchStatus === "unmatched").length,
    };

    return NextResponse.json({
      type: "FeatureCollection",
      features: matched,
      stats,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Flurstücks-Abgleich");
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Fehler beim Abgleich", details: errMsg },
      { status: 500 },
    );
  }
}
