import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin, requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { apiLogger as logger } from "@/lib/logger";
import { AUTH_CONFIG } from "@/lib/config/auth-config";
import { apiError } from "@/lib/api-errors";
import {
  IMPERSONATION_COOKIE_NAME,
  signImpersonationCookie,
  verifyImpersonationCookie,
} from "@/lib/auth/impersonation-cookie";

const impersonateSchema = z.object({
  userId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
}).refine(d => d.userId || d.tenantId, { message: "userId oder tenantId erforderlich" });

/**
 * K-5-Fix: HMAC-Cookie für Impersonation absichern.
 *  - Fehlt AUTH_SECRET → throw (kein Fallback auf "")
 *  - timingSafeEqual nur nach Längen-Check (sonst RangeError → 500 statt 401)
 *  - exp/iat im Payload für serverseitige Revocation + Ablauf-Check
 *
 * P1-5-Fix: EINE Konstante für Cookie-MaxAge UND HMAC-Payload-exp — beides
 * stammt aus AUTH_CONFIG.impersonationTtlSeconds.
 *
 * F2-Fix: Signier-/Verify-Logik in `@/lib/auth/impersonation-cookie` extrahiert,
 * damit `src/lib/audit.ts` denselben Cookie lesen kann um `impersonatedById` zu setzen.
 */

// POST /api/admin/impersonate - Start impersonating a user
export async function POST(request: NextRequest) {
  try {
const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const result = impersonateSchema.safeParse(body);
    if (!result.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: result.error.flatten().fieldErrors });
    }
    const { userId, tenantId } = result.data;

    let targetUser = null;
    let targetTenant = null;

    if (userId) {
      // Impersonate specific user
      targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          tenantId: true,
          tenant: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      if (!targetUser) {
        return apiError("NOT_FOUND", undefined, { message: "Benutzer nicht gefunden" });
      }

      targetTenant = targetUser.tenant;
    } else if (tenantId) {
      // Impersonate tenant (find first admin user)
      targetTenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true },
      });

      if (!targetTenant) {
        return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
      }

      // Find an active user for this tenant
      targetUser = await prisma.user.findFirst({
        where: {
          tenantId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          tenantId: true,
        },
      });

      if (!targetUser) {
        return apiError("TENANT_MISMATCH", 404, { message: "Kein aktiver Admin-Benutzer in diesem Mandanten gefunden" });
      }
    }

    // Look up the impersonating user's email for the audit record
    const impersonatingUser = await prisma.user.findUnique({
      where: { id: check.userId! },
      select: { email: true },
    });

    // Store impersonation data in a secure cookie
    const impersonationData = {
      originalUserId: check.userId,
      originalEmail: impersonatingUser?.email ?? "",
      targetUserId: targetUser!.id,
      targetEmail: targetUser!.email,
      targetName: `${targetUser!.firstName || ""} ${targetUser!.lastName || ""}`.trim(),
      targetTenantId: targetTenant!.id,
      targetTenantName: targetTenant!.name,
      startedAt: new Date().toISOString(),
    };

    // Set impersonation cookie (secure, httpOnly)
    const cookieStore = await cookies();
    cookieStore.set(IMPERSONATION_COOKIE_NAME, signImpersonationCookie(impersonationData), {
      httpOnly: true,
      // Sicherer Default: in Production immer secure (auch bei Edge-TLS-Termination).
      // Opt-out nur für lokale HTTP-Setups via FORCE_INSECURE_COOKIES=true.
      secure:
        process.env.NODE_ENV === "production" &&
        process.env.FORCE_INSECURE_COOKIES !== "true",
      sameSite: "lax",
      maxAge: AUTH_CONFIG.impersonationTtlSeconds,
      path: "/",
    });

    // Log impersonation event
    await prisma.auditLog.create({
      data: {
        action: "IMPERSONATE",
        entityType: "User",
        entityId: targetUser!.id,
        userId: check.userId,
        tenantId: check.tenantId,
        newValues: {
          targetUser: targetUser!.email,
          targetTenant: targetTenant!.name,
        },
      },
    });

    return NextResponse.json({
      success: true,
      impersonating: {
        user: {
          id: targetUser!.id,
          email: targetUser!.email,
          name: `${targetUser!.firstName || ""} ${targetUser!.lastName || ""}`.trim(),
        },
        tenant: targetTenant,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error starting impersonation");
    if (error instanceof Error && error.message.includes("AUTH_SECRET")) {
      return apiError("INTERNAL_ERROR", 500, {
        message: "Impersonation deaktiviert: AUTH_SECRET nicht konfiguriert",
      });
    }
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Starten der Impersonation" });
  }
}

// DELETE /api/admin/impersonate - Stop impersonating
export async function DELETE(_request: NextRequest) {
  try {
    // Security: Require authentication to stop impersonation
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const cookieStore = await cookies();
    const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE_NAME);

    if (!impersonationCookie) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine aktive Impersonation" });
    }

    // FIX 9 (Compliance): Cookie-Payload für Audit-Log lesen BEVOR er
    // gelöscht wird. Keine Fehler-Weiterreichung — bei ungültigem Cookie
    // wird trotzdem gelöscht, aber ohne Audit-Detail.
    const cookiePayload = verifyImpersonationCookie(impersonationCookie.value);
    const originalUserId =
      (cookiePayload?.originalUserId as string | undefined) ?? null;
    const targetUserId =
      (cookiePayload?.targetUserId as string | undefined) ?? null;
    const targetTenantId =
      (cookiePayload?.targetTenantId as string | undefined) ?? null;

    // Remove the impersonation cookie
    cookieStore.delete(IMPERSONATION_COOKIE_NAME);

    // FIX 9: Impersonation-Stop-Ereignis in AuditLog schreiben.
    // Es gibt keinen dedizierten "IMPERSONATION_STOP" Action-Type — daher
    // "IMPERSONATE" mit description-Diskriminator + strukturierten newValues.
    try {
      await prisma.auditLog.create({
        data: {
          action: "IMPERSONATE",
          entityType: "User",
          entityId: targetUserId ?? check.userId!,
          userId: check.userId,
          tenantId: check.tenantId,
          newValues: {
            event: "STOP",
            originalUserId,
            targetUserId,
            targetTenantId,
          },
        },
      });
    } catch (auditErr) {
      // Audit-Fehler dürfen die Stop-Aktion nicht scheitern lassen
      logger.warn({ err: auditErr }, "Failed to write impersonation-stop audit log");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error stopping impersonation");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Beenden der Impersonation" });
  }
}

// GET /api/admin/impersonate - Get current impersonation status
export async function GET(_request: NextRequest) {
  try {
    // Security: Require authentication to check impersonation status
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const cookieStore = await cookies();
    const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE_NAME);

    if (!impersonationCookie) {
      return NextResponse.json({ impersonating: null });
    }

    const impersonationData = verifyImpersonationCookie(impersonationCookie.value);
    if (!impersonationData) {
      // Invalid or tampered cookie — remove it
      cookieStore.delete(IMPERSONATION_COOKIE_NAME);
      return NextResponse.json({ impersonating: null });
    }

    return NextResponse.json({ impersonating: impersonationData });
  } catch (error) {
    logger.error({ err: error }, "Error getting impersonation status");
    return NextResponse.json({ impersonating: null });
  }
}
