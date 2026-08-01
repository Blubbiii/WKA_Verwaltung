/**
 * GET /api/regulatory/capacity-by-municipality?year=YYYY[&format=csv]
 *
 * Installierte Leistung je Gemeinde — Grundlage für die Zerlegung des
 * Gewerbesteuermessbetrags nach § 29 Abs. 1 Nr. 2 GewStG.
 *
 * Diese Auswertung rechnet KEINE Steuer: weder Messbetrag noch
 * Zerlegungsanteil, weder Hebesatz noch Steuermesszahl. Die Zerlegung macht
 * der Steuerberater; hier entsteht die Grundlage, die er dafür braucht. Die
 * Arbeitslohn-Komponente (10 %) steht ohnehin nicht im System.
 *
 * Das CSV ist für die Weitergabe gedacht. Es trägt die Vorbehalte im Kopf mit
 * — ein Blatt, das nur Zahlen enthält, wird als geprüfte Grundlage gelesen,
 * auch wenn die Hälfte der Anlagen keiner Gemeinde zugeordnet ist.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import {
  capacityByMunicipality,
  type TurbineForSplit,
} from "@/lib/regulatory/capacity-by-municipality";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const parsedYear = Number.parseInt(
      searchParams.get("year") ?? String(new Date().getFullYear()),
      10,
    );
    if (!Number.isFinite(parsedYear) || parsedYear < 1990 || parsedYear > 2100) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültiges Jahr",
      });
    }

    const turbines = await prisma.turbine.findMany({
      where: {
        park: { tenantId: check.tenantId },
        // NUR echte Windkraftanlagen.
        //
        // `Turbine` traegt auch die virtuelle Infrastruktur, die POST
        // /api/parks zu jedem Park anlegt: Netzverknuepfungspunkt und
        // Parkrechner. Ohne diese Einschraenkung stehen sie in der Auswertung
        // als „Anlage ohne Standortgemeinde" — und loesen die Warnung aus, die
        // ausgewiesenen Anteile seien zu hoch. Sie sind keine Betriebsstaette
        // im Sinn des § 29 GewStG und haben keine Nennleistung.
        //
        // Aufgefallen an der Antwort der Produktionsinstanz, nicht im Test:
        // die Testdaten hatten noch keine Parks mit Infrastruktur.
        deviceType: "WEA",
      },
      select: {
        id: true,
        designation: true,
        ratedPowerKw: true,
        commissioningDate: true,
        status: true,
        municipalityId: true,
        park: { select: { name: true } },
        municipalityRef: { select: { name: true, officialKey: true } },
      },
      orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
    });

    const input: TurbineForSplit[] = turbines.map((t) => ({
      id: t.id,
      designation: t.designation,
      parkName: t.park.name,
      ratedPowerKw: t.ratedPowerKw === null ? null : Number(t.ratedPowerKw),
      municipalityId: t.municipalityId,
      municipalityName: t.municipalityRef?.name ?? null,
      officialKey: t.municipalityRef?.officialKey ?? null,
      commissioningDate: t.commissioningDate,
      isActive: t.status === "ACTIVE",
    }));

    const result = capacityByMunicipality(input, parsedYear);

    logger.info(
      {
        tenantId: check.tenantId,
        year: parsedYear,
        municipalities: result.rows.length,
        unassigned: result.withoutMunicipality.length,
      },
      "Leistung je Gemeinde ermittelt",
    );

    if (searchParams.get("format") === "csv") {
      return csvResponse(result);
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "Leistung je Gemeinde fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "Auswertung konnte nicht erstellt werden",
    });
  }
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvResponse(
  result: ReturnType<typeof capacityByMunicipality>,
): NextResponse {
  const lines: string[] = [];

  // Die Vorbehalte stehen VOR den Zahlen. Wer die Datei oeffnet, soll sie
  // sehen, bevor er die Anteile abliest — nicht darunter, wo sie beim
  // Ausdrucken auf Seite 2 landen.
  lines.push(`Leistung je Gemeinde — Erhebungszeitraum ${result.year}`);
  lines.push(
    "Grundlage fuer die Zerlegung nach § 29 Abs. 1 Nr. 2 GewStG (90 % Leistung / 10 % Arbeitsloehne).",
  );
  lines.push(
    "Diese Datei enthaelt KEINE Steuerberechnung: kein Messbetrag, kein Zerlegungsanteil, kein Hebesatz.",
  );
  lines.push("");
  if (result.warnings.length > 0) {
    lines.push("VORBEHALTE");
    for (const w of result.warnings) lines.push(csvCell(w));
    lines.push("");
  }

  lines.push(
    [
      "Gemeinde",
      "Amtlicher Gemeindeschluessel",
      "Anlagen",
      "Installierte Leistung (kW)",
      "Anteil an zugeordneter Leistung (%)",
    ].join(";"),
  );
  for (const row of result.rows) {
    lines.push(
      [
        csvCell(row.municipalityName),
        csvCell(row.officialKey ?? ""),
        row.turbineCount,
        csvCell(row.totalRatedPowerKw.toFixed(2).replace(".", ",")),
        csvCell((row.shareOfAssigned * 100).toFixed(4).replace(".", ",")),
      ].join(";"),
    );
  }
  lines.push("");
  lines.push(
    [
      csvCell("Summe zugeordnet"),
      "",
      result.rows.reduce((s, r) => s + r.turbineCount, 0),
      csvCell(result.assignedRatedPowerKw.toFixed(2).replace(".", ",")),
      csvCell("100,0000"),
    ].join(";"),
  );

  if (result.withoutMunicipality.length > 0) {
    lines.push("");
    lines.push("NICHT ZUGEORDNETE ANLAGEN (in keiner Zeile oben enthalten)");
    lines.push(["Park", "Anlage"].join(";"));
    for (const t of result.withoutMunicipality) {
      lines.push([csvCell(t.parkName), csvCell(t.designation)].join(";"));
    }
  }

  // BOM, damit Excel die Umlaute erkennt.
  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="leistung-je-gemeinde-${result.year}.csv"`,
    },
  });
}
