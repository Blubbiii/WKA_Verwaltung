import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { runAnomalyDetection } from "@/lib/scada/anomaly-detection";
import { Prisma } from "@prisma/client";
import { parsePaginationParams } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/scada/anomalies - List anomalies with filters
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const parkId = searchParams.get("parkId");
    const type = searchParams.get("type");
    const severity = searchParams.get("severity");
    const acknowledged = searchParams.get("acknowledged");
    const resolved = searchParams.get("resolved");

    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50, maxLimit: 200 });

    // Build where clause
    const where: Prisma.ScadaAnomalyWhereInput = {
      tenantId,
    };

    if (parkId) {
      where.turbine = {
        parkId,
      };
    }

    if (type) {
      where.type = type;
    }

    if (severity) {
      where.severity = severity;
    }

    if (acknowledged === "true") {
      where.acknowledged = true;
    } else if (acknowledged === "false") {
      where.acknowledged = false;
    }

    if (resolved === "true") {
      where.resolvedAt = { not: null };
    } else if (resolved === "false") {
      where.resolvedAt = null;
    }

    // Fetch anomalies with relations
    const [anomalies, total] = await Promise.all([
      prisma.scadaAnomaly.findMany({
        where,
        include: {
          turbine: {
            select: {
              id: true,
              designation: true,
              park: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          acknowledgedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { detectedAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.scadaAnomaly.count({ where }),
    ]);

    // Calculate KPI stats
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [openCount, criticalCount, todayCount] = await Promise.all([
      prisma.scadaAnomaly.count({
        where: { tenantId, resolvedAt: null, acknowledged: false },
      }),
      prisma.scadaAnomaly.count({
        where: { tenantId, resolvedAt: null, severity: "CRITICAL" },
      }),
      prisma.scadaAnomaly.count({
        where: { tenantId, detectedAt: { gte: todayStart } },
      }),
    ]);

    // Average response time (time from detection to acknowledgment) for last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const acknowledgedRecent = await prisma.scadaAnomaly.findMany({
      where: {
        tenantId,
        acknowledged: true,
        acknowledgedAt: { not: null, gte: thirtyDaysAgo },
      },
      select: {
        detectedAt: true,
        acknowledgedAt: true,
      },
    });

    let avgResponseTimeMinutes = 0;
    if (acknowledgedRecent.length > 0) {
      const totalMs = acknowledgedRecent.reduce((sum, a) => {
        if (a.acknowledgedAt) {
          return sum + (a.acknowledgedAt.getTime() - a.detectedAt.getTime());
        }
        return sum;
      }, 0);
      avgResponseTimeMinutes = Math.round(totalMs / acknowledgedRecent.length / 60000);
    }

    return NextResponse.json({
      anomalies,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        openCount,
        criticalCount,
        todayCount,
        avgResponseTimeMinutes,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der SCADA-Anomalien");
    return NextResponse.json(
      { error: "Fehler beim Laden der SCADA-Anomalien" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/energy/scada/anomalies - Run anomaly detection manually
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    let parkId: string | undefined;
    try {
      const body = await request.json();
      parkId = body.parkId;
    } catch {
      // Body is optional
    }

    const anomalies = await runAnomalyDetection(tenantId, { parkId });

    return NextResponse.json(
      {
        message: `Anomalie-Erkennung abgeschlossen. ${anomalies.length} Anomalie(n) gefunden.`,
        anomalies,
        count: anomalies.length,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "Fehler bei der SCADA-Anomalie-Erkennung");
    return NextResponse.json(
      { error: "Fehler bei der SCADA-Anomalie-Erkennung" },
      { status: 500 }
    );
  }
}
