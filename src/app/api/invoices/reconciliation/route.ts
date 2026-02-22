import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";

// =============================================================================
// Types
// =============================================================================

interface ReconciliationSummary {
  totalAdvances: number;
  totalSettled: number;
  difference: number;
  differencePercent: number;
  openInvoices: number;
  overdueInvoices: number;
  totalOpenAmount: number;
}

interface MonthlyEntry {
  month: string;
  advances: number;
  settled: number;
  difference: number;
}

interface FundEntry {
  fundId: string;
  fundName: string;
  advances: number;
  settled: number;
  difference: number;
}

interface TimelineEntry {
  date: string;
  type: "ADVANCE" | "SETTLEMENT";
  amount: number;
  fundName: string;
  description: string;
}

interface InvoiceStatusMap {
  PAID: number;
  SENT: number;
  DRAFT: number;
  CANCELLED: number;
}

interface ReconciliationResponse {
  summary: ReconciliationSummary;
  monthly: MonthlyEntry[];
  byFund: FundEntry[];
  timeline: TimelineEntry[];
  invoiceStatus: InvoiceStatusMap;
}

// =============================================================================
// Helper: safely convert Prisma Decimal to number
// =============================================================================

function toNum(val: Prisma.Decimal | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  return Number(val);
}

// =============================================================================
// GET /api/invoices/reconciliation
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Permission check: user needs invoices:read or leases:read
    const check = await requirePermission(["invoices:read", "leases:read"]);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const parkId = searchParams.get("parkId");
    const fundId = searchParams.get("fundId");

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Ungueltiges Jahr" },
        { status: 400 }
      );
    }

    const tenantId = check.tenantId!;

    // -------------------------------------------------------------------------
    // 1. Fetch LeaseRevenueSettlement data (advance vs. settlement amounts)
    // -------------------------------------------------------------------------

    const leaseSettlementWhere: Prisma.LeaseRevenueSettlementWhereInput = {
      tenantId,
      year,
      ...(parkId && { parkId }),
    };

    const leaseRevenueSettlements = await prisma.leaseRevenueSettlement.findMany({
      where: leaseSettlementWhere,
      include: {
        park: {
          select: {
            id: true,
            name: true,
            operatorFundId: true,
            operatorFund: { select: { id: true, name: true } },
          },
        },
        items: {
          include: {
            lease: {
              select: {
                id: true,
                directBillingFundId: true,
                directBillingFund: { select: { id: true, name: true } },
              },
            },
            directBillingFund: { select: { id: true, name: true } },
            lessorPerson: { select: { id: true, firstName: true, lastName: true, companyName: true } },
            advanceInvoice: {
              select: {
                id: true,
                invoiceDate: true,
                grossAmount: true,
                status: true,
                recipientName: true,
              },
            },
            settlementInvoice: {
              select: {
                id: true,
                invoiceDate: true,
                grossAmount: true,
                status: true,
                recipientName: true,
              },
            },
          },
        },
      },
    });

    // -------------------------------------------------------------------------
    // 2. Fetch LeaseSettlementPeriod data (ADVANCE vs FINAL periods)
    // -------------------------------------------------------------------------

    const periodWhere: Prisma.LeaseSettlementPeriodWhereInput = {
      tenantId,
      year,
      ...(parkId && { parkId }),
    };

    const settlementPeriods = await prisma.leaseSettlementPeriod.findMany({
      where: periodWhere,
      include: {
        park: { select: { id: true, name: true } },
        invoices: {
          where: { deletedAt: null },
          select: {
            id: true,
            invoiceDate: true,
            grossAmount: true,
            netAmount: true,
            status: true,
            recipientName: true,
            fundId: true,
            fund: { select: { id: true, name: true } },
          },
        },
      },
    });

    // -------------------------------------------------------------------------
    // 3. Fetch all invoices for the year (for status distribution)
    // -------------------------------------------------------------------------

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const invoiceWhere: Prisma.InvoiceWhereInput = {
      tenantId,
      deletedAt: null,
      invoiceDate: { gte: yearStart, lt: yearEnd },
      ...(fundId && { fundId }),
      ...(parkId && { parkId }),
    };

    const allInvoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        invoiceDate: true,
        grossAmount: true,
        netAmount: true,
        status: true,
        invoiceType: true,
        recipientName: true,
        dueDate: true,
        fundId: true,
        fund: { select: { id: true, name: true } },
      },
    });

    // -------------------------------------------------------------------------
    // 4. Calculate aggregated data
    // -------------------------------------------------------------------------

    // -- Advance & settlement amounts from LeaseRevenueSettlementItems --
    let totalAdvances = 0;
    let totalSettled = 0;
    const fundMap = new Map<string, { name: string; advances: number; settled: number }>();
    const timelineEntries: TimelineEntry[] = [];
    const monthlyMap = new Map<string, { advances: number; settled: number }>();

    // Initialize monthly map for all 12 months
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      monthlyMap.set(key, { advances: 0, settled: 0 });
    }

    // Process LeaseRevenueSettlement items
    for (const settlement of leaseRevenueSettlements) {
      for (const item of settlement.items) {
        const advanceAmount = toNum(item.advancePaidEur);
        const subtotalAmount = toNum(item.subtotalEur);

        // Determine fund: prefer directBillingFund on item, then on lease, then park operator
        const itemFundId =
          item.directBillingFund?.id ??
          item.lease?.directBillingFund?.id ??
          settlement.park?.operatorFund?.id ??
          undefined;
        const lessorName =
          item.lessorPerson?.companyName ??
          [item.lessorPerson?.firstName, item.lessorPerson?.lastName].filter(Boolean).join(" ") ??
          "Unbekannt";
        const itemFundName =
          item.directBillingFund?.name ??
          item.lease?.directBillingFund?.name ??
          settlement.park?.operatorFund?.name ??
          lessorName;

        // Filter by fundId if provided
        if (fundId && itemFundId !== fundId) continue;

        totalAdvances += advanceAmount;
        totalSettled += subtotalAmount;

        // Fund aggregation
        if (itemFundId) {
          const existing = fundMap.get(itemFundId);
          if (existing) {
            existing.advances += advanceAmount;
            existing.settled += subtotalAmount;
          } else {
            fundMap.set(itemFundId, {
              name: itemFundName,
              advances: advanceAmount,
              settled: subtotalAmount,
            });
          }
        }

        // Timeline: Advance invoices
        if (item.advanceInvoice) {
          const invDate = new Date(item.advanceInvoice.invoiceDate);
          const monthKey = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
          const monthData = monthlyMap.get(monthKey);
          if (monthData) {
            monthData.advances += toNum(item.advanceInvoice.grossAmount);
          }

          timelineEntries.push({
            date: invDate.toISOString().split("T")[0],
            type: "ADVANCE",
            amount: toNum(item.advanceInvoice.grossAmount),
            fundName: itemFundName,
            description: `Pachtvorschuss ${year} - ${item.advanceInvoice.recipientName ?? itemFundName}`,
          });
        }

        // Timeline: Settlement invoices
        if (item.settlementInvoice) {
          const invDate = new Date(item.settlementInvoice.invoiceDate);
          const monthKey = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
          const monthData = monthlyMap.get(monthKey);
          if (monthData) {
            monthData.settled += toNum(item.settlementInvoice.grossAmount);
          }

          timelineEntries.push({
            date: invDate.toISOString().split("T")[0],
            type: "SETTLEMENT",
            amount: toNum(item.settlementInvoice.grossAmount),
            fundName: itemFundName,
            description: `Jahresabrechnung ${year} - ${item.settlementInvoice.recipientName ?? itemFundName}`,
          });
        }
      }
    }

    // Also process settlement periods (ADVANCE type)
    for (const period of settlementPeriods) {
      if (period.periodType === "ADVANCE") {
        for (const inv of period.invoices) {
          const invFundId = inv.fundId;
          const invFundName = inv.fund?.name ?? "Unbekannt";

          if (fundId && invFundId !== fundId) continue;

          const invAmount = toNum(inv.grossAmount);
          const invDate = new Date(inv.invoiceDate);
          const monthKey = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
          const monthData = monthlyMap.get(monthKey);

          // Only add if not already tracked via LeaseRevenueSettlement
          if (monthData) {
            // Check if this is already counted
            const alreadyCounted = timelineEntries.some(
              (t) => t.date === invDate.toISOString().split("T")[0] &&
                t.type === "ADVANCE" &&
                Math.abs(t.amount - invAmount) < 0.01 &&
                t.fundName === invFundName
            );
            if (!alreadyCounted) {
              monthData.advances += invAmount;
              totalAdvances += invAmount;

              if (invFundId) {
                const existing = fundMap.get(invFundId);
                if (existing) {
                  existing.advances += invAmount;
                } else {
                  fundMap.set(invFundId, {
                    name: invFundName,
                    advances: invAmount,
                    settled: 0,
                  });
                }
              }

              timelineEntries.push({
                date: invDate.toISOString().split("T")[0],
                type: "ADVANCE",
                amount: invAmount,
                fundName: invFundName,
                description: `Vorschuss ${period.month ? `Monat ${period.month}` : "Jahres-Vorschuss"} - ${inv.recipientName ?? invFundName}`,
              });
            }
          }
        }
      } else {
        // FINAL period
        for (const inv of period.invoices) {
          const invFundId = inv.fundId;
          const invFundName = inv.fund?.name ?? "Unbekannt";

          if (fundId && invFundId !== fundId) continue;

          const invAmount = toNum(inv.grossAmount);
          const invDate = new Date(inv.invoiceDate);
          const monthKey = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
          const monthData = monthlyMap.get(monthKey);

          const alreadyCounted = timelineEntries.some(
            (t) => t.date === invDate.toISOString().split("T")[0] &&
              t.type === "SETTLEMENT" &&
              Math.abs(t.amount - invAmount) < 0.01 &&
              t.fundName === invFundName
          );
          if (!alreadyCounted) {
            if (monthData) {
              monthData.settled += invAmount;
            }
            totalSettled += invAmount;

            if (invFundId) {
              const existing = fundMap.get(invFundId);
              if (existing) {
                existing.settled += invAmount;
              } else {
                fundMap.set(invFundId, {
                  name: invFundName,
                  advances: 0,
                  settled: invAmount,
                });
              }
            }

            timelineEntries.push({
              date: invDate.toISOString().split("T")[0],
              type: "SETTLEMENT",
              amount: invAmount,
              fundName: invFundName,
              description: `Endabrechnung ${period.month ? `Monat ${period.month}` : "Jahres"} - ${inv.recipientName ?? invFundName}`,
            });
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 5. Invoice status distribution
    // -------------------------------------------------------------------------

    const invoiceStatus: InvoiceStatusMap = {
      PAID: 0,
      SENT: 0,
      DRAFT: 0,
      CANCELLED: 0,
    };

    let openInvoices = 0;
    let overdueInvoices = 0;
    let totalOpenAmount = 0;
    const now = new Date();

    for (const inv of allInvoices) {
      const status = inv.status as keyof InvoiceStatusMap;
      if (status in invoiceStatus) {
        invoiceStatus[status]++;
      }

      if (inv.status === "SENT") {
        openInvoices++;
        totalOpenAmount += toNum(inv.grossAmount);
        if (inv.dueDate && new Date(inv.dueDate) < now) {
          overdueInvoices++;
        }
      }
    }

    // -------------------------------------------------------------------------
    // 6. Build response
    // -------------------------------------------------------------------------

    const difference = totalAdvances - totalSettled;
    const differencePercent = totalSettled !== 0
      ? Number(((difference / totalSettled) * 100).toFixed(2))
      : 0;

    // Monthly array
    const monthly: MonthlyEntry[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      const data = monthlyMap.get(key)!;
      monthly.push({
        month: key,
        advances: Math.round(data.advances * 100) / 100,
        settled: Math.round(data.settled * 100) / 100,
        difference: Math.round((data.advances - data.settled) * 100) / 100,
      });
    }

    // By fund array
    const byFund: FundEntry[] = Array.from(fundMap.entries()).map(([fId, fData]) => ({
      fundId: fId,
      fundName: fData.name,
      advances: Math.round(fData.advances * 100) / 100,
      settled: Math.round(fData.settled * 100) / 100,
      difference: Math.round((fData.advances - fData.settled) * 100) / 100,
    }));

    // Sort timeline newest first
    timelineEntries.sort((a, b) => b.date.localeCompare(a.date));

    const response: ReconciliationResponse = {
      summary: {
        totalAdvances: Math.round(totalAdvances * 100) / 100,
        totalSettled: Math.round(totalSettled * 100) / 100,
        difference: Math.round(difference * 100) / 100,
        differencePercent,
        openInvoices,
        overdueInvoices,
        totalOpenAmount: Math.round(totalOpenAmount * 100) / 100,
      },
      monthly,
      byFund,
      timeline: timelineEntries,
      invoiceStatus,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Reconciliation API] Error:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden der Abgleichdaten" },
      { status: 500 }
    );
  }
}
