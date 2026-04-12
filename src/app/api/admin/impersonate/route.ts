import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin, requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { apiLogger as logger } from "@/lib/logger";
import { AUTH_CONFIG } from "@/lib/config/auth-config";
import { apiError } from "@/lib/api-errors";

const impersonateSchema = z.object({
  userId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
}).refine(d => d.userId || d.tenantId, { message: "userId oder tenantId erforderlich" });

function signCookieValue(data: object): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function verifyCookieValue(signed: string): object | null {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = signed.substring(0, lastDot);
  const signature = signed.substring(lastDot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

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
    cookieStore.set("impersonation", signCookieValue(impersonationData), {
      httpOnly: true,
      secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
      sameSite: "lax",
      maxAge: AUTH_CONFIG.impersonationMaxAge,
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
    const impersonationCookie = cookieStore.get("impersonation");

    if (!impersonationCookie) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine aktive Impersonation" });
    }

    // Remove the impersonation cookie
    cookieStore.delete("impersonation");

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
    const impersonationCookie = cookieStore.get("impersonation");

    if (!impersonationCookie) {
      return NextResponse.json({ impersonating: null });
    }

    const impersonationData = verifyCookieValue(impersonationCookie.value);
    if (!impersonationData) {
      // Invalid or tampered cookie — remove it
      cookieStore.delete("impersonation");
      return NextResponse.json({ impersonating: null });
    }

    return NextResponse.json({ impersonating: impersonationData });
  } catch (error) {
    logger.error({ err: error }, "Error getting impersonation status");
    return NextResponse.json({ impersonating: null });
  }
}
