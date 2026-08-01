/**
 * GET  /api/municipalities — Gemeinden des Mandanten
 * POST /api/municipalities — Gemeinde anlegen
 *
 * A5 (Audit 2026-08): Die Gemeinde stand als Freitext am Flurstück. Damit gab
 * es keinen Ort, an dem etwas Gemeindebezogenes haengen koennte, und jede
 * Auswertung fragmentierte an Schreibweisen.
 *
 * ## Warum der amtliche Gemeindeschluessel geprueft wird
 *
 * Er ist achtstellig und codiert in den ersten beiden Stellen das Bundesland.
 * Eine Stelle zu wenig sieht richtig aus und faellt erst auf, wenn der
 * Steuerberater die Zuordnung nicht findet. Er bleibt optional — aber wenn er
 * angegeben wird, dann richtig.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { serializePrisma } from "@/lib/serialize";

/** Achtstellig: 2 Land, 1 Regierungsbezirk, 2 Kreis, 3 Gemeinde. */
const OFFICIAL_KEY_PATTERN = /^\d{8}$/;

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  officialKey: z
    .string()
    .trim()
    .regex(OFFICIAL_KEY_PATTERN, "Der amtliche Gemeindeschlüssel hat genau 8 Ziffern")
    .nullable()
    .optional()
    .or(z.literal("")),
  state: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export async function GET() {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const municipalities = await prisma.municipality.findMany({
      where: { tenantId: check.tenantId },
      orderBy: { name: "asc" },
      include: {
        // Die Zahlen dahinter sind der Grund, warum jemand diese Liste
        // aufruft: eine Gemeinde ohne Anlagen und ohne Flurstuecke ist
        // entweder neu oder uebrig geblieben.
        _count: { select: { turbines: true, plots: true } },
      },
    });

    return NextResponse.json({ data: serializePrisma(municipalities) });
  } catch (error) {
    logger.error({ err: error }, "Gemeinden konnten nicht geladen werden");
    return apiError("PROCESS_FAILED", 500, {
      message: "Gemeinden konnten nicht geladen werden",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
      });
    }

    const created = await prisma.municipality.create({
      data: {
        tenantId: check.tenantId,
        name: parsed.data.name,
        officialKey: parsed.data.officialKey || null,
        state: parsed.data.state || null,
        notes: parsed.data.notes || null,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Municipality",
      entityId: created.id,
      newValues: { name: created.name, officialKey: created.officialKey },
    });

    return NextResponse.json({ data: serializePrisma(created) }, { status: 201 });
  } catch (error) {
    // Der Eindeutigkeits-Index auf (tenantId, name) ist die eigentliche Bremse
    // gegen die Fragmentierung. Er soll als klare Meldung ankommen und nicht
    // als „Fehler beim Speichern".
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError("VALIDATION_FAILED", 409, {
        message: "Eine Gemeinde mit diesem Namen ist bereits angelegt",
      });
    }
    logger.error({ err: error }, "Gemeinde konnte nicht angelegt werden");
    return apiError("PROCESS_FAILED", 500, {
      message: "Gemeinde konnte nicht angelegt werden",
    });
  }
}
