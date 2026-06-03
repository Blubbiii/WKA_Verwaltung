/**
 * GET /api/funds/[id]/distributions/[distributionId]/kapest/pdf
 *
 * F-3 Wire-up: KapESt-Beiblatt als PDF (§44a EStG / §45a EStG).
 *
 * Berechnet die KapESt-Tabelle (wie der JSON-Endpoint) und liefert sie als
 * PDF-Buffer (Landscape A4). Verwendet die selben Query-Params:
 *   - kirchensteuerRate (default 0)
 *   - freibetragPerShareholder (default 1000 €)
 */

import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  computeKapESt,
  buildKapEStLeaflet,
} from "@/lib/accounting/kapesta-calculator";
import { generateKapEStPdf } from "@/lib/pdf/generators/kapestPdf";

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

    const [distribution, tenant] = await Promise.all([
      prisma.distribution.findFirst({
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
      }),
      prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { name: true },
      }),
    ]);

    if (!distribution) {
      return apiError("NOT_FOUND", 404, { message: "Ausschüttung nicht gefunden" });
    }

    // KapESt-Pflicht: nur bei natürlichen Personen (personType === "natural").
    const rows = distribution.items.map((item) => {
      const isNatural = item.shareholder.person.personType === "natural";
      const amount = Number(item.amount);
      const name =
        item.shareholder.person.companyName ||
        `${item.shareholder.person.firstName ?? ""} ${item.shareholder.person.lastName ?? ""}`.trim() ||
        "Unbekannt";

      const kapest = isNatural
        ? computeKapESt({
            grossAmount: amount,
            freibetragRemaining: freibetragPerShareholder,
            kirchensteuerRate,
          })
        : computeKapESt({
            grossAmount: amount,
            freibetragRemaining: amount,
            kirchensteuerRate: 0,
          });

      return {
        shareholderName: name,
        shareholderId: item.shareholder.id,
        grossAmount: amount,
        kapest,
      };
    });

    const leaflet = buildKapEStLeaflet(rows);

    // Build PDF-row format (flattened from KapEStResult)
    const pdfRows = leaflet.rows.map((r) => ({
      shareholderName: r.shareholderName,
      shareholderId: r.shareholderId,
      grossAmount: r.kapest.grossAmount,
      freibetragApplied: r.kapest.freibetragApplied,
      taxableAmount: r.kapest.taxableAmount,
      kapestAmount: r.kapest.kapestAmount,
      soliAmount: r.kapest.soliAmount,
      kirchensteuerAmount: r.kapest.kirchensteuerAmount,
      totalDeducted: r.kapest.totalDeducted,
      netPayout: r.kapest.netPayout,
    }));

    const freibetragTotal = pdfRows.reduce(
      (sum, r) => sum + r.freibetragApplied,
      0,
    );
    const taxableTotal = pdfRows.reduce((sum, r) => sum + r.taxableAmount, 0);

    const buffer = await generateKapEStPdf({
      companyName: tenant?.name ?? "Mandant",
      fundName: distribution.fund.name,
      distributionNumber: distribution.distributionNumber,
      distributionDate: distribution.distributionDate.toISOString(),
      grossTotal: Number(distribution.totalAmount),
      kapestRate: 0.25,
      soliRate: 0.055,
      kirchensteuerRate,
      freibetragPerShareholder,
      rows: pdfRows,
      totals: {
        grossTotal: leaflet.totals.grossTotal,
        freibetragTotal: Math.round(freibetragTotal * 100) / 100,
        taxableTotal: Math.round(taxableTotal * 100) / 100,
        kapestTotal: leaflet.totals.kapestTotal,
        soliTotal: leaflet.totals.soliTotal,
        kirchensteuerTotal: leaflet.totals.kirchensteuerTotal,
        totalDeducted: leaflet.totals.totalDeducted,
        netPayoutTotal: leaflet.totals.netPayoutTotal,
      },
    });

    logger.info(
      {
        tenantId: check.tenantId,
        distributionId,
        rowCount: pdfRows.length,
        totalDeducted: leaflet.totals.totalDeducted,
      },
      "KapESt-Beiblatt PDF generiert",
    );

    const filename = `KapESt_${distribution.distributionNumber}_${distribution.distributionDate.toISOString().slice(0, 10)}.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "KapESt-Beiblatt PDF fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "KapESt-Beiblatt PDF fehlgeschlagen",
    });
  }
}
