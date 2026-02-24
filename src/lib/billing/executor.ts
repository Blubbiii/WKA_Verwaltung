/**
 * Billing Rule Executor
 * Fuehrt Abrechnungsregeln aus und protokolliert die Ergebnisse
 */

import { prisma } from "@/lib/prisma";
import { billingLogger } from "@/lib/logger";
import { BillingRuleType } from "./types";
import {
  ExecuteRuleOptions,
  ExecutionResult,
  BillingRuleParameters,
  RuleHandler,
} from "./types";
import { monthlyLeaseHandler } from "./rules/monthly-lease";
import { leaseAdvanceHandler } from "./rules/lease-advance";
import { distributionHandler } from "./rules/distribution";
import { managementFeeHandler } from "./rules/management-fee";
import { customRuleHandler } from "./rules/custom";
import { calculateNextRun } from "./scheduler";

/**
 * Mapping von Rule-Typ zu Handler
 */
const ruleHandlers: Record<BillingRuleType, RuleHandler> = {
  [BillingRuleType.LEASE_PAYMENT]: monthlyLeaseHandler,
  [BillingRuleType.LEASE_ADVANCE]: leaseAdvanceHandler,
  [BillingRuleType.DISTRIBUTION]: distributionHandler,
  [BillingRuleType.MANAGEMENT_FEE]: managementFeeHandler,
  [BillingRuleType.CUSTOM]: customRuleHandler,
};

/**
 * Holt den passenden Handler für einen Regel-Typ
 */
export function getHandler(ruleType: BillingRuleType): RuleHandler {
  const handler = ruleHandlers[ruleType];
  if (!handler) {
    throw new Error(`Kein Handler für Regel-Typ "${ruleType}" gefunden`);
  }
  return handler;
}

/**
 * Fuehrt eine Abrechnungsregel aus
 *
 * @param ruleId - ID der auszufuehrenden Regel
 * @param options - Ausführungsoptionen (dryRun, forceRun, etc.)
 * @returns ExecutionResult mit Details zur Ausführung
 */
export async function executeRule(
  ruleId: string,
  options: ExecuteRuleOptions = {}
): Promise<ExecutionResult> {
  // Lade die Regel
  const rule = await prisma.billingRule.findUnique({
    where: { id: ruleId },
    include: {
      tenant: {
        select: { id: true, name: true },
      },
    },
  });

  if (!rule) {
    throw new Error(`Regel mit ID "${ruleId}" nicht gefunden`);
  }

  if (!rule.isActive && !options.forceRun) {
    throw new Error(`Regel "${rule.name}" ist nicht aktiv`);
  }

  // Prüfe ob nextRunAt bereits erreicht ist (wenn nicht forceRun)
  if (!options.forceRun && !options.dryRun && rule.nextRunAt) {
    const now = new Date();
    if (rule.nextRunAt > now) {
      throw new Error(
        `Regel "${rule.name}" ist erst am ${rule.nextRunAt.toLocaleDateString("de-DE")} fällig`
      );
    }
  }

  // Hole den passenden Handler
  const handler = getHandler(rule.ruleType);

  // Parameter validieren
  const parameters = rule.parameters as BillingRuleParameters;
  if (!handler.validateParameters(parameters)) {
    throw new Error(`Ungültige Parameter für Regel "${rule.name}"`);
  }

  // Merge Override-Parameter
  const mergedParameters = options.overrideParameters
    ? { ...parameters, ...options.overrideParameters }
    : parameters;

  // Erstelle Execution Record (nur wenn nicht dryRun)
  let executionId: string | undefined;
  if (!options.dryRun) {
    const execution = await prisma.billingRuleExecution.create({
      data: {
        ruleId: rule.id,
        status: "success", // Wird später aktualisiert
        startedAt: new Date(),
      },
    });
    executionId = execution.id;
  }

  try {
    // Fuehre die Regel aus
    const result = await handler.execute(rule.tenantId, mergedParameters, options);

    // Setze executionId im Ergebnis
    result.executionId = executionId;

    // Aktualisiere Execution Record (nur wenn nicht dryRun)
    if (!options.dryRun && executionId) {
      await prisma.billingRuleExecution.update({
        where: { id: executionId },
        data: {
          status: result.status,
          completedAt: new Date(),
          invoicesCreated: result.invoicesCreated,
          totalAmount: result.totalAmount,
          errorMessage: result.errorMessage,
          details: result.details as unknown as Record<string, unknown>,
        },
      });

      // Aktualisiere lastRunAt und nextRunAt der Regel
      const nextRunAt = calculateNextRun(rule);
      await prisma.billingRule.update({
        where: { id: rule.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt,
        },
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";

    // Aktualisiere Execution Record mit Fehler
    if (!options.dryRun && executionId) {
      await prisma.billingRuleExecution.update({
        where: { id: executionId },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage,
        },
      });
    }

    return {
      status: "failed",
      invoicesCreated: 0,
      totalAmount: 0,
      errorMessage,
      executionId,
      details: {
        invoices: [],
        summary: {
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
        },
      },
    };
  }
}

/**
 * Fuehrt einen Dry-Run einer Regel aus (ohne Rechnungen zu erstellen)
 */
export async function previewRule(ruleId: string): Promise<ExecutionResult> {
  return executeRule(ruleId, { dryRun: true });
}

/**
 * Fuehrt alle fälligen Regeln aus
 *
 * @param tenantId - Optional: Nur Regeln eines bestimmten Tenants
 * @returns Array von ExecutionResults
 */
export async function executeAllDueRules(
  tenantId?: string
): Promise<ExecutionResult[]> {
  const now = new Date();

  // Finde alle fälligen Regeln
  const dueRules = await prisma.billingRule.findMany({
    where: {
      isActive: true,
      nextRunAt: {
        lte: now,
      },
      ...(tenantId && { tenantId }),
    },
    orderBy: {
      nextRunAt: "asc",
    },
  });

  const results: ExecutionResult[] = [];

  for (const rule of dueRules) {
    try {
      const result = await executeRule(rule.id);
      results.push(result);
    } catch (error) {
      billingLogger.error({ err: error, ruleId: rule.id }, `Failed to execute billing rule ${rule.id}`);
      results.push({
        status: "failed",
        invoicesCreated: 0,
        totalAmount: 0,
        errorMessage: error instanceof Error ? error.message : "Unbekannter Fehler",
        details: {
          invoices: [],
          summary: {
            totalProcessed: 0,
            successful: 0,
            failed: 1,
            skipped: 0,
          },
        },
      });
    }
  }

  return results;
}

/**
 * Prueft ob eine Regel gültige Parameter hat
 */
export function validateRuleParameters(
  ruleType: BillingRuleType,
  parameters: unknown
): { valid: boolean; error?: string } {
  try {
    const handler = getHandler(ruleType);
    const isValid = handler.validateParameters(parameters);

    if (!isValid) {
      return {
        valid: false,
        error: `Ungültige Parameter für Regel-Typ "${ruleType}"`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
    };
  }
}
