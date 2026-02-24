import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/energy/productions/sample-csv
// Generates a sample CSV with actual turbines for the current tenant (production data only)
export async function GET() {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    // Load tenant turbines
    const turbines = await prisma.turbine.findMany({
      where: { park: { tenantId: check.tenantId! }, status: "ACTIVE" },
      select: { designation: true },
      orderBy: { designation: "asc" },
      take: 10,
    });

    if (turbines.length === 0) {
      return NextResponse.json(
        { error: "Keine Anlagen gefunden. Bitte legen Sie zuerst Anlagen an." },
        { status: 404 }
      );
    }

    // Realistic monthly production pattern (relative factors, winter=high, summer=low)
    const monthlyFactors = [0.85, 0.92, 0.88, 0.65, 0.55, 0.48, 0.42, 0.52, 0.68, 0.82, 0.90, 0.95];
    const baseProduction = 250000; // kWh base for an average turbine
    const baseHours = 720; // approx hours per month

    const lines: string[] = [];
    lines.push("WKA-Nr;Anlage;Jahr;Monat;Produktion_kWh;Betriebsstunden;Verfügbarkeit_Pct;Bemerkungen");

    // Use up to 3 turbines for the example
    const sampleTurbines = turbines.slice(0, 3);

    // 12 months for each turbine
    for (const turbine of sampleTurbines) {
      for (let month = 1; month <= 12; month++) {
        const factor = monthlyFactors[month - 1];
        // Add slight variation per turbine
        const variation = 0.95 + Math.random() * 0.1;
        const production = Math.round(baseProduction * factor * variation);

        // Operating hours: scale with production factor
        const hours = Math.round(baseHours * factor * (0.98 + Math.random() * 0.04));

        // Availability: typically 95-99.5%
        const availability = (95 + Math.random() * 4.5).toFixed(1);

        // Add occasional remarks
        let remark = "";
        if (month === 3) remark = "Wartung durchgeführt";
        if (month === 8 && turbine === sampleTurbines[0])
          remark = "Kurzzeitige Abschaltung wg. Fledermausschutz";

        lines.push(
          `${turbine.designation};${turbine.designation};2024;${month};${production};${hours};${availability};${remark}`
        );
      }
    }

    const csvContent = lines.join("\n") + "\n";

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=einspeisedaten_beispiel.csv",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating sample CSV");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Beispiel-CSV" },
      { status: 500 }
    );
  }
}
