import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";

// =============================================================================
// GET /api/energy/scada/mappings/unmatched
// Aggregates unmapped PlantNos from recent ScadaImportLog errorDetails.
// Returns unique (locationCode, plantNo) pairs that have no active mapping.
// =============================================================================

interface UnmatchedPlant {
  locationCode: string;
  plantNo: number;
  lastSeen: string; // ISO date of the most recent import that reported this
  skippedRecords: number; // approximate count from error messages
}

export async function GET() {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    // Load recent import logs that had errors (last 100 logs with errorDetails)
    const logs = await prisma.scadaImportLog.findMany({
      where: {
        tenantId,
        recordsSkipped: { gt: 0 },
        errorDetails: { not: { equals: null } },
      },
      select: {
        locationCode: true,
        startedAt: true,
        recordsSkipped: true,
        errorDetails: true,
      },
      orderBy: { startedAt: "desc" },
      take: 200,
    });

    // Parse errorDetails to extract unmapped PlantNos
    // Error format: "Datei ...: PlantNo 3, 4 ohne Turbine-Mapping - Records übersprungen"
    const unmatchedMap = new Map<string, UnmatchedPlant>();
    const plantNoRegex = /PlantNo\s+([\d,\s]+)\s+ohne/;

    for (const log of logs) {
      if (!log.locationCode) continue;
      const errors = log.errorDetails as string[] | null;
      if (!errors || !Array.isArray(errors)) continue;

      for (const errMsg of errors) {
        const match = plantNoRegex.exec(errMsg);
        if (!match) continue;

        const plantNos = match[1]
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n) && n > 0);

        for (const plantNo of plantNos) {
          const key = `${log.locationCode}:${plantNo}`;
          const existing = unmatchedMap.get(key);
          if (!existing) {
            unmatchedMap.set(key, {
              locationCode: log.locationCode,
              plantNo,
              lastSeen: log.startedAt.toISOString(),
              skippedRecords: log.recordsSkipped,
            });
          }
        }
      }
    }

    // Filter out any that now have an active mapping
    const unmatchedEntries = Array.from(unmatchedMap.values());

    if (unmatchedEntries.length === 0) {
      return NextResponse.json({ data: [], count: 0 });
    }

    // Check which of these now have active mappings
    const activeMappings = await prisma.scadaTurbineMapping.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        OR: unmatchedEntries.map((e) => ({
          locationCode: e.locationCode,
          plantNo: e.plantNo,
        })),
      },
      select: {
        locationCode: true,
        plantNo: true,
      },
    });

    const mappedSet = new Set(
      activeMappings.map((m) => `${m.locationCode}:${m.plantNo}`),
    );

    // Only return truly unmatched entries
    const result = unmatchedEntries
      .filter((e) => !mappedSet.has(`${e.locationCode}:${e.plantNo}`))
      .sort((a, b) =>
        a.locationCode.localeCompare(b.locationCode) || a.plantNo - b.plantNo,
      );

    return NextResponse.json({ data: result, count: result.length });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Fehler beim Laden der nicht-zugeordneten Anlagen", details: errMsg },
      { status: 500 },
    );
  }
}
