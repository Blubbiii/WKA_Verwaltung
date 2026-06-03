/**
 * Sprint 3 Permissions v2: Approval-Manager-Library.
 *
 * Steuert den Lifecycle von ApprovalRequests:
 *  - createApprovalRequest: erzeugt eine PENDING-Request für eine
 *    4-Augen-pflichtige Aktion.
 *  - approveRequest: setzt Status APPROVED. Caller muss danach die
 *    eigentliche Aktion durchführen (z.B. journal-entry posten).
 *  - rejectRequest: setzt REJECTED mit Begründung.
 *  - listPendingForUser: zeigt Requests die der User entscheiden kann
 *    (= nicht die er selbst initiiert hat).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ApprovalAction } from "@prisma/client";
import { executeApprovedAction } from "./executors";
import { apiLogger as logger } from "@/lib/logger";

/** Default TTL — 7 Tage bis Auto-Expiration. */
export const APPROVAL_TTL_DAYS = 7;

export interface CreateApprovalRequestInput {
  tenantId: string;
  action: ApprovalAction;
  entityType: string;
  entityId: string;
  amountEur: number;
  requestedById: string;
  requestReason?: string;
  /** Aktion-spezifische Parameter, die der Executor beim APPROVED-Decide braucht. */
  actionParams?: Record<string, unknown>;
}

export async function createApprovalRequest(input: CreateApprovalRequestInput) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TTL_DAYS);

  return prisma.approvalRequest.create({
    data: {
      tenantId: input.tenantId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      amountEur: input.amountEur,
      requestedById: input.requestedById,
      requestReason: input.requestReason ?? null,
      actionParams: input.actionParams
        ? (input.actionParams as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      expiresAt,
    },
  });
}

/**
 * Falls bereits ein PENDING ApprovalRequest für (entityType, entityId, action)
 * existiert, gibt diesen zurück. Sonst erzeugt einen neuen. So vermeiden wir
 * Duplikate wenn der User mehrfach klickt.
 */
export async function findOrCreateApprovalRequest(input: CreateApprovalRequestInput) {
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      status: "PENDING",
    },
  });
  if (existing) return existing;
  return createApprovalRequest(input);
}

export class ApprovalNotFoundError extends Error {
  constructor() {
    super("Approval-Request nicht gefunden");
    this.name = "ApprovalNotFoundError";
  }
}

export class ApprovalAlreadyDecidedError extends Error {
  constructor(public readonly status: string) {
    super(`Approval-Request ist bereits ${status}`);
    this.name = "ApprovalAlreadyDecidedError";
  }
}

export class SelfApprovalForbiddenError extends Error {
  constructor() {
    super("Initiator kann eigene Approval-Anfrage nicht selbst entscheiden");
    this.name = "SelfApprovalForbiddenError";
  }
}

export class ApprovalExpiredError extends Error {
  constructor() {
    super("Approval-Anfrage ist abgelaufen");
    this.name = "ApprovalExpiredError";
  }
}

export interface DecideApprovalInput {
  requestId: string;
  tenantId: string;
  deciderId: string;
  decision: "APPROVED" | "REJECTED";
  decisionReason?: string;
}

export async function decideApproval(input: DecideApprovalInput) {
  const req = await prisma.approvalRequest.findFirst({
    where: { id: input.requestId, tenantId: input.tenantId },
  });
  if (!req) throw new ApprovalNotFoundError();
  if (req.status !== "PENDING") {
    throw new ApprovalAlreadyDecidedError(req.status);
  }
  if (req.requestedById === input.deciderId) {
    throw new SelfApprovalForbiddenError();
  }
  if (req.expiresAt.getTime() < Date.now()) {
    // Lazily-expire bevor wir entscheiden
    await prisma.approvalRequest.update({
      where: { id: req.id },
      data: { status: "EXPIRED" },
    });
    throw new ApprovalExpiredError();
  }

  // Schritt 1: Decision committen.
  const decided = await prisma.approvalRequest.update({
    where: { id: req.id },
    data: {
      status: input.decision,
      decidedById: input.deciderId,
      decidedAt: new Date(),
      decisionReason: input.decisionReason ?? null,
    },
  });

  // Schritt 2: Bei APPROVED den Executor laufen lassen und Ergebnis zurückschreiben.
  if (input.decision === "APPROVED") {
    const executionResult = await executeApprovedAction(decided, input.deciderId);
    const updated = await prisma.approvalRequest.update({
      where: { id: decided.id },
      data: {
        executionResult: executionResult.resultData
          ? (executionResult.resultData as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        executionError: executionResult.error ?? null,
        executedAt: new Date(),
      },
    });
    if (!executionResult.success) {
      logger.warn(
        {
          approvalId: decided.id,
          action: decided.action,
          entityId: decided.entityId,
          error: executionResult.error,
        },
        "ApprovalRequest APPROVED — Execute fehlgeschlagen",
      );
    }
    return updated;
  }

  return decided;
}

export async function listPendingForUser(tenantId: string, userId: string) {
  return prisma.approvalRequest.findMany({
    where: {
      tenantId,
      status: "PENDING",
      // 4-Augen: ich kann NICHT meine eigenen Anfragen entscheiden
      NOT: { requestedById: userId },
    },
    include: {
      requestedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { requestedAt: "desc" },
  });
}

export async function listMyRequests(tenantId: string, userId: string) {
  return prisma.approvalRequest.findMany({
    where: { tenantId, requestedById: userId },
    include: {
      decidedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { requestedAt: "desc" },
    take: 50,
  });
}
