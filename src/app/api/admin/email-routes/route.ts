/**
 * API Route: /api/admin/email-routes
 * GET:  List all email routes for the current tenant
 * POST: Create a new email route
 *
 * Permission: admin:manage
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const emailRouteSchema = z.object({
  address: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9._-]+$/,
      "Nur Kleinbuchstaben, Zahlen, Punkt, Bindestrich, Unterstrich",
    ),
  targetType: z.enum(["PARK", "FUND", "TENANT", "INBOX"]),
  targetId: z.string().uuid(),
  description: z.string().max(255).optional(),
  isActive: z.boolean().default(true),
  autoAction: z.enum(["INBOX", "DOCUMENT", "IGNORE"]).default("INBOX"),
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-routes
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;

    const routes = await prisma.emailRoute.findMany({
      where: { tenantId },
      orderBy: { address: "asc" },
    });

    return NextResponse.json({ routes });
  } catch (error) {
    logger.error({ err: error }, "Failed to load email routes");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/email-routes
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;

    const body = await request.json();
    const result = emailRouteSchema.safeParse(body);
    if (!result.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: result.error.flatten().fieldErrors });
    }

    // Check for duplicate address within tenant
    const existing = await prisma.emailRoute.findFirst({
      where: { address: result.data.address, tenantId },
    });
    if (existing) {
      return apiError("CONFLICT", undefined, { message: "Diese Adresse ist bereits vergeben" });
    }

    const route = await prisma.emailRoute.create({
      data: { ...result.data, tenantId },
    });

    return NextResponse.json({ route }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Failed to create email route");
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen" });
  }
}
