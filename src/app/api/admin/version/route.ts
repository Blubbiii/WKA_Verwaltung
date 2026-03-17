/**
 * API Route: /api/admin/version
 * GET: Return current app version + build info
 * PATCH: Update display version (stored in SystemConfig)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const packageVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

const updateSchema = z.object({
  displayVersion: z.string().min(1).max(20).regex(
    /^\d+\.\d+\.\d+(-[\w.]+)?$/,
    "Version muss dem Format X.Y.Z entsprechen (z.B. 0.4.0 oder 1.0.0-beta.1)"
  ),
});

export async function GET() {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Get display version override from SystemConfig
    const config = await prisma.systemConfig.findFirst({
      where: { key: "app.displayVersion", tenantId: null },
    });

    return NextResponse.json({
      packageVersion,
      displayVersion: config?.value || packageVersion,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || "unknown",
      buildTime: process.env.BUILD_TIME || null,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching version info");
    return NextResponse.json(
      { error: "Fehler beim Laden der Versionsinformationen" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    // Only SUPERADMIN can change version
    const hierarchy = await getUserHighestHierarchy(check.userId!);

    if (hierarchy < 100) {
      return NextResponse.json(
        { error: "Nur Superadmins können die Version ändern" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { displayVersion } = updateSchema.parse(body);

    // Find existing or create new
    const existing = await prisma.systemConfig.findFirst({
      where: { key: "app.displayVersion", tenantId: null },
    });

    if (existing) {
      await prisma.systemConfig.update({
        where: { id: existing.id },
        data: { value: displayVersion },
      });
    } else {
      await prisma.systemConfig.create({
        data: {
          key: "app.displayVersion",
          value: displayVersion,
          category: "system",
        },
      });
    }

    return NextResponse.json({
      displayVersion,
      message: "Version aktualisiert",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating version");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Version" },
      { status: 500 }
    );
  }
}
