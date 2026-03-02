/**
 * Parcel Matcher — matches WFS cadastral parcels against existing Plot records
 * and their linked Leases to determine contract status.
 */

import { prisma } from "@/lib/prisma";
import type { WfsParcelFeature } from "./wfs-client";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type MatchStatus =
  | "matched_active"    // Active lease exists
  | "matched_expiring"  // Lease expires within 12 months
  | "matched_expired"   // Lease is expired/terminated
  | "matched_draft"     // Lease is in draft
  | "unmatched";        // No matching plot or lease found

export interface MatchedParcelFeature extends WfsParcelFeature {
  properties: WfsParcelFeature["properties"] & {
    matchStatus: MatchStatus;
    matchedPlotId?: string;
    leaseId?: string;
    leaseStatus?: string;
    leaseEndDate?: string;
    lessorName?: string;
  };
}

// ---------------------------------------------------------------
// Core
// ---------------------------------------------------------------

/**
 * Match WFS parcel features against existing Plots/Leases for a given park.
 */
export async function matchParcelsToLeases(
  tenantId: string,
  parkId: string,
  features: WfsParcelFeature[],
): Promise<MatchedParcelFeature[]> {
  // Load all plots for this park with their lease info
  const plots = await prisma.plot.findMany({
    where: { tenantId, parkId },
    include: {
      leasePlots: {
        include: {
          lease: {
            select: {
              id: true,
              status: true,
              endDate: true,
              lessor: {
                select: {
                  firstName: true,
                  lastName: true,
                  companyName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Build lookup: "gemarkung|flur|flurstück" → plot + lease info
  const plotLookup = new Map<
    string,
    {
      plotId: string;
      leaseId?: string;
      leaseStatus?: string;
      leaseEndDate?: Date | null;
      lessorName?: string;
    }
  >();

  for (const plot of plots) {
    if (!plot.cadastralDistrict || !plot.fieldNumber || !plot.plotNumber) continue;

    const key = normalizeKey(plot.cadastralDistrict, plot.fieldNumber, plot.plotNumber);

    // Find the most relevant lease (prefer ACTIVE > DRAFT > EXPIRED)
    const activeLease = plot.leasePlots
      .map((lp) => lp.lease)
      .sort((a, b) => {
        const order: Record<string, number> = { ACTIVE: 0, DRAFT: 1, EXPIRED: 2, TERMINATED: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      })[0];

    const lessorName = activeLease?.lessor
      ? activeLease.lessor.companyName ||
        [activeLease.lessor.firstName, activeLease.lessor.lastName].filter(Boolean).join(" ")
      : undefined;

    plotLookup.set(key, {
      plotId: plot.id,
      leaseId: activeLease?.id,
      leaseStatus: activeLease?.status,
      leaseEndDate: activeLease?.endDate,
      lessorName,
    });
  }

  // Match each WFS feature
  const now = new Date();
  const twelveMonths = new Date(now);
  twelveMonths.setMonth(twelveMonths.getMonth() + 12);

  return features.map((feature): MatchedParcelFeature => {
    const key = normalizeKey(
      feature.properties.cadastralDistrict,
      feature.properties.fieldNumber,
      feature.properties.plotNumber,
    );

    const match = plotLookup.get(key);

    if (!match) {
      return {
        ...feature,
        properties: {
          ...feature.properties,
          matchStatus: "unmatched",
        },
      };
    }

    let matchStatus: MatchStatus = "unmatched";

    if (match.leaseStatus === "ACTIVE") {
      // Check if expiring within 12 months
      if (match.leaseEndDate && match.leaseEndDate <= twelveMonths) {
        matchStatus = "matched_expiring";
      } else {
        matchStatus = "matched_active";
      }
    } else if (match.leaseStatus === "DRAFT") {
      matchStatus = "matched_draft";
    } else if (match.leaseStatus === "EXPIRED" || match.leaseStatus === "TERMINATED") {
      matchStatus = "matched_expired";
    } else if (match.plotId) {
      // Plot exists but no lease
      matchStatus = "unmatched";
    }

    return {
      ...feature,
      properties: {
        ...feature.properties,
        matchStatus,
        matchedPlotId: match.plotId,
        leaseId: match.leaseId,
        leaseStatus: match.leaseStatus,
        leaseEndDate: match.leaseEndDate?.toISOString(),
        lessorName: match.lessorName,
      },
    };
  });
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Normalize a cadastral key for comparison (lowercase, trimmed) */
function normalizeKey(district: string, field: string, plot: string): string {
  return `${district.trim().toLowerCase()}|${field.trim().toLowerCase()}|${plot.trim().toLowerCase()}`;
}
