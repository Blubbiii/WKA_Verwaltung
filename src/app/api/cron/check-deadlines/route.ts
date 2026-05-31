import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { checkDeadlinesAndNotify } from "@/lib/notifications/deadline-checker";
import { rateLimit, getClientIp, getRateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // IP-Rate-Limit als Defense-in-Depth gegen CRON_SECRET-Leak.
  // Cron triggert in der Realität ≤1/min → 10/min/IP ist sehr grosszügig.
  const ip = getClientIp(request);
  const rl = await rateLimit(`cron-deadlines:${ip}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.success) return getRateLimitResponse(rl);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("CRON_SECRET env var is not set");
    return apiError("INTERNAL_ERROR", 503, { message: "Service unavailable" });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("Unauthorized cron request to check-deadlines");
    return apiError("UNAUTHORIZED", 401, { message: "Unauthorized" });
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
    return apiError("INTERNAL_ERROR", 500, { message: "Internal server error" });
  }
}
