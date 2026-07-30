/**
 * Jahresabgleich Ist gegen Soll — die unabhängige Gegenrechnung.
 *
 * A2 (Audit 2026-07): Der Hersteller rechnet die Verfügbarkeit selbst ab, der
 * Betreiber hatte keine eigene Rechnung dagegen. Diese Datei beschafft die
 * Zeitkategorien und ruft die Regeln aus `contractual-availability.ts` auf.
 *
 * Die Trennung ist dieselbe wie bei A1: die Regeln sind ohne Datenbank
 * prüfbar, hier steht nur die Beschaffung.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  computeContractualAvailability,
  computeBonusMalus,
  MAIN_CATEGORIES,
  SUB_CATEGORIES,
  type TimeBuckets,
  type MainCategory,
  type Category,
  type BonusMalusTier,
  type PointRounding,
} from "./contractual-availability";
import { apiLogger as logger } from "@/lib/logger";

/** Rohsumme der Zeitkategorien je Anlage, wie sie aus der Datenbank kommt. */
interface TurbineBuckets extends TimeBuckets {
  turbineId: string;
  designation: string;
}

export interface SettlementComputation {
  availabilityPct: number | null;
  /** Warum nichts gerechnet werden konnte. Nur gesetzt, wenn availabilityPct null ist. */
  reason?: string;
  bonusMalusEur: number | null;
  basis: {
    perTurbine: {
      turbineId: string;
      designation: string;
      availabilityPct: number | null;
      basisHours: number;
      excludedHours: number;
    }[];
    /** Summen über alle Anlagen — das ist die abgerechnete Zahl. */
    totalBasisHours: number;
    totalAvailableHours: number;
    totalExcludedHours: number;
    availableCategories: string[];
    excludedCategories: string[];
    appliedTier: BonusMalusTier | null;
    points: number | null;
    cappedAt: number | null;
    warnings: string[];
    turbineCount: number;
  };
}

/**
 * Verfügbarkeit und Bonus/Malus für einen Zeitraum berechnen.
 *
 * Die Verfügbarkeit wird über ALLE Anlagen des Vertrags gebildet, nicht als
 * Mittel der Einzelwerte: eine kleine Anlage mit einem Totalausfall würde
 * sonst genauso schwer wiegen wie eine große mit voller Verfügbarkeit. Verträge
 * rechnen mit der Summe der Zeiten.
 *
 * Die Einzelwerte je Anlage stehen trotzdem in der Herleitung — sie sind es,
 * die in der Diskussion mit dem Hersteller gebraucht werden.
 */
export async function computeSettlement(input: {
  tenantId: string;
  guaranteeId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<SettlementComputation | { availabilityPct: null; reason: string; bonusMalusEur: null; basis: null }> {
  const { tenantId, guaranteeId, periodStart, periodEnd } = input;

  const guarantee = await prisma.availabilityGuarantee.findFirst({
    where: { id: guaranteeId, tenantId },
    include: {
      tiers: { orderBy: { sortOrder: "asc" } },
      contract: { select: { id: true, parkId: true, annualValue: true } },
    },
  });

  if (!guarantee) {
    return { availabilityPct: null, reason: "Garantie nicht gefunden", bonusMalusEur: null, basis: null };
  }

  // Energiebasierte Garantien brauchen eine vertraglich vereinbarte
  // Referenzkurve, die im Datenmodell nicht existiert. Sie stillschweigend
  // zeitbasiert zu rechnen wäre eine falsche Zahl unter richtigem Namen —
  // genau der Fehler, den A2 beheben soll.
  if (guarantee.method === "ENERGY_BASED") {
    return {
      availabilityPct: null,
      reason:
        "Energiebasierte Garantie — dafür fehlt die vertragliche Referenzkurve im System. Bitte die Herstellerabrechnung manuell prüfen.",
      bonusMalusEur: null,
      basis: null,
    };
  }

  if (!guarantee.contract.parkId) {
    return {
      availabilityPct: null,
      reason: "Der Wartungsvertrag ist keinem Park zugeordnet — ohne Anlagen keine Verfügbarkeit",
      bonusMalusEur: null,
      basis: null,
    };
  }

  const buckets = await loadBuckets(tenantId, guarantee.contract.parkId, periodStart, periodEnd);

  if (buckets.length === 0) {
    return {
      availabilityPct: null,
      reason: "Keine SCADA-Verfügbarkeitsdaten im Zeitraum",
      bonusMalusEur: null,
      basis: null,
    };
  }

  const definition = {
    availableCategories: guarantee.availableCategories.filter(isMainCategory),
    excludedCategories: guarantee.excludedCategories.filter(isCategory),
  };

  // Je Anlage rechnen (für die Herleitung) UND die Summen bilden (für die
  // Abrechnung).
  const perTurbine: SettlementComputation["basis"]["perTurbine"] = [];
  const warnings: string[] = [];

  const total: TimeBuckets = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t5_1: 0, t5_2: 0, t5_3: 0 };

  for (const turbine of buckets) {
    const single = computeContractualAvailability(turbine, definition);
    perTurbine.push({
      turbineId: turbine.turbineId,
      designation: turbine.designation,
      availabilityPct: single.availabilityPct,
      basisHours: single.availabilityPct !== null ? Math.round(single.basisSeconds / 3600) : 0,
      excludedHours: single.availabilityPct !== null ? Math.round(single.excludedSeconds / 3600) : 0,
    });
    if (single.availabilityPct !== null) {
      warnings.push(...single.warnings.map((w) => `${turbine.designation}: ${w}`));
    } else {
      warnings.push(`${turbine.designation}: ${single.reason}`);
    }

    for (const key of [...MAIN_CATEGORIES, ...SUB_CATEGORIES]) {
      total[key] += turbine[key];
    }
  }

  const combined = computeContractualAvailability(total, definition);

  if (combined.availabilityPct === null) {
    return {
      availabilityPct: null,
      reason: combined.reason,
      bonusMalusEur: null,
      basis: null,
    };
  }

  warnings.push(...combined.warnings);

  const annualValueEur = toNumber(guarantee.contract.annualValue) ?? 0;
  if (annualValueEur === 0 && guarantee.tiers.some((t) => t.mode === "PERCENT_OF_ANNUAL_VALUE")) {
    // Eine Staffel in Prozent der Jahresvergütung ergibt ohne Jahresvergütung
    // still 0 EUR. Das sähe aus wie "kein Anspruch".
    warnings.push(
      "Der Vertrag hat keine Jahresvergütung — Staffeln in Prozent der Jahresvergütung ergeben 0 EUR",
    );
  }

  const bonusMalus = computeBonusMalus({
    availabilityPct: combined.availabilityPct,
    tiers: guarantee.tiers.map(
      (tier): BonusMalusTier => ({
        fromPct: toNumber(tier.fromPct) ?? 0,
        toPct: toNumber(tier.toPct) ?? 0,
        kind: tier.kind,
        mode: tier.mode,
        amount: toNumber(tier.amount) ?? 0,
      }),
    ),
    annualValueEur,
    pointRounding: guarantee.pointRounding as PointRounding,
    maxMalusEur: toNumber(guarantee.maxMalusEur),
    maxBonusEur: toNumber(guarantee.maxBonusEur),
  });

  warnings.push(...bonusMalus.warnings);

  logger.info(
    {
      guaranteeId,
      availabilityPct: combined.availabilityPct,
      bonusMalusEur: bonusMalus.amountEur,
      turbines: buckets.length,
    },
    "[Availability] Abgleich berechnet",
  );

  return {
    availabilityPct: combined.availabilityPct,
    bonusMalusEur: bonusMalus.amountEur,
    basis: {
      perTurbine,
      totalBasisHours: Math.round(combined.basisSeconds / 3600),
      totalAvailableHours: Math.round(combined.availableSeconds / 3600),
      totalExcludedHours: Math.round(combined.excludedSeconds / 3600),
      availableCategories: [...definition.availableCategories],
      excludedCategories: [...definition.excludedCategories],
      appliedTier: bonusMalus.appliedTier,
      points: bonusMalus.points,
      cappedAt: bonusMalus.cappedAt,
      warnings,
      turbineCount: buckets.length,
    },
  };
}

/**
 * Zeitkategorien je Anlage über den Zeitraum aufsummieren.
 *
 * Genutzt wird `periodType = 'DAILY'` (aus den .avr-Dateien) — die feinste
 * Auflösung, die lückenlos vorliegt. Monatswerte würden bei einem Zeitraum,
 * der mitten im Monat beginnt, zu viel zählen, und die Jahreswerte gäbe es
 * für ein laufendes Jahr gar nicht.
 *
 * Die Schreibweise ist wichtig: der Import legt 'DAILY'/'WEEKLY'/'MONTHLY'/
 * 'YEARLY' in Grossbuchstaben ab. Ein 'daily' hier hätte still keine Zeile
 * gefunden — und eine leere Summe sähe aus wie "keine Ausfallzeiten".
 */
async function loadBuckets(
  tenantId: string,
  parkId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<TurbineBuckets[]> {
  const rows = await prisma.$queryRaw<
    {
      turbineId: string;
      designation: string;
      t1: bigint;
      t2: bigint;
      t3: bigint;
      t4: bigint;
      t5: bigint;
      t6: bigint;
      t5_1: bigint;
      t5_2: bigint;
      t5_3: bigint;
    }[]
  >`
    SELECT
      a."turbineId"        AS "turbineId",
      t."designation"      AS "designation",
      COALESCE(SUM(a."t1"), 0)::bigint   AS "t1",
      COALESCE(SUM(a."t2"), 0)::bigint   AS "t2",
      COALESCE(SUM(a."t3"), 0)::bigint   AS "t3",
      COALESCE(SUM(a."t4"), 0)::bigint   AS "t4",
      COALESCE(SUM(a."t5"), 0)::bigint   AS "t5",
      COALESCE(SUM(a."t6"), 0)::bigint   AS "t6",
      COALESCE(SUM(a."t5_1"), 0)::bigint AS "t5_1",
      COALESCE(SUM(a."t5_2"), 0)::bigint AS "t5_2",
      COALESCE(SUM(a."t5_3"), 0)::bigint AS "t5_3"
    FROM "scada_availability" a
    JOIN "turbines" t ON t."id" = a."turbineId"
    WHERE a."tenantId" = ${tenantId}
      AND t."parkId" = ${parkId}
      AND a."periodType" = 'DAILY'
      AND a."date" >= ${periodStart}
      AND a."date" <= ${periodEnd}
    GROUP BY a."turbineId", t."designation"
    ORDER BY t."designation"
  `;

  return rows.map((row) => ({
    turbineId: row.turbineId,
    designation: row.designation,
    t1: Number(row.t1),
    t2: Number(row.t2),
    t3: Number(row.t3),
    t4: Number(row.t4),
    t5: Number(row.t5),
    t6: Number(row.t6),
    t5_1: Number(row.t5_1),
    t5_2: Number(row.t5_2),
    t5_3: Number(row.t5_3),
  }));
}

function isMainCategory(value: string): value is MainCategory {
  return (MAIN_CATEGORIES as readonly string[]).includes(value);
}

function isCategory(value: string): value is Category {
  return (
    (MAIN_CATEGORIES as readonly string[]).includes(value) ||
    (SUB_CATEGORIES as readonly string[]).includes(value)
  );
}

function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
