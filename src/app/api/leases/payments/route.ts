import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import {
  startOfYear,
  endOfYear,
  addMonths,
  addQuarters,
  isBefore,
  isAfter,
  format,
  startOfMonth,
  endOfMonth,
} from "date-fns";

// Payment schedule enum mapping
type PaymentSchedule = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";

interface PaymentEntry {
  id: string;
  leaseId: string;
  lessorName: string;
  lessorId: string;
  parkId: string | null;
  parkName: string | null;
  dueDate: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  invoiceId: string | null;
  invoiceNumber: string | null;
  contractInfo: string;
  plots: Array<{
    id: string;
    cadastralDistrict: string;
    plotNumber: string;
  }>;
}

// Generate payment due dates based on schedule
function generatePaymentDates(
  startDate: Date,
  endDate: Date | null,
  schedule: PaymentSchedule,
  year: number
): Date[] {
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 0, 1));
  const dates: Date[] = [];

  // Determine period start (either contract start or year start)
  const effectiveStart = isAfter(startDate, yearStart) ? startDate : yearStart;
  // Determine period end (either contract end or year end)
  const effectiveEnd = endDate && isBefore(endDate, yearEnd) ? endDate : yearEnd;

  let currentDate = new Date(effectiveStart);

  // Align to payment schedule
  switch (schedule) {
    case "MONTHLY":
      currentDate = startOfMonth(currentDate);
      while (isBefore(currentDate, effectiveEnd) || currentDate.getTime() === effectiveEnd.getTime()) {
        if (
          (isAfter(currentDate, effectiveStart) || currentDate.getTime() === effectiveStart.getTime()) &&
          (isBefore(currentDate, effectiveEnd) || currentDate.getTime() === effectiveEnd.getTime())
        ) {
          dates.push(new Date(currentDate));
        }
        currentDate = addMonths(currentDate, 1);
      }
      break;

    case "QUARTERLY":
      // Align to quarter start (Jan, Apr, Jul, Oct)
      const quarterMonth = Math.floor(currentDate.getMonth() / 3) * 3;
      currentDate = new Date(currentDate.getFullYear(), quarterMonth, 1);
      while (isBefore(currentDate, effectiveEnd) || currentDate.getTime() === effectiveEnd.getTime()) {
        if (
          (isAfter(currentDate, effectiveStart) || currentDate.getTime() === effectiveStart.getTime()) &&
          (isBefore(currentDate, effectiveEnd) || currentDate.getTime() === effectiveEnd.getTime())
        ) {
          dates.push(new Date(currentDate));
        }
        currentDate = addQuarters(currentDate, 1);
      }
      break;

    case "SEMI_ANNUAL":
      // Align to half-year (Jan, Jul)
      const halfYearMonth = currentDate.getMonth() < 6 ? 0 : 6;
      currentDate = new Date(currentDate.getFullYear(), halfYearMonth, 1);
      while (isBefore(currentDate, effectiveEnd) || currentDate.getTime() === effectiveEnd.getTime()) {
        if (
          (isAfter(currentDate, effectiveStart) || currentDate.getTime() === effectiveStart.getTime()) &&
          (isBefore(currentDate, effectiveEnd) || currentDate.getTime() === effectiveEnd.getTime())
        ) {
          dates.push(new Date(currentDate));
        }
        currentDate = addMonths(currentDate, 6);
      }
      break;

    case "ANNUAL":
      // Annual payment at year start
      currentDate = new Date(year, 0, 1);
      if (
        (isAfter(currentDate, startDate) || currentDate.getTime() === startDate.getTime()) &&
        (!endDate || isBefore(currentDate, endDate) || currentDate.getTime() === endDate.getTime())
      ) {
        dates.push(currentDate);
      }
      break;
  }

  return dates;
}

// Calculate payment amount based on schedule
function calculatePaymentAmount(annualAmount: number, schedule: PaymentSchedule): number {
  switch (schedule) {
    case "MONTHLY":
      return annualAmount / 12;
    case "QUARTERLY":
      return annualAmount / 4;
    case "SEMI_ANNUAL":
      return annualAmount / 2;
    case "ANNUAL":
      return annualAmount;
    default:
      return annualAmount;
  }
}

// GET /api/leases/payments
export async function GET(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString(), 10);
    const parkId = searchParams.get("parkId");
    const status = searchParams.get("status") as "pending" | "paid" | "overdue" | null;

    const today = new Date();

    // Fetch all active leases with their plots and invoices
    const leases = await prisma.lease.findMany({
      where: {
        tenantId: check.tenantId,
        status: { in: ["ACTIVE", "EXPIRING"] },
        startDate: { lte: endOfYear(new Date(year, 0, 1)) },
        OR: [
          { endDate: null },
          { endDate: { gte: startOfYear(new Date(year, 0, 1)) } },
        ],
        ...(parkId && {
          leasePlots: {
            some: {
              plot: { parkId },
            },
          },
        }),
      },
      include: {
        lessor: {
          select: {
            id: true,
            personType: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
        leasePlots: {
          include: {
            plot: {
              select: {
                id: true,
                cadastralDistrict: true,
                plotNumber: true,
                park: {
                  select: { id: true, name: true, shortName: true },
                },
                plotAreas: {
                  select: {
                    areaType: true,
                    areaSqm: true,
                    lengthM: true,
                    compensationType: true,
                    compensationFixedAmount: true,
                    compensationPercentage: true,
                  },
                },
              },
            },
          },
        },
        invoices: {
          where: {
            invoiceDate: {
              gte: startOfYear(new Date(year, 0, 1)),
              lte: endOfYear(new Date(year, 0, 1)),
            },
            status: { in: ["SENT", "PAID"] },
          },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            grossAmount: true,
            status: true,
            paidAt: true,
          },
        },
      },
    });

    const payments: PaymentEntry[] = [];

    for (const lease of leases) {
      // Calculate annual rent from plot areas
      let annualRent = 0;
      for (const lp of lease.leasePlots) {
        for (const area of lp.plot.plotAreas) {
          if (area.compensationType === "ANNUAL" && area.compensationFixedAmount) {
            annualRent += Number(area.compensationFixedAmount);
          }
        }
      }

      // If no plot areas defined, skip
      if (annualRent === 0) continue;

      // Default to annual schedule if not specified
      // In the schema, there's no paymentSchedule field yet, so we default to ANNUAL
      const schedule: PaymentSchedule = "ANNUAL";

      // Get lessor name
      const lessorName =
        lease.lessor.personType === "legal"
          ? lease.lessor.companyName || "-"
          : [lease.lessor.firstName, lease.lessor.lastName].filter(Boolean).join(" ") || "-";

      // Get park info from first plot
      const firstPlot = lease.leasePlots[0]?.plot;
      const parkInfo = firstPlot?.park;

      // Generate payment dates
      const paymentDates = generatePaymentDates(
        new Date(lease.startDate),
        lease.endDate ? new Date(lease.endDate) : null,
        schedule,
        year
      );

      const paymentAmount = calculatePaymentAmount(annualRent, schedule);

      // Map invoices to payment dates
      const paidInvoices = new Map<string, typeof lease.invoices[0]>();
      for (const invoice of lease.invoices) {
        // Match invoice to nearest payment date
        const invoiceMonth = format(new Date(invoice.invoiceDate), "yyyy-MM");
        paidInvoices.set(invoiceMonth, invoice);
      }

      // Create payment entries for each due date
      for (const dueDate of paymentDates) {
        const dueDateKey = format(dueDate, "yyyy-MM");
        const matchedInvoice = paidInvoices.get(dueDateKey);

        let paymentStatus: "pending" | "paid" | "overdue";
        if (matchedInvoice?.status === "PAID") {
          paymentStatus = "paid";
        } else if (isBefore(dueDate, today) && !matchedInvoice) {
          paymentStatus = "overdue";
        } else {
          paymentStatus = "pending";
        }

        // Apply status filter
        if (status && paymentStatus !== status) continue;

        payments.push({
          id: `${lease.id}-${format(dueDate, "yyyy-MM-dd")}`,
          leaseId: lease.id,
          lessorName,
          lessorId: lease.lessor.id,
          parkId: parkInfo?.id || null,
          parkName: parkInfo?.shortName || parkInfo?.name || null,
          dueDate: dueDate.toISOString(),
          amount: paymentAmount,
          status: paymentStatus,
          invoiceId: matchedInvoice?.id || null,
          invoiceNumber: matchedInvoice?.invoiceNumber || null,
          contractInfo: lease.leasePlots
            .map((lp) => `${lp.plot.cadastralDistrict} ${lp.plot.plotNumber}`)
            .join(", "),
          plots: lease.leasePlots.map((lp) => ({
            id: lp.plot.id,
            cadastralDistrict: lp.plot.cadastralDistrict,
            plotNumber: lp.plot.plotNumber || "",
          })),
        });
      }
    }

    // Sort by due date
    payments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // Calculate summary
    const summary = {
      total: payments.reduce((sum, p) => sum + p.amount, 0),
      paid: payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
      pending: payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amount, 0),
      overdue: payments.filter((p) => p.status === "overdue").reduce((sum, p) => sum + p.amount, 0),
      count: {
        total: payments.length,
        paid: payments.filter((p) => p.status === "paid").length,
        pending: payments.filter((p) => p.status === "pending").length,
        overdue: payments.filter((p) => p.status === "overdue").length,
      },
    };

    return NextResponse.json({
      data: payments,
      summary,
      filters: {
        year,
        parkId,
        status,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching lease payments");
    return NextResponse.json(
      { error: "Fehler beim Laden der Pachtzahlungen" },
      { status: 500 }
    );
  }
}
