/**
 * API Routes fuer einzelne archivierte Reports
 *
 * GET    /api/reports/archive/[id] - Report mit Download-URL abrufen
 * DELETE /api/reports/archive/[id] - Report loeschen
 */

import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json(
        { error: "Report-ID ist erforderlich" },
        { status: 400 }
      );
    }

    const report = await getArchivedReportById(id, check.tenantId!);

    if (!report) {
      return NextResponse.json(
        { error: "Report nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ report });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Abrufen des Reports");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// ===========================================
// DELETE - Report loeschen
// ===========================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Report-ID ist erforderlich" },
        { status: 400 }
      );
    }

    const success = await deleteArchivedReport(id, check.tenantId!);

    if (!success) {
      return NextResponse.json(
        { error: "Report nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Loeschen des Reports");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
