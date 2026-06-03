/**
 * POST /api/buchhaltung/ustva/elster-prep
 *
 * Bereitet die UStVA für ELSTER-Übermittlung vor (Skelett).
 *
 * Body: {
 *   from: string,           // ISO date
 *   to: string,             // ISO date
 *   steuernummer: string,
 *   zeitraum: string,       // "01"..."12" oder "Q1".."Q4"
 *   steuerjahr: string,     // "2026"
 *   berichtigt?: boolean,
 *   bufaNummer?: string,
 * }
 *
 * Liefert: ElsterPrepResult mit Payload, Validierungs-Status und Summary.
 * KEINE Übermittlung — nur Vorbereitung des ERiC-konformen Payloads.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { generateUstva } from "@/lib/accounting/reports/ustva";
import { prepareElsterUstva } from "@/lib/accounting/elster-prep";

const bodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  steuernummer: z.string().min(8).max(30),
  zeitraum: z.string().regex(/^(0[1-9]|1[0-2]|Q[1-4])$/),
  steuerjahr: z.string().regex(/^\d{4}$/),
  berichtigt: z.boolean().optional(),
  bufaNummer: z.string().max(20).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
      });
    }

    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
      return apiError("BAD_REQUEST", 400, {
        message: "Ungültiger Zeitraum",
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { name: true, address: true, postalCode: true, city: true },
    });
    if (!tenant) {
      return apiError("NOT_FOUND", 404, { message: "Tenant nicht gefunden" });
    }

    const ustva = await generateUstva(check.tenantId, from, to);

    const prep = prepareElsterUstva(ustva, {
      steuernummer: parsed.data.steuernummer,
      bufaNummer: parsed.data.bufaNummer,
      zeitraum: parsed.data.zeitraum,
      steuerjahr: parsed.data.steuerjahr,
      berichtigt: parsed.data.berichtigt ?? false,
      unternehmen: {
        name: tenant.name,
        strasseHausnr: tenant.address ?? undefined,
        plzOrt:
          tenant.postalCode && tenant.city
            ? `${tenant.postalCode} ${tenant.city}`
            : undefined,
      },
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        zeitraum: parsed.data.zeitraum,
        steuerjahr: parsed.data.steuerjahr,
        kennzahlCount: prep.summary.kennzahlCount,
        canSubmit: prep.errors.length === 0,
      },
      "ELSTER-UStVA-Prep erstellt (keine Übermittlung)",
    );

    return NextResponse.json({
      ...prep,
      transmitted: false,
      note:
        "Diese Vorbereitung enthält das ERiC-JSON-Payload. Die tatsächliche " +
        "Übermittlung an ELSTER erfordert die ERiC-Library der Finanzverwaltung " +
        "und wird in einem separaten Side-Car-Service implementiert.",
    });
  } catch (error) {
    logger.error({ err: error }, "ELSTER-Prep fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "ELSTER-Prep fehlgeschlagen",
    });
  }
}
