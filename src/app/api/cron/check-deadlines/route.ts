import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { checkDeadlinesAndNotify } from "@/lib/notifications/deadline-checker";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("CRON_SECRET env var is not set");
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("Unauthorized cron request to check-deadlines");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true },
    });

    let totalCreated = 0;

    for (const tenant of tenants) {
      try {
        const result = await checkDeadlinesAndNotify(tenant.id);
        totalCreated += result.created;
      } catch (err) {
        logger.error(
          { tenantId: tenant.id, error: err },
          "Failed to check deadlines for tenant"
        );
      }
    }

    logger.info(
      { totalCreated, tenantsChecked: tenants.length },
      "Deadline check completed"
    );

    return NextResponse.json({
      totalCreated,
      tenantsChecked: tenants.length,
    });
  } catch (err) {
    logger.error({ error: err }, "Deadline check cron failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
