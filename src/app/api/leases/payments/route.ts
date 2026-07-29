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
} from "date-fns";
import { apiError } from "@/lib/api-errors";

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

/** Safety brake against pathological loops (max ~1 entry per month + buffer). */
const MAX_PAYMENT_DATES = 400;

/**
 * Walks the aligned period starts and returns one due date per period.
 *
 * FIX (Randfall 12): The period start is aligned backwards (startOfMonth /
 * quarter start / half-year start). The old code then required the aligned
 * date to be >= the contract start — so a lease beginning on 15.03. lost its
 * March instalment entirely (9 instead of 10 instalments in the start year).
 * The first period now falls due on the contract start date itself.
 */
function collectPeriodDates(
  alignedStart: Date,
  effectiveStart: Date,
  effectiveEnd: Date,
  advance: (date: Date) => Date
): Date[] {
  const dates: Date[] = [];
  let current = new Date(alignedStart);
  let guard = 0;

  while (!isAfter(current, effectiveEnd) && guard++ < MAX_PAYMENT_DATES) {
    // Innerhalb der ersten (angebrochenen) Periode ist der Vertragsbeginn
    // faellig, nicht der davor liegende Perioden-Erste.
    const dueDate = isBefore(current, effectiveStart)
      ? new Date(effectiveStart)
      : new Date(current);

    if (!isAfter(dueDate, effectiveEnd)) {
      dates.push(dueDate);
    }

    current = advance(current);
  }

  return dates;
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

  // Determine period start (either contract start or year start)
  const effectiveStart = isAfter(startDate, yearStart) ? startDate : yearStart;
  // Determine period end (either contract end or year end)
  const effectiveEnd = endDate && isBefore(endDate, yearEnd) ? endDate : yearEnd;

  // Contract window does not overlap the requested year at all
  if (isAfter(effectiveStart, effectiveEnd)) {
    return [];
  }

  // Align to payment schedule
  switch (schedule) {
    case "MONTHLY":
      return collectPeriodDates(startOfMonth(effectiveStart), effectiveStart, effectiveEnd, (d) =>
        addMonths(d, 1)
      );

    case "QUARTERLY": {
      // Align to quarter start (Jan, Apr, Jul, Oct)
      const quarterMonth = Math.floor(effectiveStart.getMonth() / 3) * 3;
      const aligned = new Date(effectiveStart.getFullYear(), quarterMonth, 1);
      return collectPeriodDates(aligned, effectiveStart, effectiveEnd, (d) => addQuarters(d, 1));
    }

    case "SEMI_ANNUAL": {
      // Align to half-year (Jan, Jul)
      const halfYearMonth = effectiveStart.getMonth() < 6 ? 0 : 6;
      const aligned = new Date(effectiveStart.getFullYear(), halfYearMonth, 1);
      return collectPeriodDates(aligned, effectiveStart, effectiveEnd, (d) => addMonths(d, 6));
    }

    case "ANNUAL": {
      // FIX (Randfall 11): Annual payment at year start — but in the START
      // year the contract only begins mid-year. The old code compared the
      // 1st of January against the contract start, so a lease starting on
      // 01.06.2026 produced NO payment at all in 2026.
      // The due date is therefore the later of (year start, contract start).
      return [new Date(effectiveStart)];
    }
  }

  return [];
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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Pachtzahlungen" });
  }
}
