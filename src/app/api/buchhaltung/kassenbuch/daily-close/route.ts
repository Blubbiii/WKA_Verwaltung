/**
 * POST /api/buchhaltung/kassenbuch/daily-close
 *
 * P26.2 §146 AO Tageskassensturz.
 *
 * Body: { closeDate: "YYYY-MM-DD", countedBalance: number, notes?: string }
 *
 * Aktionen:
 *   1. Computed Balance = letzter runningBalance des Tages
 *   2. Difference = counted - computed
 *   3. Bei Differenz != 0: notes ist Pflicht
 *   4. Erzeugt CashBookDailyClose
 *   5. Sperrt alle CashBookEntries des Tages (lockedAt + lockedById)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const schema = z.object({
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  countedBalance: z.number(),
  notes: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    // H-3-Fix: Timezone-Bug — `new Date("YYYY-MM-DD")` parst als UTC-Mitternacht,
    // `setUTCHours(0,0,0,0)` ist dann zwar No-Op, liegt aber in Berlin um 01:00/02:00
    // (Sommer-/Winterzeit) → Einträge des Vortags würden fälschlich mit-gesperrt.
    // Wir konstruieren stattdessen lokale Berliner Mitternacht (Container läuft mit
    // TZ=Europe/Berlin) und verwenden diese als Tagesgrenze.
    const [yStr, mStr, dStr] = parsed.data.closeDate.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const day = Number(dStr);
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

    // Letzten Eintrag des Tages laden
    const lastEntry = await prisma.cashBookEntry.findFirst({
      where: {
        tenantId: check.tenantId,
        entryDate: { gte: dayStart, lte: dayEnd },
      },
      orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
      select: { runningBalance: true, id: true },
    });

    const computedBalance = lastEntry
      ? Number(lastEntry.runningBalance)
      : 0;
    const difference = parsed.data.countedBalance - computedBalance;

    if (Math.abs(difference) > 0.005 && !parsed.data.notes?.trim()) {
      return apiError("BAD_REQUEST", 400, {
        message: `Differenz ${difference.toFixed(2)} € — Begründung ist Pflicht`,
      });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. CashBookDailyClose anlegen (UNIQUE schützt vor Doppel-Close)
        const close = await tx.cashBookDailyClose.create({
          data: {
            tenantId: check.tenantId!,
            closeDate: dayStart,
            computedBalance: new Prisma.Decimal(computedBalance),
            countedBalance: new Prisma.Decimal(parsed.data.countedBalance),
            difference: new Prisma.Decimal(difference),
            notes: parsed.data.notes?.trim() || null,
            closedById: check.userId!,
          },
        });

        // 2. Alle CashBookEntries des Tages sperren (Festschreibung)
        const lockResult = await tx.cashBookEntry.updateMany({
          where: {
            tenantId: check.tenantId!,
            entryDate: { gte: dayStart, lte: dayEnd },
            lockedAt: null,
          },
          data: {
            lockedAt: new Date(),
            lockedById: check.userId!,
          },
        });

        return { close, lockedEntries: lockResult.count };
      });

      logger.info(
        {
          tenantId: check.tenantId,
          userId: check.userId,
          closeDate: parsed.data.closeDate,
          difference,
          lockedEntries: result.lockedEntries,
        },
        "Kassenbuch Tagesabschluss durchgeführt",
      );

      return NextResponse.json(
        {
          data: serializePrisma({
            ...result.close,
            lockedEntries: result.lockedEntries,
          }),
        },
        { status: 201 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return apiError("ALREADY_EXISTS", 409, {
          message: `Tagesabschluss für ${parsed.data.closeDate} existiert bereits`,
        });
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Error in cash book daily close");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim Tagesabschluss",
    });
  }
}
