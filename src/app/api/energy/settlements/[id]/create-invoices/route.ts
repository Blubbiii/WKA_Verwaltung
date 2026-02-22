import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getNextInvoiceNumber, calculateTaxAmounts } from "@/lib/invoices/numberGenerator";
import { Decimal } from "@prisma/client/runtime/library";
import { TaxType } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// POST /api/energy/settlements/[id]/create-invoices - Gutschriften erstellen
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("energy:settlements:finalize");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Lade Settlement mit Items und verknuepften Daten
    const settlement = await prisma.energySettlement.findUnique({
      where: { id },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
        items: {
          include: {
            recipientFund: {
              select: {
                id: true,
                name: true,
                fundCategory: { select: { id: true, name: true, code: true, color: true } },
                legalForm: true,
                address: true,
                bankDetails: true,
              },
            },
            turbine: {
              select: {
                id: true,
                designation: true,
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
              },
            },
          },
        },
      },
    });

    if (!settlement) {
      return NextResponse.json(
        { error: "Stromabrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant-Check
    if (settlement.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Status-Check: Nur CALCULATED kann zu INVOICED werden
    if (settlement.status !== "CALCULATED") {
      return NextResponse.json(
        {
          error: "Gutschriften koennen nur aus berechneten Abrechnungen erstellt werden",
          details: `Aktuelle Status: ${settlement.status}. Fuehre zuerst die Berechnung durch.`,
        },
        { status: 400 }
      );
    }

    // Pruefe ob bereits Gutschriften existieren
    const existingInvoices = settlement.items.filter((item) => item.invoice !== null);
    if (existingInvoices.length > 0) {
      return NextResponse.json(
        {
          error: "Es existieren bereits Gutschriften fuer diese Abrechnung",
          details: `${existingInvoices.length} von ${settlement.items.length} Items haben bereits Gutschriften.`,
        },
        { status: 400 }
      );
    }

    // Items ohne Empfaenger-Fund pruefen
    const itemsWithoutFund = settlement.items.filter((item) => !item.recipientFundId);
    if (itemsWithoutFund.length > 0) {
      return NextResponse.json(
        {
          error: "Nicht alle Items haben einen Empfaenger",
          details: `${itemsWithoutFund.length} Items ohne Empfaenger-Gesellschaft.`,
        },
        { status: 400 }
      );
    }

    // Periodenbezeichnung fuer Gutschriften
    const periodLabel = settlement.month
      ? `${settlement.month.toString().padStart(2, "0")}/${settlement.year}`
      : `${settlement.year}`;

    // Leistungszeitraum berechnen
    const serviceStartDate = settlement.month
      ? new Date(settlement.year, settlement.month - 1, 1)
      : new Date(settlement.year, 0, 1);
    const serviceEndDate = settlement.month
      ? new Date(settlement.year, settlement.month, 0) // Letzter Tag des Monats
      : new Date(settlement.year, 11, 31);

    // EEG/DV-Aufschluesselung pruefen
    const totalRevenue = Number(settlement.netOperatorRevenueEur);
    const eegRevenue = settlement.eegRevenueEur ? Number(settlement.eegRevenueEur) : null;
    const dvRevenue = settlement.dvRevenueEur ? Number(settlement.dvRevenueEur) : null;
    const eegProduction = settlement.eegProductionKwh ? Number(settlement.eegProductionKwh) : null;
    const dvProduction = settlement.dvProductionKwh ? Number(settlement.dvProductionKwh) : null;
    const hasEegDvSplit = eegRevenue !== null || dvRevenue !== null;

    // MwSt-Saetze aus EnergyRevenueType laden
    let eegTaxRate = 19; // Default: 19% MwSt fuer EEG
    let dvTaxRate = 0;   // Default: 0% MwSt fuer DV/Marktpraemie
    let eegTaxType: TaxType = "STANDARD";
    let dvTaxType: TaxType = "EXEMPT";

    if (hasEegDvSplit) {
      const revenueTypes = await prisma.energyRevenueType.findMany({
        where: {
          tenantId: check.tenantId!,
          isActive: true,
          code: { in: ["EEG", "MARKTPRAEMIE"] },
        },
        select: { code: true, taxRate: true, hasTax: true },
      });

      for (const rt of revenueTypes) {
        if (rt.code === "EEG") {
          eegTaxRate = rt.hasTax ? Number(rt.taxRate ?? 19) : 0;
          eegTaxType = eegTaxRate === 0 ? "EXEMPT" : eegTaxRate === 7 ? "REDUCED" : "STANDARD";
        } else if (rt.code === "MARKTPRAEMIE") {
          dvTaxRate = rt.hasTax ? Number(rt.taxRate ?? 0) : 0;
          dvTaxType = dvTaxRate === 0 ? "EXEMPT" : dvTaxRate === 7 ? "REDUCED" : "STANDARD";
        }
      }
    }

    // Erstelle Gutschriften in einer Transaktion
    const createdInvoices: {
      itemId: string;
      invoiceId: string;
      invoiceNumber: string;
      recipientFund: string;
      amount: number;
    }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const item of settlement.items) {
        if (!item.recipientFund) continue;

        const revenueEur = Number(item.revenueShareEur);
        const productionKwh = Number(item.productionShareKwh);

        // Generiere Gutschriftsnummer
        const { number: invoiceNumber } = await getNextInvoiceNumber(
          check.tenantId!,
          "CREDIT_NOTE"
        );

        // Empfaengeradresse aus Fund
        const recipientAddress = item.recipientFund.address || "";
        const recipientName = item.recipientFund.name;

        // Build invoice items based on EEG/DV split
        const invoiceItems: Array<{
          position: number;
          description: string;
          quantity: Decimal;
          unit: string;
          unitPrice: Decimal;
          netAmount: Decimal;
          taxType: TaxType;
          taxRate: Decimal;
          taxAmount: Decimal;
          grossAmount: Decimal;
          referenceType: string;
          referenceId: string;
        }> = [];

        let totalNet = 0;
        let totalTax = 0;
        let totalGross = 0;
        let position = 0;

        if (hasEegDvSplit && totalRevenue > 0) {
          // Split into separate EEG and DV positions

          // EEG position
          if (eegRevenue && eegRevenue > 0) {
            const eegShare = revenueEur * (eegRevenue / totalRevenue);
            const eegProdShare = eegProduction
              ? productionKwh * (eegProduction / Number(settlement.totalProductionKwh))
              : productionKwh * (eegRevenue / totalRevenue);

            if (eegShare > 0.01) {
              position++;
              const eegTax = calculateTaxAmounts(eegShare, eegTaxType);
              const eegDesc = item.turbine
                ? `Stromerloes EEG ${periodLabel} - ${settlement.park.name} - WKA ${item.turbine.designation}`
                : `Stromerloes EEG ${periodLabel} - ${settlement.park.name}`;

              invoiceItems.push({
                position,
                description: eegDesc,
                quantity: new Decimal(eegProdShare.toFixed(3)),
                unit: "kWh",
                unitPrice: new Decimal((eegShare / eegProdShare).toFixed(6)),
                netAmount: new Decimal(eegShare.toFixed(2)),
                taxType: eegTaxType,
                taxRate: new Decimal(eegTax.taxRate),
                taxAmount: new Decimal(eegTax.taxAmount.toFixed(2)),
                grossAmount: new Decimal(eegTax.grossAmount.toFixed(2)),
                referenceType: "ENERGY_SETTLEMENT",
                referenceId: settlement.id,
              });

              totalNet += eegShare;
              totalTax += eegTax.taxAmount;
              totalGross += eegTax.grossAmount;
            }
          }

          // DV/Marktpraemie position
          if (dvRevenue && dvRevenue > 0) {
            const dvShare = revenueEur * (dvRevenue / totalRevenue);
            const dvProdShare = dvProduction
              ? productionKwh * (dvProduction / Number(settlement.totalProductionKwh))
              : productionKwh * (dvRevenue / totalRevenue);

            if (dvShare > 0.01) {
              position++;
              const dvTax = calculateTaxAmounts(dvShare, dvTaxType);
              const dvDesc = item.turbine
                ? `Stromerloes Marktpraemie ${periodLabel} - ${settlement.park.name} - WKA ${item.turbine.designation}`
                : `Stromerloes Marktpraemie ${periodLabel} - ${settlement.park.name}`;

              invoiceItems.push({
                position,
                description: dvDesc,
                quantity: new Decimal(dvProdShare.toFixed(3)),
                unit: "kWh",
                unitPrice: new Decimal((dvShare / dvProdShare).toFixed(6)),
                netAmount: new Decimal(dvShare.toFixed(2)),
                taxType: dvTaxType,
                taxRate: new Decimal(dvTax.taxRate),
                taxAmount: new Decimal(dvTax.taxAmount.toFixed(2)),
                grossAmount: new Decimal(dvTax.grossAmount.toFixed(2)),
                referenceType: "ENERGY_SETTLEMENT",
                referenceId: settlement.id,
              });

              totalNet += dvShare;
              totalTax += dvTax.taxAmount;
              totalGross += dvTax.grossAmount;
            }
          }

          // Rundungskorrektur: Netto-Summe muss = revenueShareEur sein
          const netDiff = revenueEur - totalNet;
          if (Math.abs(netDiff) > 0.001 && invoiceItems.length > 0) {
            const firstItem = invoiceItems[0];
            const correctedNet = Number(firstItem.netAmount) + netDiff;
            const corrTax = calculateTaxAmounts(correctedNet, firstItem.taxType);
            const oldGross = Number(firstItem.grossAmount);

            firstItem.netAmount = new Decimal(correctedNet.toFixed(2));
            firstItem.taxAmount = new Decimal(corrTax.taxAmount.toFixed(2));
            firstItem.grossAmount = new Decimal(corrTax.grossAmount.toFixed(2));

            totalNet += netDiff;
            totalTax += corrTax.taxAmount - (Number(firstItem.taxAmount));
            totalGross += corrTax.grossAmount - oldGross;
          }
        } else {
          // No EEG/DV split - single position (legacy behavior)
          position = 1;
          const taxType: TaxType = "EXEMPT";
          const { taxRate, taxAmount, grossAmount } = calculateTaxAmounts(revenueEur, taxType);

          const description = item.turbine
            ? `Stromerloes ${periodLabel} - ${settlement.park.name} - WKA ${item.turbine.designation}`
            : `Stromerloes ${periodLabel} - ${settlement.park.name}`;

          invoiceItems.push({
            position,
            description,
            quantity: new Decimal(productionKwh),
            unit: "kWh",
            unitPrice: new Decimal((revenueEur / productionKwh).toFixed(6)),
            netAmount: new Decimal(revenueEur),
            taxType,
            taxRate: new Decimal(taxRate),
            taxAmount: new Decimal(taxAmount),
            grossAmount: new Decimal(grossAmount),
            referenceType: "ENERGY_SETTLEMENT",
            referenceId: settlement.id,
          });

          totalNet = revenueEur;
          totalTax = taxAmount;
          totalGross = grossAmount;
        }

        // Erstelle Gutschrift mit allen Positionen
        const invoice = await tx.invoice.create({
          data: {
            invoiceType: "CREDIT_NOTE",
            invoiceNumber,
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 Tage Zahlungsziel
            recipientType: "fund",
            recipientName,
            recipientAddress,
            serviceStartDate,
            serviceEndDate,
            paymentReference: `Strom-${settlement.park.shortName || settlement.park.name}-${periodLabel}`,
            netAmount: new Decimal(totalNet.toFixed(2)),
            taxRate: new Decimal(0),
            taxAmount: new Decimal(totalTax.toFixed(2)),
            grossAmount: new Decimal(totalGross.toFixed(2)),
            currency: "EUR",
            status: "DRAFT",
            notes: `Automatisch erstellt aus Stromabrechnung ${settlement.id}`,
            tenantId: check.tenantId!,
            createdById: check.userId,
            fundId: item.recipientFundId,
            parkId: settlement.parkId,
            items: {
              create: invoiceItems.map((ii) => ({
                position: ii.position,
                description: ii.description,
                quantity: ii.quantity,
                unit: ii.unit,
                unitPrice: ii.unitPrice,
                netAmount: ii.netAmount,
                taxType: ii.taxType,
                taxRate: ii.taxRate,
                taxAmount: ii.taxAmount,
                grossAmount: ii.grossAmount,
                referenceType: ii.referenceType,
                referenceId: ii.referenceId,
              })),
            },
          },
          select: {
            id: true,
            invoiceNumber: true,
          },
        });

        // Verknuepfe Invoice mit EnergySettlementItem
        await tx.energySettlementItem.update({
          where: { id: item.id },
          data: { invoiceId: invoice.id },
        });

        createdInvoices.push({
          itemId: item.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          recipientFund: item.recipientFund.name,
          amount: totalGross,
        });
      }

      // Update Settlement Status auf INVOICED
      await tx.energySettlement.update({
        where: { id },
        data: { status: "INVOICED" },
      });

      // M6: TurbineProduction Status-Transition DRAFT -> INVOICED
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const productionWhere: any = {
        tenantId: check.tenantId!,
        year: settlement.year,
        status: { in: ["DRAFT", "CONFIRMED"] },
        turbine: {
          parkId: settlement.parkId,
        },
      };

      if (settlement.month !== null && settlement.month !== 0) {
        productionWhere.month = settlement.month;
      }

      await tx.turbineProduction.updateMany({
        where: productionWhere,
        data: {
          status: "INVOICED",
        },
      });
    });

    // Lade aktualisiertes Settlement
    const updatedSettlement = await prisma.energySettlement.findUnique({
      where: { id },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
        items: {
          include: {
            recipientFund: {
              select: {
                id: true,
                name: true,
                fundCategory: { select: { id: true, name: true, code: true, color: true } },
              },
            },
            turbine: {
              select: {
                id: true,
                designation: true,
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                status: true,
                grossAmount: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Berechne Summen
    const totalAmount = createdInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    return NextResponse.json({
      message: `${createdInvoices.length} Gutschriften erfolgreich erstellt`,
      settlement: updatedSettlement,
      invoices: createdInvoices,
      summary: {
        count: createdInvoices.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        period: periodLabel,
        park: settlement.park.name,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error creating invoices from settlement");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Gutschriften" },
      { status: 500 }
    );
  }
}
