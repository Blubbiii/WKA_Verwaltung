/**
 * GET  /api/energy/spot-prices — stündliche Preisreihe, mit Vollständigkeitsprüfung
 * POST /api/energy/spot-prices — Reihe importieren
 *
 * B1 (Audit 2026-07): „Braucht eine stündliche Preisreihe — heute nur
 * Monatsaggregat, also neue Infrastruktur."
 *
 * ## Warum die Vollständigkeit mitgeliefert wird
 *
 * Eine unvollständige Reihe ist gefährlicher als gar keine: sie sieht aus wie
 * eine Grundlage. Fehlen im Monat 30 Stunden, könnte darin ein
 * zusammenhängender negativer Zeitraum liegen — und der entfallende
 * Vergütungsanspruch wäre dann zu niedrig berechnet. Deshalb liefert die
 * Abfrage immer mit, wie viele Stunden von den erwarteten vorhanden sind.
 *
 * ## Warum die Preise nicht je Mandant gespeichert werden
 *
 * Der Börsenpreis ist für alle derselbe. Ihn je Mandant zu führen hiesse,
 * Abweichungen zwischen Mandanten zu ermöglichen, die es nicht geben kann.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";

const importSchema = z.object({
  biddingZone: z.string().trim().max(20).default("DE-LU"),
  source: z.string().trim().max(20).default("SMARD"),
  prices: z
    .array(
      z.object({
        /** ISO-Zeitstempel des Stundenbeginns. */
        hour: z.string(),
        priceEurMwh: z.number(),
      }),
    )
    .min(1)
    .max(10_000),
});

/** Erwartete Stunden eines Monats — Schaltjahr und Monatslänge eingeschlossen. */
function expectedHours(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate() * 24;
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));
    const biddingZone = searchParams.get("biddingZone") || "DE-LU";

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültiges Jahr" });
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültiger Monat" });
    }

    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));

    const prices = await prisma.hourlySpotPrice.findMany({
      where: { biddingZone, hour: { gte: from, lt: to } },
      orderBy: { hour: "asc" },
      select: { hour: true, priceEurMwh: true, source: true },
    });

    const expected = expectedHours(year, month);
    const negativeCount = prices.filter((entry) => Number(entry.priceEurMwh) < 0).length;

    const warnings: string[] = [];
    if (prices.length === 0) {
      warnings.push(
        "Für diesen Monat ist keine stündliche Preisreihe geladen. Die Stunden nach § 51 EEG lassen sich nicht bestimmen — sie sind damit nicht null, sondern unbekannt.",
      );
    } else if (prices.length < expected) {
      // Der wichtigste Hinweis: in einer Lücke könnte ein negativer Zeitraum
      // liegen.
      warnings.push(
        `Die Reihe hat ${prices.length} von ${expected} Stunden. In den fehlenden ${expected - prices.length} Stunden könnte ein zusammenhängender negativer Zeitraum liegen — der entfallende Anspruch wäre dann zu niedrig berechnet.`,
      );
    }

    return NextResponse.json({
      biddingZone,
      year,
      month,
      prices: prices.map((entry) => ({
        hour: entry.hour,
        priceEurMwh: Number(entry.priceEurMwh),
        source: entry.source,
      })),
      completeness: { present: prices.length, expected },
      negativeCount,
      warnings,
    });
  } catch (error) {
    logger.error({ err: error }, "[SpotPrices] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, { message: "Preisreihe konnte nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Kursdaten sind mandantenübergreifend; das Recht dazu ist bewusst das
    // Import-Recht der Energiedaten und nicht ein Leserecht.
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const parsed = importSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const rows: { biddingZone: string; hour: Date; priceEurMwh: number; source: string }[] = [];
    const invalid: string[] = [];

    for (const entry of data.prices) {
      const hour = new Date(entry.hour);
      if (Number.isNaN(hour.getTime())) {
        invalid.push(entry.hour);
        continue;
      }
      // Auf die volle Stunde normieren: eine Reihe mit Minutenanteilen würde
      // den Unique-Index unterlaufen und Dubletten erzeugen.
      hour.setUTCMinutes(0, 0, 0);
      rows.push({
        biddingZone: data.biddingZone,
        hour,
        priceEurMwh: entry.priceEurMwh,
        source: data.source,
      });
    }

    if (rows.length === 0) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Keine gültigen Zeitstempel in der Reihe",
        details: { invalid: invalid.slice(0, 10) },
      });
    }

    // `skipDuplicates`: ein erneuter Import derselben Stunden ist der
    // Normalfall (Nachlieferung, korrigierte Datei) und kein Fehler. Jede
    // doppelte negative Stunde würde den entfallenden Anspruch verdoppeln.
    const result = await prisma.hourlySpotPrice.createMany({
      data: rows,
      skipDuplicates: true,
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "EnergySettlement",
      entityId: `${data.biddingZone}-${data.source}`,
      newValues: {
        imported: result.count,
        submitted: rows.length,
        biddingZone: data.biddingZone,
        source: data.source,
      },
      description: `Stündliche Spotpreise importiert (${result.count} von ${rows.length})`,
    });

    const warnings: string[] = [];
    if (invalid.length > 0) {
      warnings.push(`${invalid.length} Zeilen mit ungültigem Zeitstempel übersprungen.`);
    }
    if (result.count < rows.length) {
      warnings.push(
        `${rows.length - result.count} Stunden waren bereits vorhanden und wurden NICHT überschrieben. Für eine Korrektur die betroffenen Stunden zuerst entfernen.`,
      );
    }

    return NextResponse.json(
      { imported: result.count, submitted: rows.length, warnings },
      { status: 201 },
    );
  } catch (error) {
    logger.error({ err: error }, "[SpotPrices] Import fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Preisreihe konnte nicht importiert werden" });
  }
}
