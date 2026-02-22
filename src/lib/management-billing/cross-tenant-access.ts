// Cross-Tenant Data Access for Management Billing
// Secure access to settlement data from client tenants, validated through ParkStakeholder entries.

import { prisma } from "@/lib/prisma";
import type { ClientSettlementData, FundDetails, ParkDetails } from "./types";

/**
 * Get settlement data from the client tenant for a specific stakeholder and period.
 * SECURITY: Validates that the stakeholder entry exists and is active before
 * allowing any cross-tenant data access.
 */
export async function getClientSettlementData(
  stakeholderId: string,
  year: number,
  month: number | null
): Promise<ClientSettlementData> {
  // 1. Load and validate the ParkStakeholder
  const stakeholder = await prisma.parkStakeholder.findUnique({
    where: { id: stakeholderId },
  });

  if (!stakeholder || !stakeholder.isActive) {
    throw new Error("Kein gueltiger Stakeholder-Eintrag gefunden");
  }

  // Check date validity
  const now = new Date();
  if (stakeholder.validFrom > now) {
    throw new Error("Vertrag noch nicht gueltig");
  }
  if (stakeholder.validTo && stakeholder.validTo < now) {
    throw new Error("Vertrag abgelaufen");
  }

  // 2. Build the settlement query for the CLIENT tenant (cross-tenant access)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    tenantId: stakeholder.parkTenantId,
    year,
  };
  if (stakeholder.parkId) {
    where.parkId = stakeholder.parkId;
  }
  if (month !== null && month !== undefined) {
    where.month = month;
  }

  const settlements = await prisma.energySettlement.findMany({
    where,
    include: {
      items: {
        include: {
          recipientFund: {
            select: { id: true, name: true },
          },
        },
        // If visibleFundIds is set, only include items for those funds
        ...(stakeholder.visibleFundIds.length > 0
          ? {
              where: {
                recipientFundId: { in: stakeholder.visibleFundIds },
              },
            }
          : {}),
      },
    },
  });

  // 3. Calculate total revenue across all settlement items
  const totalRevenueEur = settlements.reduce(
    (sum, s) =>
      sum +
      s.items.reduce(
        (itemSum, item) => itemSum + Number(item.revenueShareEur),
        0
      ),
    0
  );

  return {
    totalRevenueEur,
    settlements: settlements.map((s) => ({
      id: s.id,
      year: s.year,
      month: s.month,
      parkId: s.parkId,
      items: s.items.map((item) => ({
        id: item.id,
        recipientFundId: item.recipientFundId,
        fundName: item.recipientFund?.name || "Unbekannt",
        productionShareKwh: Number(item.productionShareKwh),
        productionSharePct: Number(item.productionSharePct),
        revenueShareEur: Number(item.revenueShareEur),
      })),
    })),
    contract: {
      id: stakeholder.id,
      role: stakeholder.role,
      feePercentage: Number(stakeholder.feePercentage),
      parkTenantId: stakeholder.parkTenantId,
      parkId: stakeholder.parkId,
      stakeholderTenantId: stakeholder.stakeholderTenantId,
      visibleFundIds: stakeholder.visibleFundIds,
    },
  };
}

/**
 * Get fund details from the client tenant (for invoice recipient information).
 * SECURITY: Validates stakeholder access and fund visibility before returning data.
 */
export async function getClientFundDetails(
  stakeholderId: string,
  fundId: string
): Promise<FundDetails | null> {
  const stakeholder = await prisma.parkStakeholder.findUnique({
    where: { id: stakeholderId },
  });
  if (!stakeholder || !stakeholder.isActive) return null;

  // Validate that this fund is visible to the stakeholder
  if (
    stakeholder.visibleFundIds.length > 0 &&
    !stakeholder.visibleFundIds.includes(fundId)
  ) {
    return null;
  }

  const fund = await prisma.fund.findFirst({
    where: {
      id: fundId,
      tenantId: stakeholder.parkTenantId,
    },
    select: {
      id: true,
      name: true,
      legalForm: true,
      street: true,
      houseNumber: true,
      postalCode: true,
      city: true,
    },
  });

  return fund;
}

/**
 * Get park details from the client tenant.
 * SECURITY: Validates stakeholder access before returning park data.
 */
export async function getClientParkDetails(
  stakeholderId: string
): Promise<ParkDetails | null> {
  const stakeholder = await prisma.parkStakeholder.findUnique({
    where: { id: stakeholderId },
  });
  if (!stakeholder || !stakeholder.isActive) return null;

  const park = await prisma.park.findFirst({
    where: {
      id: stakeholder.parkId,
      tenantId: stakeholder.parkTenantId,
    },
    select: {
      id: true,
      name: true,
      _count: { select: { turbines: true } },
      turbines: { select: { ratedPowerKw: true } },
    },
  });

  if (!park) return null;

  const totalCapacityKw = park.turbines.reduce(
    (sum, t) => sum + (t.ratedPowerKw ? Number(t.ratedPowerKw) : 0),
    0
  );

  return {
    id: park.id,
    name: park.name,
    turbineCount: park._count.turbines,
    totalCapacityKw: totalCapacityKw || null,
  };
}
