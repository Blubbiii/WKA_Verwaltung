import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/reports/[type] - Generate report data for a specific type
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_READ);
    if (!check.authorized) return check.error!;

    const { type } = await params;
    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const parkId = searchParams.get("parkId");

    // Get tenant info for branding
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId! },
      select: {
        name: true,
        logoUrl: true,
        primaryColor: true,
        address: true,
        contactPhone: true,
        contactEmail: true,
      },
    });

    let reportData: unknown = null;
    let reportTitle = "";

    switch (type) {
      case "parks-overview":
        reportData = await getParksOverview(check.tenantId!);
        reportTitle = "Windparks Übersicht";
        break;

      case "turbines-overview":
        reportData = await getTurbinesOverview(check.tenantId!, parkId);
        reportTitle = "Turbinen Übersicht";
        break;

      case "shareholders-overview":
        reportData = await getShareholdersOverview(check.tenantId!, fundId);
        reportTitle = "Gesellschafter Übersicht";
        break;

      case "contracts-overview":
        reportData = await getContractsOverview(check.tenantId!);
        reportTitle = "Verträge Übersicht";
        break;

      case "contracts-expiring":
        reportData = await getExpiringContracts(check.tenantId!);
        reportTitle = "Auslaufende Verträge";
        break;

      case "invoices-overview":
        reportData = await getInvoicesOverview(check.tenantId!, fundId);
        reportTitle = "Rechnungen Übersicht";
        break;

      case "votes-results":
        reportData = await getVotesResults(check.tenantId!, fundId);
        reportTitle = "Abstimmungsergebnisse";
        break;

      case "fund-performance":
        reportData = await getFundPerformance(check.tenantId!, fundId);
        reportTitle = "Gesellschafts-Performance";
        break;

      default:
        return NextResponse.json(
          { error: "Unbekannter Berichtstyp" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      title: reportTitle,
      generatedAt: new Date().toISOString(),
      tenant: {
        name: tenant?.name,
        logoUrl: tenant?.logoUrl,
        primaryColor: tenant?.primaryColor,
        address: tenant?.address,
        phone: tenant?.contactPhone,
        email: tenant?.contactEmail,
      },
      data: reportData,
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating report");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// Report generation functions
async function getParksOverview(tenantId: string) {
  const parks = await prisma.park.findMany({
    where: { tenantId },
    include: {
      turbines: {
        select: {
          ratedPowerKw: true,
          status: true,
        },
      },
      fundParks: {
        include: {
          fund: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return {
    summary: {
      totalParks: parks.length,
      totalTurbines: parks.reduce((acc, p) => acc + p.turbines.length, 0),
      totalCapacityMw:
        parks.reduce(
          (acc, p) =>
            acc + p.turbines.reduce((sum: number, t) => sum + Number(t.ratedPowerKw || 0), 0),
          0
        ) / 1000,
    },
    parks: parks.map((p) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      location: `${p.postalCode || ""} ${p.city || ""}`.trim() || null,
      turbineCount: p.turbines.length,
      totalCapacityMw:
        p.turbines.reduce((sum: number, t) => sum + Number(t.ratedPowerKw || 0), 0) / 1000,
      operationalTurbines: p.turbines.filter((t) => t.status === "ACTIVE")
        .length,
      funds: p.fundParks.map((fp) => fp.fund.name).join(", "),
      latitude: p.latitude ? Number(p.latitude) : null,
      longitude: p.longitude ? Number(p.longitude) : null,
    })),
  };
}

async function getTurbinesOverview(tenantId: string, parkId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const where: any = { park: { tenantId } };
  if (parkId) where.parkId = parkId;

  const turbines = await prisma.turbine.findMany({
    where,
    include: {
      park: { select: { name: true, shortName: true } },
    },
    orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
  });

  const statusCounts = turbines.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    summary: {
      totalTurbines: turbines.length,
      byStatus: statusCounts,
      totalCapacityMw:
        turbines.reduce((acc, t) => acc + Number(t.ratedPowerKw || 0), 0) / 1000,
    },
    turbines: turbines.map((t) => ({
      id: t.id,
      designation: t.designation,
      park: t.park.shortName || t.park.name,
      manufacturer: t.manufacturer,
      model: t.model,
      ratedPowerKw: t.ratedPowerKw,
      hubHeightM: t.hubHeightM ? Number(t.hubHeightM) : null,
      rotorDiameterM: t.rotorDiameterM ? Number(t.rotorDiameterM) : null,
      commissioningDate: t.commissioningDate?.toISOString().split("T")[0],
      status: t.status,
    })),
  };
}

async function getShareholdersOverview(tenantId: string, fundId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const where: any = { fund: { tenantId } };
  if (fundId) where.fundId = fundId;

  const shareholders = await prisma.shareholder.findMany({
    where,
    include: {
      fund: { select: { name: true } },
      person: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          personType: true,
          email: true,
          city: true,
        },
      },
    },
    orderBy: [{ fund: { name: "asc" } }, { ownershipPercentage: "desc" }],
  });

  const totalOwnership = shareholders.reduce(
    (acc, s) => acc + Number(s.ownershipPercentage || 0),
    0
  );

  return {
    summary: {
      totalShareholders: shareholders.length,
      totalOwnershipPercentage: totalOwnership,
    },
    shareholders: shareholders.map((s) => ({
      id: s.id,
      fund: s.fund.name,
      name:
        s.person.personType === "legal"
          ? s.person.companyName
          : `${s.person.firstName || ""} ${s.person.lastName || ""}`.trim(),
      type: s.person.personType === "legal" ? "Juristische Person" : "Natürliche Person",
      email: s.person.email,
      city: s.person.city,
      ownershipPercentage: Number(s.ownershipPercentage || 0),
      votingRightsPercentage: Number(s.votingRightsPercentage || 0),
      entryDate: s.entryDate?.toISOString().split("T")[0],
      status: s.status,
    })),
  };
}

async function getContractsOverview(tenantId: string) {
  const contracts = await prisma.contract.findMany({
    where: { tenantId },
    include: {
      park: { select: { name: true, shortName: true } },
      partner: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          personType: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { endDate: "asc" }],
  });

  const statusCounts = contracts.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalAnnualValue = contracts.reduce(
    (acc, c) => acc + Number(c.annualValue || 0),
    0
  );

  return {
    summary: {
      totalContracts: contracts.length,
      byStatus: statusCounts,
      totalAnnualValue,
    },
    contracts: contracts.map((c) => ({
      id: c.id,
      title: c.title,
      contractNumber: c.contractNumber,
      contractType: c.contractType,
      park: c.park ? c.park.shortName || c.park.name : null,
      partner: c.partner
        ? c.partner.personType === "legal"
          ? c.partner.companyName
          : `${c.partner.firstName || ""} ${c.partner.lastName || ""}`.trim()
        : null,
      startDate: c.startDate.toISOString().split("T")[0],
      endDate: c.endDate?.toISOString().split("T")[0],
      noticeDeadline: c.noticeDeadline?.toISOString().split("T")[0],
      annualValue: c.annualValue ? Number(c.annualValue) : null,
      status: c.status,
      autoRenewal: c.autoRenewal,
    })),
  };
}

async function getExpiringContracts(tenantId: string) {
  const now = new Date();
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  const contracts = await prisma.contract.findMany({
    where: {
      tenantId,
      status: { in: ["ACTIVE", "EXPIRING"] },
      OR: [
        {
          endDate: { gte: now, lte: ninetyDaysFromNow },
        },
        {
          noticeDeadline: { gte: now, lte: ninetyDaysFromNow },
        },
      ],
    },
    include: {
      park: { select: { name: true, shortName: true } },
      partner: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          personType: true,
        },
      },
    },
    orderBy: [{ noticeDeadline: "asc" }, { endDate: "asc" }],
  });

  return {
    summary: {
      totalExpiring: contracts.length,
      withinNotice: contracts.filter(
        (c) => c.noticeDeadline && c.noticeDeadline >= now && c.noticeDeadline <= ninetyDaysFromNow
      ).length,
      withinEnd: contracts.filter(
        (c) => c.endDate && c.endDate >= now && c.endDate <= ninetyDaysFromNow
      ).length,
    },
    contracts: contracts.map((c) => {
      const daysUntilEnd = c.endDate
        ? Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const daysUntilNotice = c.noticeDeadline
        ? Math.ceil((c.noticeDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: c.id,
        title: c.title,
        contractType: c.contractType,
        park: c.park ? c.park.shortName || c.park.name : null,
        partner: c.partner
          ? c.partner.personType === "legal"
            ? c.partner.companyName
            : `${c.partner.firstName || ""} ${c.partner.lastName || ""}`.trim()
          : null,
        endDate: c.endDate?.toISOString().split("T")[0],
        noticeDeadline: c.noticeDeadline?.toISOString().split("T")[0],
        daysUntilEnd,
        daysUntilNotice,
        annualValue: c.annualValue ? Number(c.annualValue) : null,
        autoRenewal: c.autoRenewal,
      };
    }),
  };
}

async function getInvoicesOverview(tenantId: string, fundId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const where: any = { tenantId };
  if (fundId) where.fundId = fundId;

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      fund: { select: { name: true } },
      shareholder: {
        include: {
          person: {
            select: {
              firstName: true,
              lastName: true,
              companyName: true,
              personType: true,
            },
          },
        },
      },
    },
    orderBy: [{ invoiceDate: "desc" }],
    take: 500,
  });

  const statusCounts = invoices.reduce(
    (acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalAmount = invoices.reduce(
    (acc, i) => acc + Number(i.grossAmount || 0),
    0
  );

  return {
    summary: {
      totalInvoices: invoices.length,
      byStatus: statusCounts,
      totalAmount,
    },
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      fund: i.fund?.name || null,
      recipient: i.shareholder?.person
        ? i.shareholder.person.personType === "legal"
          ? i.shareholder.person.companyName
          : `${i.shareholder.person.firstName || ""} ${i.shareholder.person.lastName || ""}`.trim()
        : i.recipientName,
      invoiceDate: i.invoiceDate.toISOString().split("T")[0],
      dueDate: i.dueDate?.toISOString().split("T")[0],
      totalNet: Number(i.netAmount || 0),
      totalGross: Number(i.grossAmount || 0),
      status: i.status,
    })),
  };
}

async function getVotesResults(tenantId: string, fundId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const where: any = { tenantId, status: "CLOSED" };
  if (fundId) where.fundId = fundId;

  const votes = await prisma.vote.findMany({
    where,
    include: {
      fund: { select: { name: true } },
      responses: {
        include: {
          shareholder: {
            include: {
              person: {
                select: {
                  firstName: true,
                  lastName: true,
                  companyName: true,
                  personType: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { endDate: "desc" },
  });

  return {
    summary: {
      totalVotes: votes.length,
    },
    votes: votes.map((v) => {
      // Calculate results
      const optionCounts: Record<string, { count: number; percentage: number }> = {};
      const options = v.options as string[] | null;
      if (options && Array.isArray(options)) {
        options.forEach((opt: string) => {
          optionCounts[opt] = { count: 0, percentage: 0 };
        });
      }

      v.responses.forEach((r) => {
        if (r.selectedOption && optionCounts[r.selectedOption]) {
          optionCounts[r.selectedOption].count++;
        }
      });

      const totalResponses = v.responses.length;
      Object.keys(optionCounts).forEach((opt) => {
        optionCounts[opt].percentage =
          totalResponses > 0
            ? (optionCounts[opt].count / totalResponses) * 100
            : 0;
      });

      return {
        id: v.id,
        title: v.title,
        fund: v.fund?.name || null,
        endDate: v.endDate.toISOString().split("T")[0],
        totalResponses,
        quorumPercentage: v.quorumPercentage ? Number(v.quorumPercentage) : null,
        results: optionCounts,
      };
    }),
  };
}

async function getFundPerformance(tenantId: string, fundId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const where: any = { tenantId };
  if (fundId) where.id = fundId;

  const funds = await prisma.fund.findMany({
    where,
    include: {
      _count: {
        select: { shareholders: true },
      },
      fundParks: {
        include: {
          park: {
            include: {
              _count: { select: { turbines: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Get invoice summaries per fund
  const invoiceSummaries = await prisma.invoice.groupBy({
    by: ["fundId", "status"],
    where: { tenantId, fundId: fundId || undefined },
    _sum: { grossAmount: true },
    _count: true,
  });

  return {
    summary: {
      totalFunds: funds.length,
      totalParks: funds.reduce((acc, f) => acc + f.fundParks.length, 0),
      totalShareholders: funds.reduce((acc, f) => acc + f._count.shareholders, 0),
    },
    funds: funds.map((f) => {
      const fundInvoices = invoiceSummaries.filter((i) => i.fundId === f.id);
      const totalInvoiced = fundInvoices.reduce(
        (acc, i) => acc + Number(i._sum.grossAmount || 0),
        0
      );
      const paidInvoices = fundInvoices
        .filter((i) => i.status === "PAID")
        .reduce((acc, i) => acc + Number(i._sum.grossAmount || 0), 0);

      return {
        id: f.id,
        name: f.name,
        fundType: f.legalForm,
        shareholderCount: f._count.shareholders,
        parkCount: f.fundParks.length,
        turbineCount: f.fundParks.reduce((acc, fp) => acc + fp.park._count.turbines, 0),
        totalInvoiced,
        totalPaid: paidInvoices,
        outstandingAmount: totalInvoiced - paidInvoices,
      };
    }),
  };
}
