import { NextRequest, NextResponse } from "next/server";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { readWsdFile } from "@/lib/scada/dbf-reader";
import { apiLogger as logger } from "@/lib/logger";

// Max sample records to read from the first file
const MAX_SAMPLE_RECORDS = 500;

// =============================================================================
// POST /api/energy/scada/upload/preview
// Accepts multipart with files[] + locationCode, reads first WSD/UID file,
// extracts PlantNos + sample data, checks existing mappings.
// Returns { plants, allMapped, unmappedCount, totalPlants }
// =============================================================================

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const formData = await request.formData();
    const locationCode = formData.get("locationCode") as string | null;

    if (!locationCode || !locationCode.startsWith("Loc_")) {
      return NextResponse.json(
        { error: "locationCode ist erforderlich und muss mit 'Loc_' beginnen" },
        { status: 400 },
      );
    }

    // Collect uploaded files — prefer WSD, fallback to UID
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Keine Dateien hochgeladen" },
        { status: 400 },
      );
    }

    // Find first WSD or UID file
    const wsdFile = files.find((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "wsd";
    });
    const uidFile = files.find((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext === "uid";
    });
    const sampleFile = wsdFile ?? uidFile;

    if (!sampleFile) {
      return NextResponse.json(
        { error: "Keine WSD- oder UID-Datei unter den hochgeladenen Dateien gefunden" },
        { status: 400 },
      );
    }

    // Save sample file to temp directory
    tempDir = path.join(os.tmpdir(), "scada-preview", crypto.randomUUID());
    await fs.mkdir(tempDir, { recursive: true });

    const safeName = path.basename(sampleFile.name);
    const filePath = path.join(tempDir, safeName);
    const buffer = Buffer.from(await sampleFile.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Read the file to extract plant data
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

    try {
      const allRecords = await readWsdFile(filePath);
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
      logger.error(
        { err: error },
        `Fehler beim Lesen der Vorschau-Datei für ${locationCode}`,
      );
    }

    const sortedPlantNumbers = Array.from(plantStats.keys()).sort((a, b) => a - b);

    // Load existing mappings from database
    const mappings = await prisma.scadaTurbineMapping.findMany({
      where: {
        tenantId,
        locationCode,
        status: "ACTIVE",
      },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
      },
    });

    const mappingByPlantNo = new Map(
      mappings.map((m) => [m.plantNo, m] as const),
    );

    // Build result
    const plants = sortedPlantNumbers.map((plantNo) => {
      const stats = plantStats.get(plantNo);
      const mapping = mappingByPlantNo.get(plantNo);

      return {
        plantNo,
        sampleCount: stats?.count ?? 0,
        sampleWindSpeed:
          stats && stats.windSpeedCount > 0
            ? Math.round((stats.windSpeedSum / stats.windSpeedCount) * 100) / 100
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
      plants,
      allMapped: unmappedCount === 0 && totalPlants > 0,
      unmappedCount,
      totalPlants,
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Upload-Vorschau");
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Fehler beim Laden der Vorschau", details: errMsg },
      { status: 500 },
    );
  } finally {
    // Cleanup temp file
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
