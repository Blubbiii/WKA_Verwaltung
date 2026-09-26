/**
 * GET /api/lizenz — the licence of the caller's own customer: booked
 * tariff, usage against limits, grace period. For the customer's admins
 * (settings:read); drives the "Lizenz & Verbrauch" card and the banner.
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { ladeLizenz } from "@/lib/lizenz/lizenz-db";

export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) return apiError("NOT_FOUND", 404, { message: "Kein Mandant" });

    const lizenz = await ladeLizenz(check.tenantId);
    return NextResponse.json({
      tarif: lizenz.tarif,
      zeilen: lizenz.lage.zeilen,
      ueberschritten: lizenz.lage.ueberschritten,
      karenzBis: lizenz.lage.karenzBis?.toISOString() ?? null,
      gesperrt: lizenz.lage.gesperrt,
    });
  } catch (error) {
    logger.error({ err: error }, "[Lizenz] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, { message: "Lizenz konnte nicht geladen werden" });
  }
}
