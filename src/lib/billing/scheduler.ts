/**
 * Billing Rule Scheduler
 * Berechnet die nächste Ausführung und plant Regeln
 */

import { prisma } from "@/lib/prisma";
import { BillingRuleFrequency } from "./types";
import { FREQUENCY_CRON_PATTERNS, NextRunInfo } from "./types";

// Note: In Produktion wuerde man hier BullMQ oder einen aehnlichen Job-Scheduler integrieren
// Für das MVP verwenden wir eine einfache Cron-Berechnung

/**
 * Parst eine Cron-Expression und gibt die nächsten Ausführungszeitpunkte zurück
 * Vereinfachte Implementation für Standard-Cron (minute hour day month weekday)
 */
function parseCronExpression(cronPattern: string, count: number = 5): Date[] {
  const parts = cronPattern.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Ungültige Cron-Expression: ${cronPattern}`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const dates: Date[] = [];
  const now = new Date();
  let current = new Date(now);

  // Setze auf nächste volle Minute
  current.setSeconds(0);
  current.setMilliseconds(0);

  // Maximale Iterationen um Endlosschleifen zu vermeiden
  const maxIterations = 365 * 24 * 60; // Ein Jahr in Minuten
  let iterations = 0;

  while (dates.length < count && iterations < maxIterations) {
    iterations++;
    current = new Date(current.getTime() + 60000); // +1 Minute

    // Pruefe ob aktueller Zeitpunkt dem Cron-Pattern entspricht
    if (matchesCron(current, minute, hour, dayOfMonth, month, dayOfWeek)) {
      dates.push(new Date(current));
    }
  }

  return dates;
}

/**
 * Prueft ob ein Datum einem Cron-Pattern entspricht
 */
function matchesCron(
  date: Date,
  minute: string,
  hour: string,
  dayOfMonth: string,
  month: string,
  dayOfWeek: string
): boolean {
  return (
    matchesCronField(date.getMinutes(), minute) &&
    matchesCronField(date.getHours(), hour) &&
    matchesCronField(date.getDate(), dayOfMonth) &&
    matchesCronField(date.getMonth() + 1, month) &&
    matchesCronField(date.getDay(), dayOfWeek)
  );
}

/**
 * Prueft ob ein Wert einem Cron-Feld entspricht
 */
function matchesCronField(value: number, field: string): boolean {
  if (field === "*") return true;

  // Liste von Werten (z.B. "1,4,7,10")
  if (field.includes(",")) {
    const values = field.split(",").map((v) => parseInt(v, 10));
    return values.includes(value);
  }

  // Bereich (z.B. "1-5")
  if (field.includes("-")) {
    const [start, end] = field.split("-").map((v) => parseInt(v, 10));
    return value >= start && value <= end;
  }

  // Intervall (z.B. "*/5")
  if (field.includes("/")) {
    const [base, interval] = field.split("/");
    const intervalNum = parseInt(interval, 10);
    if (base === "*") {
      return value % intervalNum === 0;
    }
    const baseNum = parseInt(base, 10);
    return value >= baseNum && (value - baseNum) % intervalNum === 0;
  }

  // Einzelner Wert
  return value === parseInt(field, 10);
}

/**
 * Berechnet die nächste Ausführung basierend auf Frequenz und dayOfMonth
 */
export function calculateNextRun(
  rule: {
    frequency: BillingRuleFrequency;
    cronPattern: string | null;
    dayOfMonth: number | null;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
  },
  fromDate?: Date
): Date {
  const now = fromDate || new Date();

  // Für CUSTOM_CRON: Cron-Expression parsen
  if (rule.frequency === "CUSTOM_CRON" && rule.cronPattern) {
    const nextRuns = parseCronExpression(rule.cronPattern, 1);
    if (nextRuns.length > 0) {
      return nextRuns[0];
    }
    // Fallback: Morgen
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  // Standard-Frequenzen
  const day = rule.dayOfMonth || 1; // Default: 1. des Monats
  const validDay = Math.min(Math.max(day, 1), 28); // 1-28 (um Feb-Probleme zu vermeiden)

  const next = new Date(now);
  next.setHours(0, 0, 0, 0);

  switch (rule.frequency) {
    case "MONTHLY":
      // Nächster Monat am angegebenen Tag
      if (now.getDate() >= validDay) {
        next.setMonth(next.getMonth() + 1);
      }
      next.setDate(validDay);
      break;

    case "QUARTERLY":
      // Nächstes Quartal (Januar, April, Juli, Oktober)
      const quarterMonths = [0, 3, 6, 9]; // 0-indexed
      const currentMonth = now.getMonth();
      const nextQuarterMonth = quarterMonths.find(
        (m) => m > currentMonth || (m === currentMonth && now.getDate() < validDay)
      );

      if (nextQuarterMonth !== undefined) {
        next.setMonth(nextQuarterMonth);
      } else {
        // Nächstes Jahr Januar
        next.setFullYear(next.getFullYear() + 1);
        next.setMonth(0);
      }
      next.setDate(validDay);
      break;

    case "SEMI_ANNUAL":
      // Halbjährlich (Januar, Juli)
      const semiAnnualMonths = [0, 6];
      const currentMonth2 = now.getMonth();
      const nextSemiMonth = semiAnnualMonths.find(
        (m) => m > currentMonth2 || (m === currentMonth2 && now.getDate() < validDay)
      );

      if (nextSemiMonth !== undefined) {
        next.setMonth(nextSemiMonth);
      } else {
        next.setFullYear(next.getFullYear() + 1);
        next.setMonth(0);
      }
      next.setDate(validDay);
      break;

    case "ANNUAL":
      // Jährlich (Januar)
      if (now.getMonth() > 0 || (now.getMonth() === 0 && now.getDate() >= validDay)) {
        next.setFullYear(next.getFullYear() + 1);
      }
      next.setMonth(0);
      next.setDate(validDay);
      break;

    default:
      // Fallback: Nächster Monat
      next.setMonth(next.getMonth() + 1);
      next.setDate(validDay);
  }

  return next;
}

/**
 * Aktualisiert die nextRunAt für alle aktiven Regeln
 */
export async function scheduleAllRules(tenantId?: string): Promise<NextRunInfo[]> {
  const rules = await prisma.billingRule.findMany({
    where: {
      isActive: true,
      ...(tenantId && { tenantId }),
    },
    select: {
      id: true,
      name: true,
      frequency: true,
      cronPattern: true,
      dayOfMonth: true,
      lastRunAt: true,
      nextRunAt: true,
    },
  });

  const results: NextRunInfo[] = [];

  for (const rule of rules) {
    const nextRunAt = calculateNextRun(rule);

    // Aktualisiere nur wenn sich nextRunAt geändert hat
    if (!rule.nextRunAt || rule.nextRunAt.getTime() !== nextRunAt.getTime()) {
      await prisma.billingRule.update({
        where: { id: rule.id },
        data: { nextRunAt },
      });
    }

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      nextRunAt,
      frequency: rule.frequency,
    });
  }

  return results;
}

/**
 * Gibt alle fälligen Regeln zurück
 */
export async function getDueRules(tenantId?: string): Promise<
  Array<{
    id: string;
    name: string;
    ruleType: string;
    frequency: string;
    nextRunAt: Date | null;
    lastRunAt: Date | null;
  }>
> {
  const now = new Date();

  return prisma.billingRule.findMany({
    where: {
      isActive: true,
      nextRunAt: {
        lte: now,
      },
      ...(tenantId && { tenantId }),
    },
    select: {
      id: true,
      name: true,
      ruleType: true,
      frequency: true,
      nextRunAt: true,
      lastRunAt: true,
    },
    orderBy: {
      nextRunAt: "asc",
    },
  });
}

/**
 * Gibt die nächsten geplanten Ausführungen zurück
 */
export async function getUpcomingRuns(
  tenantId?: string,
  limit: number = 10
): Promise<NextRunInfo[]> {
  const rules = await prisma.billingRule.findMany({
    where: {
      isActive: true,
      nextRunAt: {
        not: null,
      },
      ...(tenantId && { tenantId }),
    },
    select: {
      id: true,
      name: true,
      frequency: true,
      nextRunAt: true,
    },
    orderBy: {
      nextRunAt: "asc",
    },
    take: limit,
  });

  return rules.map((rule) => ({
    ruleId: rule.id,
    ruleName: rule.name,
    nextRunAt: rule.nextRunAt!,
    frequency: rule.frequency,
  }));
}

/**
 * Formatiert ein Cron-Pattern in einen menschenlesbaren String
 */
export function formatCronPattern(
  frequency: BillingRuleFrequency,
  dayOfMonth?: number | null,
  cronPattern?: string | null
): string {
  const day = dayOfMonth || 1;

  switch (frequency) {
    case "MONTHLY":
      return `Monatlich am ${day}.`;
    case "QUARTERLY":
      return `Vierteljährlich am ${day}. (Jan, Apr, Jul, Okt)`;
    case "SEMI_ANNUAL":
      return `Halbjährlich am ${day}. (Jan, Jul)`;
    case "ANNUAL":
      return `Jährlich am ${day}. Januar`;
    case "CUSTOM_CRON":
      return cronPattern || "Benutzerdefiniert";
    default:
      return "Unbekannt";
  }
}

/**
 * Validiert eine Cron-Expression
 */
export function validateCronExpression(cronPattern: string): {
  valid: boolean;
  error?: string;
} {
  try {
    const nextRuns = parseCronExpression(cronPattern, 1);
    if (nextRuns.length === 0) {
      return {
        valid: false,
        error: "Cron-Expression ergibt keine gültigen Ausführungszeitpunkte",
      };
    }
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Ungültige Cron-Expression",
    };
  }
}
