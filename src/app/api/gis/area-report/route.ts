import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import ExcelJS from "exceljs";

const AREA_TYPE_LABELS: Record<string, string> = {
  WEA_STANDORT: "Turbinenstandort",
  POOL: "Pool",
  WEG: "Zuwegung",
  AUSGLEICH: "Ausgleichsfläche",
  KABEL: "Kabeltrasse",
};

// GET /api/gis/area-report?parkId=xxx
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId") || undefined;

    // Fetch plots with areas
    const plots = await prisma.plot.findMany({
      where: {
        tenantId: check.tenantId,
        ...(parkId ? { parkId } : {}),
      },
      include: {
        plotAreas: true,
        park: { select: { name: true, shortName: true } },
      },
      orderBy: [{ park: { name: "asc" } }, { cadastralDistrict: "asc" }, { plotNumber: "asc" }],
    });

    // Build Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WindparkManager";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Flächenreport");

    // Header
    sheet.columns = [
      { header: "Park", key: "park", width: 25 },
      { header: "Gemarkung", key: "district", width: 20 },
      { header: "Flur", key: "field", width: 10 },
      { header: "Flurstück-Nr.", key: "plot", width: 15 },
      { header: "Flächentyp", key: "type", width: 20 },
      { header: "Fläche (m²)", key: "areaSqm", width: 15 },
      { header: "Fläche (ha)", key: "areaHa", width: 15 },
      { header: "Anteil (%)", key: "pct", width: 12 },
    ];

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF335E99" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

    // Prevent Excel formula injection (CSV Injection / DDE attacks)
    function sanitize(val: string | null | undefined): string {
      if (!val) return "—";
      const s = String(val).trim();
      if (/^[=@+\-|]/.test(s)) return "'" + s;
      return s;
    }

    let totalAreaAll = 0;

    // Data rows
    for (const plot of plots) {
      const plotTotal = plot.areaSqm ? Number(plot.areaSqm) : 0;

      if (plot.plotAreas.length === 0) {
        sheet.addRow({
          park: sanitize(plot.park?.shortName || plot.park?.name),
          district: sanitize(plot.cadastralDistrict),
          field: sanitize(plot.fieldNumber),
          plot: sanitize(plot.plotNumber),
          type: "Keine Zuordnung",
          areaSqm: plotTotal,
          areaHa: plotTotal / 10000,
          pct: 100,
        });
        totalAreaAll += plotTotal;
      } else {
        for (const area of plot.plotAreas) {
          const areaSqmNum = area.areaSqm ? Number(area.areaSqm) : 0;
          const pct = plotTotal > 0 ? (areaSqmNum / plotTotal) * 100 : 0;
          sheet.addRow({
            park: sanitize(plot.park?.shortName || plot.park?.name),
            district: sanitize(plot.cadastralDistrict),
            field: sanitize(plot.fieldNumber),
            plot: sanitize(plot.plotNumber),
            type: AREA_TYPE_LABELS[area.areaType] ?? area.areaType,
            areaSqm: areaSqmNum,
            areaHa: areaSqmNum / 10000,
            pct: Math.round(pct * 100) / 100,
          });
          totalAreaAll += areaSqmNum;
        }
      }
    }

    // Summary row
    const summaryRow = sheet.addRow({
      park: "",
      district: "",
      field: "",
      plot: "GESAMT",
      type: "",
      areaSqm: totalAreaAll,
      areaHa: totalAreaAll / 10000,
      pct: "",
    });
    summaryRow.font = { bold: true };

    // Number format
    sheet.getColumn("areaSqm").numFmt = "#,##0";
    sheet.getColumn("areaHa").numFmt = "#,##0.0000";
    sheet.getColumn("pct").numFmt = "0.00";

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="flaechenreport-${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating area report");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen des Flächenreports" });
  }
}
