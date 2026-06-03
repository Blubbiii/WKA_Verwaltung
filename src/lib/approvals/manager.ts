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
import type { ApprovalAction } from "@prisma/client";

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
      expiresAt,
    },
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

  return prisma.approvalRequest.update({
    where: { id: req.id },
    data: {
      status: input.decision,
      decidedById: input.deciderId,
      decidedAt: new Date(),
      decisionReason: input.decisionReason ?? null,
    },
  });
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
