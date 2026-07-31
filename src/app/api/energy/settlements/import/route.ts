/**
 * POST /api/energy/settlements/import — Abrechnungszeilen einlesen
 *
 * A3 (Audit 2026-07): `EnergySettlement` wurde ausschliesslich von Hand
 * erfasst. Diese Route liest die monatliche Abrechnung ein — zugeordnet über
 * den Zählpunkt, den es dafür seit dieser Welle gibt.
 *
 * ## Zwei Betriebsarten
 *
 * `dryRun: true` prüft und schreibt nichts, genau wie beim Stammdatenimport
 * (#22). Die Vorschau muss dieselben Prüfungen sehen wie der Import, sonst
 * sieht sie grün aus und der Import scheitert danach.
 *
 * ## Warum nicht einfach überschrieben wird
 *
 * Eine Abrechnung, die bereits verteilt wurde, ist Grundlage von
 * Pachtabrechnungen und Ausschüttungen. Sie stillschweigend durch eine
 * korrigierte Fassung zu ersetzen würde diese Folgerechnungen unbemerkt
 * ungültig machen. Bestehende Abrechnungen werden deshalb gemeldet und
 * übersprungen — die Korrektur ist ein bewusster Vorgang.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { parseAmount } from "@/lib/parse-amount";

/** Obergrenze je Lauf — mehr als ein Jahr je Park kommt nicht vor. */
const MAX_ROWS = 500;

const rowSchema = z.object({
  /** Zählpunktkennung aus der Abrechnung. Der Zuordnungsschlüssel. */
  meteringCode: z.string().optional(),
  /** Alternativ direkt der Park, wenn kein Zählpunkt in der Datei steht. */
  parkId: z.string().uuid().optional(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).nullable().optional(),
  /** Als Text, damit deutsche Schreibweise durchkommt. */
  productionKwh: z.string(),
  revenueEur: z.string(),
  reference: z.string().optional(),
});

const requestSchema = z.object({
  dryRun: z.boolean().default(false),
  rows: z.array(rowSchema).max(MAX_ROWS),
});

interface RowProblem {
  row: number;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.ENERGY_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Import-Anfrage",
        details: parsed.error.issues,
      });
    }
    const { dryRun, rows } = parsed.data;

    const problems: RowProblem[] = [];
    const skipped: RowProblem[] = [];
    const importable: {
      index: number;
      parkId: string;
      year: number;
      month: number | null;
      productionKwh: number;
      revenueEur: number;
      reference?: string;
    }[] = [];

    // Zählpunkte einmal laden statt je Zeile — bei 12 Zeilen wären das sonst
    // 12 Abfragen für dieselben zwei Kennungen.
    const codes = [...new Set(rows.map((r) => r.meteringCode).filter(Boolean))] as string[];
    const meteringPoints = codes.length
      ? await prisma.meteringPoint.findMany({
          where: {
            tenantId: check.tenantId!,
            code: { in: codes.map((c) => c.replace(/\s/g, "").toUpperCase()) },
          },
          select: { code: true, parkId: true },
        })
      : [];
    const parkByCode = new Map(meteringPoints.map((mp) => [mp.code, mp.parkId]));

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 1;

      // Park bestimmen: Zählpunkt hat Vorrang, weil er in der Abrechnung steht.
      let parkId: string | null = null;
      if (row.meteringCode) {
        const normalized = row.meteringCode.replace(/\s/g, "").toUpperCase();
        parkId = parkByCode.get(normalized) ?? null;
        if (!parkId) {
          problems.push({
            row: rowNumber,
            message: `Zählpunkt ${normalized} ist keinem Park zugeordnet — bitte zuerst am Park erfassen`,
          });
          continue;
        }
      } else if (row.parkId) {
        parkId = row.parkId;
      } else {
        problems.push({
          row: rowNumber,
          message: "Weder Zählpunkt noch Park angegeben",
        });
        continue;
      }

      const productionKwh = parseAmount(row.productionKwh);
      const revenueEur = parseAmount(row.revenueEur);

      if (productionKwh === null) {
        problems.push({ row: rowNumber, message: `Menge nicht lesbar: "${row.productionKwh}"` });
        continue;
      }
      if (revenueEur === null) {
        problems.push({ row: rowNumber, message: `Erlös nicht lesbar: "${row.revenueEur}"` });
        continue;
      }
      // Eine negative Menge ist keine Abrechnung, sondern ein Vorzeichenfehler
      // oder eine Gutschrift, die anders erfasst gehört.
      if (productionKwh < 0) {
        problems.push({ row: rowNumber, message: "Negative Menge" });
        continue;
      }

      importable.push({
        index: rowNumber,
        parkId,
        year: row.year,
        month: row.month ?? null,
        productionKwh,
        revenueEur,
        reference: row.reference,
      });
    }

    // Mandantenbindung der Parks prüfen — ein direkt angegebener parkId kommt
    // vom Client.
    const parkIds = [...new Set(importable.map((r) => r.parkId))];
    const parks = await prisma.park.findMany({
      where: { id: { in: parkIds }, tenantId: check.tenantId! },
      select: { id: true },
    });
    const allowedParks = new Set(parks.map((p) => p.id));

    const finalRows = importable.filter((row) => {
      if (!allowedParks.has(row.parkId)) {
        problems.push({ row: row.index, message: "Park nicht gefunden" });
        return false;
      }
      return true;
    });

    // Bestehende Abrechnungen finden. Sie werden NICHT überschrieben.
    const existing = await prisma.energySettlement.findMany({
      where: {
        tenantId: check.tenantId!,
        OR: finalRows.map((row) => ({
          parkId: row.parkId,
          year: row.year,
          month: row.month,
        })),
      },
      select: { parkId: true, year: true, month: true, status: true },
    });
    const existingKeys = new Set(
      existing.map((e) => `${e.parkId}|${e.year}|${e.month ?? "null"}`),
    );

    const toCreate = finalRows.filter((row) => {
      const key = `${row.parkId}|${row.year}|${row.month ?? "null"}`;
      if (existingKeys.has(key)) {
        skipped.push({
          row: row.index,
          message: "Für diesen Park und Zeitraum gibt es bereits eine Abrechnung — übersprungen",
        });
        return false;
      }
      return true;
    });

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        total: rows.length,
        importable: toCreate.length,
        skipped: skipped.length,
        failed: problems.length,
        problems,
        skippedRows: skipped,
      });
    }

    let imported = 0;
    if (toCreate.length > 0) {
      const result = await prisma.energySettlement.createMany({
        data: toCreate.map((row) => ({
          tenantId: check.tenantId!,
          parkId: row.parkId,
          year: row.year,
          month: row.month,
          totalProductionKwh: row.productionKwh,
          netOperatorRevenueEur: row.revenueEur,
          netOperatorReference: row.reference,
          // Bewusst als Entwurf: eine eingelesene Abrechnung ist ungeprüft.
          // Der Dreiecksabgleich läuft danach, und erst dann wird verteilt.
          status: "DRAFT",
        })),
        skipDuplicates: true,
      });
      imported = result.count;
    }

    await createAuditLog({
      action: "CREATE",
      entityType: "EnergySettlement",
      entityId: "csv-import",
      description: `Abrechnungsimport: ${imported} angelegt, ${skipped.length} übersprungen, ${problems.length} fehlerhaft`,
    });

    logger.info(
      { imported, skipped: skipped.length, failed: problems.length, tenantId: check.tenantId },
      "[SettlementImport] Import abgeschlossen",
    );

    return NextResponse.json({
      dryRun: false,
      total: rows.length,
      imported,
      skipped: skipped.length,
      failed: problems.length,
      problems,
      skippedRows: skipped,
    });
  } catch (error) {
    logger.error({ err: error }, "[SettlementImport] Import fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Import fehlgeschlagen" });
  }
}
