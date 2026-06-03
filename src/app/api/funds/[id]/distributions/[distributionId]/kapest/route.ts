/**
 * GET /api/funds/[id]/distributions/[distributionId]/kapest
 *
 * F-3 Wire-up: KapESt-Beiblatt für eine Ausschüttung (§44a EStG).
 *
 * Berechnet pro Gesellschafter:
 *   - Brutto-Ausschüttung
 *   - Kapitalertragsteuer (25%)
 *   - Solidaritätszuschlag (5,5% auf KapESt)
 *   - Kirchensteuer (8/9% auf KapESt, optional)
 *   - Netto-Auszahlung
 *
 * Query-Params:
 *   - kirchensteuerRate: globaler KiSt-Satz für alle Gesellschafter (default 0)
 *   - freibetragPerShareholder: globaler Freibetrag (default 1000 €)
 *
 * Diese Berechnung dient als BEIBLATT zur Anmeldung — sie wird nicht
 * automatisch von der Ausschüttung abgezogen. Die tatsächliche Buchung
 * + Anmeldung an das Finanzamt erfolgt manuell.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { computeKapESt, buildKapEStLeaflet } from "@/lib/accounting/kapesta-calculator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; distributionId: string }> },
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id: fundId, distributionId } = await params;
    const { searchParams } = new URL(request.url);
    const kirchensteuerRate = Math.max(
      0,
      Math.min(parseFloat(searchParams.get("kirchensteuerRate") ?? "0") || 0, 0.09),
    );
    const freibetragPerShareholder = Math.max(
      0,
      parseFloat(searchParams.get("freibetragPerShareholder") ?? "1000") || 0,
    );

    const distribution = await prisma.distribution.findFirst({
      where: {
        id: distributionId,
        fundId,
        tenantId: check.tenantId,
      },
      select: {
        id: true,
        distributionNumber: true,
        distributionDate: true,
        totalAmount: true,
        status: true,
        items: {
          select: {
            id: true,
            amount: true,
            percentage: true,
            shareholder: {
              select: {
                id: true,
                shareholderNumber: true,
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
        fund: { select: { name: true } },
      },
    });

    if (!distribution) {
      return apiError("NOT_FOUND", 404, { message: "Ausschüttung nicht gefunden" });
    }

    // KapESt-Pflicht: nur bei natürlichen Personen (personType === "natural").
    // Bei juristischen Personen (companyName ohne natural-Person) entfällt KapESt.
    const rows = distribution.items.map((item) => {
      const isNatural = item.shareholder.person.personType === "natural";
      const amount = Number(item.amount);
      const name =
        item.shareholder.person.companyName ||
        `${item.shareholder.person.firstName ?? ""} ${item.shareholder.person.lastName ?? ""}`.trim() ||
        "Unbekannt";

      // Bei juristischen Personen: KapESt = 0 (keine Pflicht, da §44a EStG nur natürliche)
      const kapest = isNatural
        ? computeKapESt({
            grossAmount: amount,
            freibetragRemaining: freibetragPerShareholder,
            kirchensteuerRate,
          })
        : computeKapESt({ grossAmount: amount, freibetragRemaining: amount, kirchensteuerRate: 0 });

      return {
        shareholderName: name,
        shareholderId: item.shareholder.id,
        grossAmount: amount,
        kapest,
      };
    });

    const leaflet = buildKapEStLeaflet(rows);

    logger.info(
      {
        tenantId: check.tenantId,
        distributionId,
        rowCount: leaflet.rows.length,
        totalDeducted: leaflet.totals.totalDeducted,
      },
      "KapESt-Beiblatt generiert",
    );

    return NextResponse.json({
      distribution: {
        id: distribution.id,
        number: distribution.distributionNumber,
        date: distribution.distributionDate.toISOString(),
        fund: distribution.fund.name,
        totalAmount: Number(distribution.totalAmount),
        status: distribution.status,
      },
      settings: {
        kirchensteuerRate,
        freibetragPerShareholder,
        kapestRate: 0.25,
        soliRate: 0.055,
      },
      ...leaflet,
    });
  } catch (error) {
    logger.error({ err: error }, "KapESt-Beiblatt fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "KapESt-Beiblatt fehlgeschlagen" });
  }
}
