import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { parkLeaseSettlementSetupSchema } from "@/types/billing";
import type { ParkSetupData } from "@/types/billing";
import { z } from "zod";

// =============================================================================
// GET /api/leases/usage-fees/setup/[parkId] - Load park setup data
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ parkId: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error;

    const { parkId } = await params;

    // Load park with lease-settlement-relevant configuration
    const park = await prisma.park.findFirst({
      where: { id: parkId, tenantId: check.tenantId! },
      select: {
        id: true,
        name: true,
        shortName: true,
        leaseSettlementMode: true,
        minimumRentPerTurbine: true,
        weaSharePercentage: true,
        poolSharePercentage: true,
        billingEntityFundId: true,
        billingEntityFund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
          },
        },
        revenuePhases: {
          orderBy: { phaseNumber: "asc" },
          select: {
            phaseNumber: true,
            startYear: true,
            endYear: true,
            revenueSharePercentage: true,
          },
        },
        turbines: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            designation: true,
            operatorHistory: {
              where: { status: "ACTIVE" },
              take: 1,
              orderBy: { validFrom: "desc" },
              include: {
                operatorFund: {
                  select: {
                    id: true,
                    name: true,
                    legalForm: true,
                  },
                },
              },
            },
          },
        },
        plots: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            plotNumber: true,
            areaSqm: true,
            plotAreas: {
              select: {
                id: true,
                areaType: true,
                areaSqm: true,
              },
            },
            leasePlots: {
              where: {
                lease: { status: "ACTIVE" },
              },
              include: {
                lease: {
                  select: {
                    id: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                    directBillingFundId: true,
                    lessorId: true,
                    lessor: {
                      select: {
                        id: true,
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
        },
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Build operator funds list (deduplicated)
    const operatorFundsMap = new Map<
      string,
      { id: string; name: string; legalForm: string | null }
    >();
    for (const turbine of park.turbines) {
      const activeOp = turbine.operatorHistory[0];
      if (activeOp?.operatorFund) {
        operatorFundsMap.set(activeOp.operatorFund.id, {
          id: activeOp.operatorFund.id,
          name: activeOp.operatorFund.name,
          legalForm: activeOp.operatorFund.legalForm,
        });
      }
    }

    // Build per-lease data from plots
    const leaseDataMap = new Map<
      string,
      {
        leaseId: string;
        lessor: {
          id: string;
          firstName: string | null;
          lastName: string | null;
          companyName: string | null;
        };
        plots: {
          plotId: string;
          plotNumber: string;
          areaSqm: number;
          turbineCount: number;
          sealedSqm: number;
          areaType: string;
        }[];
        totalAreaSqm: number;
        totalTurbineCount: number;
        directBillingFundId: string | null;
      }
    >();

    let totalPoolAreaSqm = 0;

    for (const plot of park.plots) {
      for (const leasePlot of plot.leasePlots) {
        const lease = leasePlot.lease;
        if (!lease) continue;

        const existing = leaseDataMap.get(lease.id) ?? {
          leaseId: lease.id,
          lessor: lease.lessor,
          plots: [],
          totalAreaSqm: 0,
          totalTurbineCount: 0,
          directBillingFundId: lease.directBillingFundId,
        };

        const plotAreaSqm = Number(plot.areaSqm ?? 0);
        const turbineCount = plot.plotAreas.filter(
          (a) => a.areaType === "WEA_STANDORT"
        ).length;
        const sealedSqm = plot.plotAreas
          .filter((a) => a.areaType === "WEG")
          .reduce((sum, a) => sum + Number(a.areaSqm ?? 0), 0);
        const poolSqm = plot.plotAreas
          .filter((a) => a.areaType === "POOL" || a.areaType === "AUSGLEICH")
          .reduce((sum, a) => sum + Number(a.areaSqm ?? 0), 0);

        existing.plots.push({
          plotId: plot.id,
          plotNumber: plot.plotNumber,
          areaSqm: plotAreaSqm,
          turbineCount,
          sealedSqm,
          areaType: plot.plotAreas.map((a) => a.areaType).join(", "),
        });

        existing.totalAreaSqm += plotAreaSqm;
        existing.totalTurbineCount += turbineCount;
        totalPoolAreaSqm += poolSqm;

        leaseDataMap.set(lease.id, existing);
      }
    }

    const setupData: ParkSetupData = {
      parkId: park.id,
      parkName: park.name,
      leaseSettlementMode: park.leaseSettlementMode,
      billingEntityFund: park.billingEntityFund,
      operatorFunds: Array.from(operatorFundsMap.values()),
      leases: Array.from(leaseDataMap.values()),
      totalWEACount: park.turbines.length,
      totalPoolAreaSqm: Math.round(totalPoolAreaSqm * 100) / 100,
      minimumRentPerTurbine: park.minimumRentPerTurbine
        ? Number(park.minimumRentPerTurbine)
        : null,
      weaSharePercentage: park.weaSharePercentage
        ? Number(park.weaSharePercentage)
        : null,
      poolSharePercentage: park.poolSharePercentage
        ? Number(park.poolSharePercentage)
        : null,
      revenuePhases: park.revenuePhases.map((p) => ({
        phaseNumber: p.phaseNumber,
        startYear: p.startYear,
        endYear: p.endYear,
        revenueSharePercentage: Number(p.revenueSharePercentage),
      })),
    };

    return NextResponse.json(serializePrisma(setupData));
  } catch (error) {
    logger.error(
      { err: error },
      "Error loading lease settlement setup data"
    );
    return NextResponse.json(
      { error: "Fehler beim Laden der Park-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/leases/usage-fees/setup/[parkId] - Update park lease settlement config
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ parkId: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { parkId } = await params;
    const body = await request.json();
    const validatedData = parkLeaseSettlementSetupSchema.parse(body);

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: { id: parkId, tenantId: check.tenantId! },
      select: { id: true },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Run updates in a transaction
    await prisma.$transaction(async (tx) => {
      // Update park settlement mode
      await tx.park.update({
        where: { id: parkId },
        data: {
          leaseSettlementMode: validatedData.leaseSettlementMode,
        },
      });

      // Update direct billing fund assignments for each lease
      if (validatedData.directBillingAssignments) {
        for (const assignment of validatedData.directBillingAssignments) {
          // Verify lease belongs to this tenant
          const lease = await tx.lease.findFirst({
            where: {
              id: assignment.leaseId,
              tenantId: check.tenantId!,
            },
            select: { id: true },
          });

          if (lease) {
            await tx.lease.update({
              where: { id: assignment.leaseId },
              data: {
                directBillingFundId: assignment.directBillingFundId,
              },
            });
          }
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error(
      { err: error },
      "Error updating lease settlement setup"
    );
    return NextResponse.json(
      { error: "Fehler beim Speichern der Park-Konfiguration" },
      { status: 500 }
    );
  }
}
