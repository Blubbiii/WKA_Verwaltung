/**
 * API Routes für einzelne archivierte Reports
 *
 * GET    /api/reports/archive/[id] - Report mit Download-URL abrufen
 * DELETE /api/reports/archive/[id] - Report löschen
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import {
  getArchivedReportById,
  deleteArchivedReport,
} from "@/lib/reports/archive";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ===========================================
// GET - Einzelnen Report abrufen
// ===========================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    if (!id) {
      return apiError("VALIDATION_FAILED", 400, { message: "Report-ID ist erforderlich" });
    }

    const report = await getArchivedReportById(id, check.tenantId!);

    if (!report) {
      return apiError("NOT_FOUND", 404, { message: "Report nicht gefunden" });
    }

    return NextResponse.json({ report });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Abrufen des Reports");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}

// ===========================================
// DELETE - Report löschen
// ===========================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    if (!id) {
      return apiError("VALIDATION_FAILED", 400, { message: "Report-ID ist erforderlich" });
    }

    const success = await deleteArchivedReport(id, check.tenantId!);

    if (!success) {
      return apiError("NOT_FOUND", 404, { message: "Report nicht gefunden" });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Löschen des Reports");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
