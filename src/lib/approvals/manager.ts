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

// Der Prisma-Client wird über $extends erweitert (siehe src/lib/prisma.ts).
// Dadurch ist `Prisma.TransactionClient` nicht direkt kompatibel mit dem
// `tx`-Parameter aus extended `prisma.$transaction(async (tx) => ...)`. Wir
// nutzen denselben Pragma-Pattern wie `lib/accounting/dunning.ts`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaTransactionClient = any;

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
export async function findOrCreateApprovalRequest(
  input: CreateApprovalRequestInput,
  tx?: PrismaTransactionClient,
) {
  // Race-Protection: ohne externe TX wrappen wir in eine Serializable-TX
  // damit kein zweiter Request zwischen FindFirst und Create eine
  // Duplikat-PENDING-Approval anlegen kann. Mit externer TX laufen wir
  // bereits im aufrufenden Transaktionskontext.
  const run = async (client: PrismaTransactionClient) => {
    const existing = await client.approvalRequest.findFirst({
      where: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        status: "PENDING",
      },
    });
    if (existing) return existing;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + APPROVAL_TTL_DAYS);
    return client.approvalRequest.create({
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
  };

  if (tx) return run(tx);
  return prisma.$transaction((txClient) => run(txClient), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
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
  // Schritt 0 (read-only): Existenz, Self-Approval-Verbot, Expiry-Check.
  // Diese Prüfungen brauchen keine TX — die eigentliche Race-Protection
  // findet im updateMany-Predicate statt.
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
    // Lazily-expire bevor wir entscheiden — auch hier race-safe via Predicate.
    await prisma.approvalRequest.updateMany({
      where: { id: req.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    throw new ApprovalExpiredError();
  }

  // Schritt 1: Atomares Decision-Commit. updateMany mit Predicate verhindert
  // Race-Conditions:
  //  - status: PENDING → kein Decide auf bereits decided/expired Request
  //  - requestedById != deciderId → Self-Approval-Verbot auf DB-Level
  // Bei count=0 wurde die Request zwischenzeitlich modifiziert → wir
  // re-fetchen den aktuellen Status und werfen den passenden Error.
  const decisionTimestamp = new Date();
  const updateResult = await prisma.approvalRequest.updateMany({
    where: {
      id: req.id,
      tenantId: input.tenantId,
      status: "PENDING",
      requestedById: { not: input.deciderId },
    },
    data: {
      status: input.decision,
      decidedById: input.deciderId,
      decidedAt: decisionTimestamp,
      decisionReason: input.decisionReason ?? null,
    },
  });
  if (updateResult.count === 0) {
    // Race verloren — Status hat sich zwischen Read und Write geändert.
    const current = await prisma.approvalRequest.findFirst({
      where: { id: req.id, tenantId: input.tenantId },
      select: { status: true },
    });
    throw new ApprovalAlreadyDecidedError(current?.status ?? "UNKNOWN");
  }

  // Fetch das soeben aktualisierte Record für den Executor-Kontext.
  const decided = await prisma.approvalRequest.findFirstOrThrow({
    where: { id: req.id, tenantId: input.tenantId },
  });

  // Schritt 2: Bei APPROVED den Executor außerhalb jeder TX laufen lassen
  // (Executor kann eigene TXn öffnen, lange laufen, andere Services callen).
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

/**
 * Liefert alle Requests, die der User entschieden (APPROVED/REJECTED) hat.
 * Genutzt für die Approval-History-Page ("Meine Entscheidungen").
 */
export async function listMyDecisions(tenantId: string, userId: string) {
  return prisma.approvalRequest.findMany({
    where: {
      tenantId,
      decidedById: userId,
      status: { in: ["APPROVED", "REJECTED"] },
    },
    include: {
      requestedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { decidedAt: "desc" },
    take: 50,
  });
}
