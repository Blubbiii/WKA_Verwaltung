/**
 * Sidebar-Counts: ein zentraler Endpoint für alle Badge-Zahlen.
 *
 * Ein Roundtrip statt N — vorher hätte jede Badge einen eigenen Fetch
 * ausgelöst (N+1 für die ganze Sidebar). Jetzt liefert dieser Endpoint
 * alle Counts auf einmal, mit Tenant-Scope und Permission-aware.
 *
 * Counts ohne Permission: der Server liefert bewusst 0 statt 403, damit
 * der Client nicht prüfen muss und keine Badge-Counts von Daten leakt,
 * die der User nicht sehen darf. Permission-Lookups sind in einem
 * `Promise.allSettled`-Block — fällt einer aus, liefern die anderen
 * weiter ihren Wert.
 *
 * Cache: 30 s Redis-Cache pro (tenantId, userId) — Counts müssen nicht
 * exakt sein; der Hook polled ohnehin alle 60 s.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { checkPermission } from "@/lib/auth/permissions";
import { cache } from "@/lib/cache";
import { apiLogger as logger } from "@/lib/logger";
import {
  EMPTY_SIDEBAR_COUNTS,
  type SidebarCounts,
} from "@/lib/sidebar-counts";
import { MS_PER_DAY } from "@/lib/constants/time";

const CACHE_TTL_SECONDS = 30;

async function hasPermission(userId: string, perm: string): Promise<boolean> {
  try {
    const res = await checkPermission(userId, perm);
    return res.hasPermission;
  } catch {
    return false;
  }
}

async function computeSidebarCounts(
  tenantId: string,
  userId: string,
): Promise<SidebarCounts> {
  // Permission-Checks parallel — wir fragen für jeden Count die nötige Permission
  // ab und überspringen den Count wenn nicht erlaubt (returns 0).
  const [
    canSeeApprovals,
    canSeeInbox,
    canSeeInvoices,
    canSeeBank,
    canSeeContracts,
  ] = await Promise.all([
    hasPermission(userId, "accounting:read"),
    hasPermission(userId, "incoming-invoices:read"),
    hasPermission(userId, "invoices:read"),
    hasPermission(userId, "accounting:read"),
    hasPermission(userId, "contracts:read"),
  ]);

  // Jeden Count in einem isolierten try/catch — wenn ein DB-Query fehlschlägt
  // (Schema-Drift, Connection-Hick), liefern die anderen weiter ihren Wert.
  const now = new Date();
  const horizon30d = new Date(now.getTime() + 30 * MS_PER_DAY);

  const queries = await Promise.allSettled([
    // 1. approvals — pending Requests, nicht vom User selbst initiiert
    canSeeApprovals
      ? prisma.approvalRequest.count({
          where: {
            tenantId,
            status: "PENDING",
            requestedById: { not: userId },
            expiresAt: { gt: now },
          },
        })
      : Promise.resolve(0),

    // 2. inbox — IncomingInvoices die noch Review brauchen
    canSeeInbox
      ? prisma.incomingInvoice.count({
          where: {
            tenantId,
            deletedAt: null,
            status: { in: ["INBOX", "REVIEW"] },
          },
        })
      : Promise.resolve(0),

    // 3. mahnwesen — überfällige Rechnungen
    canSeeInvoices
      ? prisma.invoice.count({
          where: {
            tenantId,
            deletedAt: null,
            invoiceType: "INVOICE",
            status: { in: ["SENT", "PARTIALLY_PAID"] },
            dueDate: { lt: now },
          },
        })
      : Promise.resolve(0),

    // 4. bankUnmatched — Bank-Transaktionen ohne Match
    canSeeBank
      ? prisma.bankTransaction.count({
          where: {
            tenantId,
            matchStatus: "UNMATCHED",
          },
        })
      : Promise.resolve(0),

    // 5. expiringContracts — aktive Verträge mit Frist in den nächsten 30 Tagen
    canSeeContracts
      ? prisma.contract.count({
          where: {
            tenantId,
            deletedAt: null,
            status: "ACTIVE",
            endDate: { gte: now, lte: horizon30d },
          },
        })
      : Promise.resolve(0),
  ]);

  function asCount(idx: number): number {
    const r = queries[idx];
    if (r.status === "fulfilled" && typeof r.value === "number") return r.value;
    if (r.status === "rejected") {
      logger.warn(
        { reason: r.reason, idx, tenantId },
        "[sidebar-counts] query failed",
      );
    }
    return 0;
  }

  return {
    approvals: asCount(0),
    inbox: asCount(1),
    mahnwesen: asCount(2),
    bankUnmatched: asCount(3),
    expiringContracts: asCount(4),
  };
}

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;
    const userId = check.userId!;
    const tenantId = check.tenantId;
    if (!tenantId) {
      return NextResponse.json({ ...EMPTY_SIDEBAR_COUNTS });
    }

    const cacheKey = `sidebar-counts:${userId}`;
    const counts = await cache.getOrSet<SidebarCounts>(
      cacheKey,
      () => computeSidebarCounts(tenantId, userId),
      CACHE_TTL_SECONDS,
      tenantId,
    );

    return NextResponse.json(counts);
  } catch (error) {
    logger.error({ err: error }, "[sidebar-counts] Error");
    // Soft-fail: lieber 0er-Counts liefern als die Sidebar zu blockieren
    return NextResponse.json({ ...EMPTY_SIDEBAR_COUNTS });
  }
}
