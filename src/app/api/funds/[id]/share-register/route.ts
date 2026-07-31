/**
 * GET /api/funds/[id]/share-register?date=YYYY-MM-DD — Gesellschafterliste zum Stichtag
 *
 * A8 (Audit 2026-07). Die Frage „wer war am 31.12. beteiligt und mit welcher
 * Quote" liess sich bisher nicht beantworten: die Stammdaten werden beim
 * Anteilsübergang überschrieben, eine Historie gab es nicht.
 *
 * Ohne `date` gilt heute. Der Rückfall auf die Stammdaten (`entryDate` /
 * `exitDate`) greift, solange kein Anteilsverlauf erfasst ist — die Liste ist
 * damit ab dem ersten Tag brauchbar und nicht erst nach einer Nachpflege.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { shareRegisterAt } from "@/lib/shareholding/distribution-split";
import {
  resolveShareholderSharesFrom,
  SHAREHOLDER_SHARES_SELECT,
} from "@/lib/shareholding/resolve-shares";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Stichtag muss im Format JJJJ-MM-TT angegeben werden",
      });
    }

    const date = dateParam
      ? new Date(`${dateParam}T00:00:00.000Z`)
      : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

    const fund = await prisma.fund.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: {
        id: true,
        name: true,
        totalCapital: true,
        shareholders: {
          select: {
            id: true,
            shareholderNumber: true,
            entryDate: true,
            exitDate: true,
            ownershipPercentage: true,
            distributionPercentage: true,
            capitalContribution: true,
            person: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                companyName: true,
                personType: true,
              },
            },
            shareHistory: SHAREHOLDER_SHARES_SELECT,
          },
        },
      },
    });

    if (!fund) {
      return apiError("NOT_FOUND", undefined, { message: "Gesellschaft nicht gefunden" });
    }

    const resolved = resolveShareholderSharesFrom(fund.shareholders);
    const register = shareRegisterAt(resolved.shares, date);
    const byId = new Map(fund.shareholders.map((s) => [s.id, s]));

    const entries = register.map((entry) => {
      const shareholder = byId.get(entry.shareholderId);
      return {
        shareholderId: entry.shareholderId,
        shareholderNumber: shareholder?.shareholderNumber ?? null,
        person: shareholder?.person ?? null,
        sharePercent: entry.sharePercent,
        capitalContribution:
          shareholder?.capitalContribution === null || shareholder?.capitalContribution === undefined
            ? null
            : Number(shareholder.capitalContribution),
        entryDate: shareholder?.entryDate ?? null,
        exitDate: shareholder?.exitDate ?? null,
      };
    });

    const sumPercent = entries.reduce((sum, e) => sum + e.sharePercent, 0);
    const warnings = [...resolved.warnings];

    // Eine Summe unter 100 % ist nicht zwingend ein Fehler — eingezogene oder
    // eigene Anteile sehen genau so aus. Sie zu verschweigen wäre falsch, sie
    // wegzurechnen erst recht.
    if (sumPercent < 99.989) {
      warnings.push(
        `Die Anteile ergeben am Stichtag ${sumPercent.toFixed(2)} %. Der Rest bleibt bei der Gesellschaft (eingezogene oder eigene Anteile) — bitte prüfen, ob das so gewollt ist.`,
      );
    }
    if (sumPercent > 100.011) {
      warnings.push(
        `Die Anteile ergeben am Stichtag ${sumPercent.toFixed(2)} % — mehr als 100 %. Das ist ein Datenfehler.`,
      );
    }

    return NextResponse.json({
      fund: { id: fund.id, name: fund.name, totalCapital: Number(fund.totalCapital ?? 0) },
      date: date.toISOString().slice(0, 10),
      source: resolved.source,
      entries,
      sumPercent: Math.round(sumPercent * 100000) / 100000,
      warnings,
    });
  } catch (error) {
    logger.error({ err: error }, "Error building share register");
    return apiError("FETCH_FAILED", undefined, {
      message: "Fehler beim Erstellen der Gesellschafterliste",
    });
  }
}
