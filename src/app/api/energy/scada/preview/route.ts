import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { scanLocation, readWsdFile } from "@/lib/scada/dbf-reader";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// POST /api/energy/scada/preview - Vorschau für einen SCADA-Standort
// Liest den ersten WSD-File eines Standorts und zeigt Beispieldaten + Mappings
// =============================================================================

/** Max. Anzahl Records die aus der ersten WSD-Datei gelesen werden */
const MAX_SAMPLE_RECORDS = 500;

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    const body = await request.json();
    const { basePath, locationCode } = body;

    // --- Validierung ---

    if (!basePath || typeof basePath !== "string") {
      return NextResponse.json(
        { error: "basePath ist erforderlich (z.B. 'C:\\Enercon')" },
        { status: 400 }
      );
    }

    if (!locationCode || typeof locationCode !== "string") {
      return NextResponse.json(
        { error: "locationCode ist erforderlich (z.B. 'Loc_5842')" },
        { status: 400 }
      );
    }

    if (!locationCode.startsWith("Loc_")) {
      return NextResponse.json(
        { error: "locationCode muss mit 'Loc_' beginnen (z.B. 'Loc_5842')" },
        { status: 400 }
      );
    }

    // Minimale Sicherheitsprüfung: Pfad darf keine gefaehrlichen Zeichen enthalten
    if (basePath.includes("..") || basePath.includes("\0")) {
      return NextResponse.json(
        { error: "Ungültiger Pfad: Relative Pfade und Null-Bytes sind nicht erlaubt" },
        { status: 400 }
      );
    }

    if (locationCode.includes("..") || locationCode.includes("\0")) {
      return NextResponse.json(
        { error: "Ungültiger locationCode" },
        { status: 400 }
      );
    }

    // --- Standort scannen ---

    const scanResults = await scanLocation(basePath, locationCode);

    // WSD-Scan-Ergebnis finden
    const wsdScan = scanResults.find((s) => s.fileType === "WSD");

    // Gesamte Dateianzahl und Dateitypen aus allen Scan-Ergebnissen
    let totalFileCount = 0;
    const fileTypes: string[] = [];
    let dateRangeFrom: Date | null = null;
    let dateRangeTo: Date | null = null;

    for (const scan of scanResults) {
      totalFileCount += scan.files.length;
      fileTypes.push(scan.fileType);

      if (scan.dateRange.from) {
        if (!dateRangeFrom || scan.dateRange.from < dateRangeFrom) {
          dateRangeFrom = scan.dateRange.from;
        }
      }
      if (scan.dateRange.to) {
        if (!dateRangeTo || scan.dateRange.to > dateRangeTo) {
          dateRangeTo = scan.dateRange.to;
        }
      }
    }

    // --- Erste WSD-Datei lesen (Beispieldaten) ---

    // Plant-Nummern aus dem Scan (Fallback falls keine WSD-Datei lesbar)
    const plantNumbersFromScan = wsdScan?.plantNumbers ?? [];

    // Aggregierte Daten pro Anlage: Anzahl Records, Summen für Durchschnitt
    const plantStats = new Map<
      number,
      {
        count: number;
        windSpeedSum: number;
        windSpeedCount: number;
        powerSum: number;
        powerCount: number;
      }
    >();

    if (wsdScan && wsdScan.files.length > 0) {
      try {
        const allRecords = await readWsdFile(wsdScan.files[0]);

        // Auf max. Anzahl begrenzen
        const sampleRecords = allRecords.slice(0, MAX_SAMPLE_RECORDS);

        for (const rec of sampleRecords) {
          let stats = plantStats.get(rec.plantNo);
          if (!stats) {
            stats = {
              count: 0,
              windSpeedSum: 0,
              windSpeedCount: 0,
              powerSum: 0,
              powerCount: 0,
            };
            plantStats.set(rec.plantNo, stats);
          }

          stats.count++;

          if (rec.windSpeedMs != null) {
            stats.windSpeedSum += rec.windSpeedMs;
            stats.windSpeedCount++;
          }

          if (rec.powerW != null) {
            stats.powerSum += rec.powerW;
            stats.powerCount++;
          }
        }
      } catch (error) {
        // Fehler beim Lesen der WSD-Datei - Vorschau trotzdem liefern
        logger.error(
          { err: error },
          `Fehler beim Lesen der WSD-Vorschaudatei für ${locationCode}`
        );
      }
    }

    // Alle Anlagen-Nummern: aus Sample-Daten und Scan zusammenfuehren
    const allPlantNumbers = new Set<number>(plantNumbersFromScan);
    for (const pn of Array.from(plantStats.keys())) {
      allPlantNumbers.add(pn);
    }
    const sortedPlantNumbers = Array.from(allPlantNumbers).sort(
      (a, b) => a - b
    );

    // --- Bestehende Mappings aus der Datenbank laden ---

    const mappings = await prisma.scadaTurbineMapping.findMany({
      where: {
        tenantId,
        locationCode,
        status: "ACTIVE",
      },
      include: {
        park: {
          select: {
            id: true,
            name: true,
          },
        },
        turbine: {
          select: {
            id: true,
            designation: true,
          },
        },
      },
    });

    // Mappings nach plantNo indexieren für schnellen Zugriff
    const mappingByPlantNo = new Map(
      mappings.map((m) => [m.plantNo, m] as const)
    );

    // --- Ergebnis zusammenbauen ---

    const plants = sortedPlantNumbers.map((plantNo) => {
      const stats = plantStats.get(plantNo);
      const mapping = mappingByPlantNo.get(plantNo);

      return {
        plantNo,
        sampleCount: stats?.count ?? 0,
        sampleWindSpeed:
          stats && stats.windSpeedCount > 0
            ? Math.round((stats.windSpeedSum / stats.windSpeedCount) * 100) /
              100
            : null,
        samplePower:
          stats && stats.powerCount > 0
            ? Math.round(stats.powerSum / stats.powerCount)
            : null,
        mapping: mapping
          ? {
              id: mapping.id,
              turbineId: mapping.turbineId,
              turbineDesignation: mapping.turbine.designation,
              parkId: mapping.parkId,
              parkName: mapping.park.name,
            }
          : null,
      };
    });

    const unmappedCount = plants.filter((p) => p.mapping === null).length;
    const totalPlants = plants.length;

    return NextResponse.json({
      locationCode,
      fileCount: totalFileCount,
      fileTypes,
      dateRange: {
        from: dateRangeFrom,
        to: dateRangeTo,
      },
      plants,
      allMapped: unmappedCount === 0 && totalPlants > 0,
      unmappedCount,
      totalPlants,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Vorschau");

    // Spezifische Fehlerbehandlung für Dateisystem-Fehler
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return NextResponse.json(
        {
          error:
            "Verzeichnis nicht gefunden: Der angegebene Pfad oder Standort existiert nicht",
        },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes("EACCES")) {
      return NextResponse.json(
        {
          error:
            "Zugriff verweigert: Keine Leseberechtigung für das Verzeichnis",
        },
        { status: 403 }
      );
    }

    if (
      error instanceof Error &&
      error.message.includes("Standort-Verzeichnis nicht gefunden")
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Fehler beim Laden der SCADA-Vorschau" },
      { status: 500 }
    );
  }
}
