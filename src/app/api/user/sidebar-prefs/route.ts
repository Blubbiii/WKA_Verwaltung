/**
 * Persönliche Seitenleisten-Einstellungen: Favoriten, eigene Gruppen,
 * ausgeblendete Systemgruppen.
 *
 * Gespeichert im JSON-Feld `User.settings` — dasselbe Muster wie die
 * Reihenfolge der Gruppen (`/api/user/sidebar-order`). Kein eigenes
 * Datenbankfeld, weil es reine Anzeigeeinstellungen sind: sie haben keine
 * fachliche Bedeutung, niemand wertet sie aus, und sie dürfen verloren gehen,
 * ohne dass etwas kaputtgeht.
 *
 * **Pro Benutzer, nie pro Mandant.** Was ein Mandant gar nicht nutzt, blenden
 * bereits die Feature-Schalter aus. Hier geht es um persönliche Arbeitsweise —
 * und niemand darf einem anderen den Zugang wegkonfigurieren.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import type { UserSettings } from "@/types/dashboard";
import {
  LEERE_PREFS,
  MAX_FAVORITEN,
  MAX_GRUPPEN,
  MAX_NAME_LAENGE,
  lesePrefs,
} from "@/lib/sidebar/prefs";

const prefsSchema = z.object({
  gruppen: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(MAX_NAME_LAENGE),
        hrefs: z.array(z.string().min(1).max(300)).max(MAX_FAVORITEN),
      }),
    )
    .max(MAX_GRUPPEN),
  lose: z.array(z.string().min(1).max(300)).max(MAX_FAVORITEN),
  versteckteGruppen: z.array(z.string().min(1).max(64)).max(50),
});

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const user = await prisma.user.findUnique({
      where: { id: check.userId },
      select: { settings: true },
    });

    const settings = (user?.settings as UserSettings) || {};
    // Ueber `lesePrefs`, nicht roh: was im JSON steht, kann aus einer
    // aelteren Fassung stammen. Eine kaputte Einstellung darf die
    // Seitenleiste nicht mitreissen.
    return NextResponse.json({ data: lesePrefs(settings.sidebarPrefs) });
  } catch (error) {
    logger.error({ err: error }, "Error fetching sidebar prefs");
    return apiError("FETCH_FAILED", 500, {
      message: "Seitenleisten-Einstellungen konnten nicht geladen werden",
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const parsed = prefsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: "Ungültige Einstellungen",
        details: parsed.error.issues,
      });
    }

    // Gesamtzahl auch ueber Gruppen hinweg begrenzen. Die Einzelgrenzen im
    // Schema lassen sonst 10 Gruppen zu je 30 Zielen durch.
    const gesamt =
      parsed.data.lose.length +
      parsed.data.gruppen.reduce((s, g) => s + g.hrefs.length, 0);
    if (gesamt > MAX_FAVORITEN) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: `Mehr als ${MAX_FAVORITEN} Favoriten sind keine Favoriten mehr.`,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: check.userId },
      select: { settings: true },
    });
    const settings = (user?.settings as UserSettings) || {};

    await prisma.user.update({
      where: { id: check.userId },
      data: { settings: { ...settings, sidebarPrefs: parsed.data } },
    });

    return NextResponse.json({ data: parsed.data });
  } catch (error) {
    logger.error({ err: error }, "Error saving sidebar prefs");
    return apiError("UPDATE_FAILED", 500, {
      message: "Seitenleisten-Einstellungen konnten nicht gespeichert werden",
    });
  }
}

export async function DELETE() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const user = await prisma.user.findUnique({
      where: { id: check.userId },
      select: { settings: true },
    });
    const settings = (user?.settings as UserSettings) || {};
    delete (settings as Record<string, unknown>).sidebarPrefs;

    await prisma.user.update({
      where: { id: check.userId },
      data: { settings: settings as object },
    });

    return NextResponse.json({ data: LEERE_PREFS });
  } catch (error) {
    logger.error({ err: error }, "Error resetting sidebar prefs");
    return apiError("UPDATE_FAILED", 500, {
      message: "Seitenleisten-Einstellungen konnten nicht zurückgesetzt werden",
    });
  }
}
