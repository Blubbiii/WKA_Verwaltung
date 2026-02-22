/**
 * Monthly Lease Payment Rule Handler
 * Implementiert die Logik fuer monatliche Pachtzahlungen
 *
 * Supports partial month prorating (Teilmonate):
 * - If a lease starts mid-month, the first month is prorated by days
 * - If a lease ends mid-month, the last month is prorated by days
 * - Formula: monthlyAmount * (daysInPeriod / totalDaysInMonth)
 */

import { prisma } from "@/lib/prisma";
import { InvoiceType, TaxType, ContractStatus } from "@prisma/client";
import { getNextInvoiceNumber, calculateTaxAmounts, getTaxRateByType } from "@/lib/invoices/numberGenerator";
import { BillingRuleType } from "../types";
import {
  RuleHandler,
  LeasePaymentParameters,
  BillingRuleParameters,
  ExecuteRuleOptions,
  ExecutionResult,
  InvoiceCreationResult,
  ExecutionDetails,
} from "../types";

/**
 * Calculate the proration factor for a partial month (Teilmonat).
 *
 * Returns a factor between 0 and 1 representing what fraction of the month
 * the lease is active. Returns 1.0 for a full month.
 *
 * Edge cases handled:
 * - Lease starts on the 1st of the month -> no prorating for start
 * - Lease ends on the last day of the month -> no prorating for end
 * - Lease starts and ends within the same month
 * - February in leap years (uses actual days in month)
 *
 * @param year - The billing year
 * @param month - The billing month (1-12)
 * @param leaseStartDate - The lease contract start date
 * @param leaseEndDate - The lease contract end date (null = indefinite)
 * @returns A factor between 0 and 1, or 0 if the lease is completely outside the month
 */
export function calculateProrationFactor(
  year: number,
  month: number,
  leaseStartDate: Date,
  leaseEndDate: Date | null
): number {
  // First day of the billing month
  const monthStart = new Date(year, month - 1, 1);
  // Last day of the billing month (day 0 of next month = last day of current month)
  const monthEnd = new Date(year, month, 0);
  const totalDaysInMonth = monthEnd.getDate();

  // Normalize lease dates to date-only (strip time component)
  const leaseStart = new Date(
    leaseStartDate.getFullYear(),
    leaseStartDate.getMonth(),
    leaseStartDate.getDate()
  );
  const leaseEnd = leaseEndDate
    ? new Date(
        leaseEndDate.getFullYear(),
        leaseEndDate.getMonth(),
        leaseEndDate.getDate()
      )
    : null;

  // If lease has not started yet (starts after end of billing month) -> 0
  if (leaseStart > monthEnd) {
    return 0;
  }

  // If lease has already ended (ended before start of billing month) -> 0
  if (leaseEnd && leaseEnd < monthStart) {
    return 0;
  }

  // Determine the effective start day within this month
  // If lease starts before or on the 1st of this month, effective start = 1
  const effectiveStartDay =
    leaseStart <= monthStart ? 1 : leaseStart.getDate();

  // Determine the effective end day within this month
  // If lease has no end date or ends after/on the last day, effective end = last day
  const effectiveEndDay =
    !leaseEnd || leaseEnd >= monthEnd ? totalDaysInMonth : leaseEnd.getDate();

  // Calculate billable days (inclusive of both start and end day)
  const billableDays = effectiveEndDay - effectiveStartDay + 1;

  if (billableDays <= 0) {
    return 0;
  }

  // If the entire month is covered, return exactly 1.0 (no floating point issues)
  if (billableDays === totalDaysInMonth) {
    return 1;
  }

  // Return the proration factor rounded to 6 decimal places to avoid floating point drift
  return Math.round((billableDays / totalDaysInMonth) * 1000000) / 1000000;
}

/**
 * Berechnet den Anteil des Pachters basierend auf Flaechen
 */
export function calculateLeaseAmount(
  lease: {
    id: string;
    leasePlots: Array<{
      plot: {
        id: string;
        areaSqm: number | null;
        plotAreas: Array<{
          id: string;
          areaType: string;
          areaSqm: number | null;
          lengthM: number | null;
          compensationType: string;
          compensationFixedAmount: number | null;
          compensationPercentage: number | null;
        }>;
      };
    }>;
  },
  park: {
    minimumRentPerTurbine: number | null;
    weaSharePercentage: number | null;
    poolSharePercentage: number | null;
    wegCompensationPerSqm: number | null;
    ausgleichCompensationPerSqm: number | null;
    kabelCompensationPerM: number | null;
  } | null,
  useMinimumRent: boolean = true
): number {
  let totalAmount = 0;

  const minimumRent = park?.minimumRentPerTurbine || 0;
  const wegRate = park?.wegCompensationPerSqm || 0;
  const ausgleichRate = park?.ausgleichCompensationPerSqm || 0;
  const kabelRate = park?.kabelCompensationPerM || 0;

  for (const leasePlot of lease.leasePlots) {
    for (const area of leasePlot.plot.plotAreas) {
      // Fixer Betrag hat Vorrang
      if (area.compensationFixedAmount && area.compensationFixedAmount > 0) {
        // Jaehrliche Zahlung auf Monat runterbrechen
        if (area.compensationType === "ANNUAL") {
          totalAmount += Number(area.compensationFixedAmount) / 12;
        } else {
          // Einmalzahlungen werden hier nicht beruecksichtigt
        }
        continue;
      }

      // Prozent der Mindestpacht
      if (area.compensationPercentage && area.compensationPercentage > 0) {
        totalAmount += (minimumRent * Number(area.compensationPercentage)) / 100 / 12;
        continue;
      }

      // Standard-Berechnung basierend auf Flaechen-Typ
      switch (area.areaType) {
        case "WEA_STANDORT":
          // WEA-Standort: Anteil der Mindestpacht
          const weaShare = park?.weaSharePercentage || 10;
          totalAmount += (minimumRent * Number(weaShare)) / 100 / 12;
          break;
        case "POOL":
          // Poolflaeche: Anteil der Mindestpacht
          const poolShare = park?.poolSharePercentage || 90;
          const poolAreaSqm = Number(area.areaSqm) || 0;
          // Pool wird anteilig nach Flaeche verteilt
          if (poolAreaSqm > 0) {
            totalAmount += (minimumRent * Number(poolShare)) / 100 / 12;
          }
          break;
        case "WEG":
          // Wegflaeche: m2 * Satz
          const wegAreaSqm = Number(area.areaSqm) || 0;
          totalAmount += (wegAreaSqm * wegRate) / 12;
          break;
        case "AUSGLEICH":
          // Ausgleichsflaeche: m2 * Satz
          const ausgleichAreaSqm = Number(area.areaSqm) || 0;
          totalAmount += (ausgleichAreaSqm * ausgleichRate) / 12;
          break;
        case "KABEL":
          // Kabeltrasse: m * Satz
          const kabelLengthM = Number(area.lengthM) || 0;
          totalAmount += (kabelLengthM * kabelRate) / 12;
          break;
      }
    }
  }

  return Math.round(totalAmount * 100) / 100;
}

/**
 * Handler fuer monatliche Pachtzahlungen
 */
export class MonthlyLeaseHandler implements RuleHandler {
  readonly ruleType = BillingRuleType.LEASE_PAYMENT;

  validateParameters(parameters: unknown): parameters is LeasePaymentParameters {
    if (!parameters || typeof parameters !== "object") {
      return false;
    }

    const params = parameters as Record<string, unknown>;

    // Optionale Felder pruefen
    if (params.parkId !== undefined && typeof params.parkId !== "string") {
      return false;
    }
    if (params.year !== undefined && typeof params.year !== "number") {
      return false;
    }
    if (params.month !== undefined && typeof params.month !== "number") {
      return false;
    }
    if (params.useMinimumRent !== undefined && typeof params.useMinimumRent !== "boolean") {
      return false;
    }
    if (
      params.taxType !== undefined &&
      !["STANDARD", "REDUCED", "EXEMPT"].includes(params.taxType as string)
    ) {
      return false;
    }

    return true;
  }

  async preview(
    tenantId: string,
    parameters: BillingRuleParameters
  ): Promise<InvoiceCreationResult[]> {
    const params = parameters as LeasePaymentParameters;
    const results: InvoiceCreationResult[] = [];

    const now = new Date();
    const year = params.year || now.getFullYear();
    const month = params.month || now.getMonth() + 1;

    // Lade alle aktiven Pachtvertraege fuer diesen Tenant
    const leases = await prisma.lease.findMany({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        ...(params.parkId && {
          leasePlots: {
            some: {
              plot: {
                parkId: params.parkId,
              },
            },
          },
        }),
      },
      include: {
        lessor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            street: true,
            postalCode: true,
            city: true,
          },
        },
        leasePlots: {
          include: {
            plot: {
              include: {
                park: {
                  select: {
                    id: true,
                    name: true,
                    minimumRentPerTurbine: true,
                    weaSharePercentage: true,
                    poolSharePercentage: true,
                    wegCompensationPerSqm: true,
                    ausgleichCompensationPerSqm: true,
                    kabelCompensationPerM: true,
                  },
                },
                plotAreas: true,
              },
            },
          },
        },
      },
    });

    for (const lease of leases) {
      // Ermittle den Park (nehme den ersten gefundenen)
      const park = lease.leasePlots[0]?.plot?.park || null;

      // Calculate proration factor for partial months (Teilmonate)
      const prorationFactor = calculateProrationFactor(
        year,
        month,
        lease.startDate,
        lease.endDate
      );

      // Skip leases that are completely outside the billing month
      if (prorationFactor <= 0) {
        results.push({
          success: false,
          recipientName: lease.lessor.companyName ||
            `${lease.lessor.firstName} ${lease.lessor.lastName}`,
          amount: 0,
          error: "Pachtvertrag nicht aktiv in diesem Monat",
        });
        continue;
      }

      // Berechne den Pachbetrag (full month)
      const fullMonthAmount = calculateLeaseAmount(
        {
          id: lease.id,
          leasePlots: lease.leasePlots.map((lp) => ({
            plot: {
              id: lp.plot.id,
              areaSqm: lp.plot.areaSqm ? Number(lp.plot.areaSqm) : null,
              plotAreas: lp.plot.plotAreas.map((pa) => ({
                id: pa.id,
                areaType: pa.areaType,
                areaSqm: pa.areaSqm ? Number(pa.areaSqm) : null,
                lengthM: pa.lengthM ? Number(pa.lengthM) : null,
                compensationType: pa.compensationType,
                compensationFixedAmount: pa.compensationFixedAmount
                  ? Number(pa.compensationFixedAmount)
                  : null,
                compensationPercentage: pa.compensationPercentage
                  ? Number(pa.compensationPercentage)
                  : null,
              })),
            },
          })),
        },
        park
          ? {
              minimumRentPerTurbine: park.minimumRentPerTurbine
                ? Number(park.minimumRentPerTurbine)
                : null,
              weaSharePercentage: park.weaSharePercentage
                ? Number(park.weaSharePercentage)
                : null,
              poolSharePercentage: park.poolSharePercentage
                ? Number(park.poolSharePercentage)
                : null,
              wegCompensationPerSqm: park.wegCompensationPerSqm
                ? Number(park.wegCompensationPerSqm)
                : null,
              ausgleichCompensationPerSqm: park.ausgleichCompensationPerSqm
                ? Number(park.ausgleichCompensationPerSqm)
                : null,
              kabelCompensationPerM: park.kabelCompensationPerM
                ? Number(park.kabelCompensationPerM)
                : null,
            }
          : null,
        params.useMinimumRent ?? true
      );

      // Apply proration factor for partial months
      const amount = Math.round(fullMonthAmount * prorationFactor * 100) / 100;

      if (amount <= 0) {
        results.push({
          success: false,
          recipientName: lease.lessor.companyName ||
            `${lease.lessor.firstName} ${lease.lessor.lastName}`,
          amount: 0,
          error: "Berechneter Betrag ist 0 oder negativ",
        });
        continue;
      }

      // Formatiere Empfaenger-Name
      const recipientName =
        lease.lessor.companyName ||
        `${lease.lessor.firstName || ""} ${lease.lessor.lastName || ""}`.trim();

      results.push({
        success: true,
        recipientName,
        amount,
      });
    }

    return results;
  }

  async execute(
    tenantId: string,
    parameters: BillingRuleParameters,
    options: ExecuteRuleOptions
  ): Promise<ExecutionResult> {
    const params = parameters as LeasePaymentParameters;
    const invoiceResults: InvoiceCreationResult[] = [];

    const now = new Date();
    const year = params.year || now.getFullYear();
    const month = params.month || now.getMonth() + 1;

    // Dry-Run: Nur Vorschau
    if (options.dryRun) {
      const preview = await this.preview(tenantId, parameters);
      const successful = preview.filter((r) => r.success);
      const totalAmount = successful.reduce((sum, r) => sum + (r.amount || 0), 0);

      return {
        status: preview.every((r) => r.success) ? "success" : "partial",
        invoicesCreated: 0,
        totalAmount,
        details: {
          invoices: preview,
          summary: {
            totalProcessed: preview.length,
            successful: successful.length,
            failed: preview.filter((r) => !r.success).length,
            skipped: 0,
          },
        },
      };
    }

    // Lade alle aktiven Pachtvertraege
    const leases = await prisma.lease.findMany({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        ...(params.parkId && {
          leasePlots: {
            some: {
              plot: {
                parkId: params.parkId,
              },
            },
          },
        }),
      },
      include: {
        lessor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            street: true,
            postalCode: true,
            city: true,
          },
        },
        leasePlots: {
          include: {
            plot: {
              include: {
                park: {
                  select: {
                    id: true,
                    name: true,
                    minimumRentPerTurbine: true,
                    weaSharePercentage: true,
                    poolSharePercentage: true,
                    wegCompensationPerSqm: true,
                    ausgleichCompensationPerSqm: true,
                    kabelCompensationPerM: true,
                  },
                },
                plotAreas: true,
              },
            },
          },
        },
      },
    });

    let totalAmount = 0;
    const taxType = params.taxType || "EXEMPT"; // Pacht ist i.d.R. steuerfrei

    for (const lease of leases) {
      try {
        const park = lease.leasePlots[0]?.plot?.park || null;

        // Calculate proration factor for partial months (Teilmonate)
        const prorationFactor = calculateProrationFactor(
          year,
          month,
          lease.startDate,
          lease.endDate
        );

        // Skip leases that are completely outside the billing month
        if (prorationFactor <= 0) {
          invoiceResults.push({
            success: false,
            recipientName:
              lease.lessor.companyName ||
              `${lease.lessor.firstName} ${lease.lessor.lastName}`,
            amount: 0,
            error: "Pachtvertrag nicht aktiv in diesem Monat",
          });
          continue;
        }

        // Berechne Betrag (full month)
        const fullMonthAmount = calculateLeaseAmount(
          {
            id: lease.id,
            leasePlots: lease.leasePlots.map((lp) => ({
              plot: {
                id: lp.plot.id,
                areaSqm: lp.plot.areaSqm ? Number(lp.plot.areaSqm) : null,
                plotAreas: lp.plot.plotAreas.map((pa) => ({
                  id: pa.id,
                  areaType: pa.areaType,
                  areaSqm: pa.areaSqm ? Number(pa.areaSqm) : null,
                  lengthM: pa.lengthM ? Number(pa.lengthM) : null,
                  compensationType: pa.compensationType,
                  compensationFixedAmount: pa.compensationFixedAmount
                    ? Number(pa.compensationFixedAmount)
                    : null,
                  compensationPercentage: pa.compensationPercentage
                    ? Number(pa.compensationPercentage)
                    : null,
                })),
              },
            })),
          },
          park
            ? {
                minimumRentPerTurbine: park.minimumRentPerTurbine
                  ? Number(park.minimumRentPerTurbine)
                  : null,
                weaSharePercentage: park.weaSharePercentage
                  ? Number(park.weaSharePercentage)
                  : null,
                poolSharePercentage: park.poolSharePercentage
                  ? Number(park.poolSharePercentage)
                  : null,
                wegCompensationPerSqm: park.wegCompensationPerSqm
                  ? Number(park.wegCompensationPerSqm)
                  : null,
                ausgleichCompensationPerSqm: park.ausgleichCompensationPerSqm
                  ? Number(park.ausgleichCompensationPerSqm)
                  : null,
                kabelCompensationPerM: park.kabelCompensationPerM
                  ? Number(park.kabelCompensationPerM)
                  : null,
              }
            : null,
          params.useMinimumRent ?? true
        );

        // Apply proration factor for partial months
        const amount = Math.round(fullMonthAmount * prorationFactor * 100) / 100;

        if (amount <= 0) {
          invoiceResults.push({
            success: false,
            recipientName:
              lease.lessor.companyName ||
              `${lease.lessor.firstName} ${lease.lessor.lastName}`,
            amount: 0,
            error: "Berechneter Betrag ist 0 oder negativ",
          });
          continue;
        }

        const isPartialMonth = prorationFactor < 1;

        // Empfaenger-Adresse formatieren
        const recipientName =
          lease.lessor.companyName ||
          `${lease.lessor.firstName || ""} ${lease.lessor.lastName || ""}`.trim();
        const recipientAddress = [
          lease.lessor.street,
          `${lease.lessor.postalCode || ""} ${lease.lessor.city || ""}`.trim(),
        ]
          .filter(Boolean)
          .join("\n");

        // Leistungszeitraum - adjust for partial months
        const monthFirstDay = new Date(year, month - 1, 1);
        const monthLastDay = new Date(year, month, 0);
        const serviceStartDate = lease.startDate > monthFirstDay ? lease.startDate : monthFirstDay;
        const serviceEndDate = lease.endDate && lease.endDate < monthLastDay ? lease.endDate : monthLastDay;

        // Rechnungsnummer generieren
        const { number: invoiceNumber } = await getNextInvoiceNumber(
          tenantId,
          InvoiceType.INVOICE
        );

        // Steuerberechnung
        const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(
          amount,
          taxType
        );

        // Monatsname fuer Beschreibung
        const monthNames = [
          "Januar",
          "Februar",
          "Maerz",
          "April",
          "Mai",
          "Juni",
          "Juli",
          "August",
          "September",
          "Oktober",
          "November",
          "Dezember",
        ];

        // Build description - indicate partial month (Teilmonat) if prorated
        const baseDescription = `Pachtzahlung ${monthNames[month - 1]} ${year}`;
        const description = isPartialMonth
          ? `${baseDescription} (Teilmonat, ${Math.round(prorationFactor * 100)}%)`
          : baseDescription;

        // Rechnung erstellen
        const invoice = await prisma.invoice.create({
          data: {
            invoiceType: InvoiceType.INVOICE,
            invoiceNumber,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 Tage
            recipientType: "lessor",
            recipientName,
            recipientAddress,
            serviceStartDate,
            serviceEndDate,
            paymentReference: invoiceNumber,
            netAmount: amount,
            taxRate,
            taxAmount,
            grossAmount,
            status: "DRAFT",
            tenantId,
            leaseId: lease.id,
            parkId: park?.id,
            items: {
              create: [
                {
                  position: 1,
                  description,
                  quantity: 1,
                  unit: "pauschal",
                  unitPrice: amount,
                  netAmount: amount,
                  taxType: taxType as TaxType,
                  taxRate,
                  taxAmount,
                  grossAmount,
                  referenceType: "LEASE",
                  referenceId: lease.id,
                },
              ],
            },
          },
        });

        totalAmount += grossAmount;

        invoiceResults.push({
          success: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          recipientName,
          amount: grossAmount,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unbekannter Fehler";
        invoiceResults.push({
          success: false,
          recipientName:
            lease.lessor.companyName ||
            `${lease.lessor.firstName} ${lease.lessor.lastName}`,
          error: errorMessage,
        });
      }
    }

    const successful = invoiceResults.filter((r) => r.success);
    const failed = invoiceResults.filter((r) => !r.success);

    let status: "success" | "failed" | "partial";
    if (failed.length === 0) {
      status = "success";
    } else if (successful.length === 0) {
      status = "failed";
    } else {
      status = "partial";
    }

    return {
      status,
      invoicesCreated: successful.length,
      totalAmount,
      errorMessage:
        failed.length > 0
          ? `${failed.length} Rechnungen konnten nicht erstellt werden`
          : undefined,
      details: {
        invoices: invoiceResults,
        summary: {
          totalProcessed: invoiceResults.length,
          successful: successful.length,
          failed: failed.length,
          skipped: 0,
        },
      },
    };
  }
}

export const monthlyLeaseHandler = new MonthlyLeaseHandler();
