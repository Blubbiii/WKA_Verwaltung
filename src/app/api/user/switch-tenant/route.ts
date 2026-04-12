import crypto from "crypto";
import { apiError } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getRoleHierarchyForTenant } from "@/lib/auth/role-hierarchy";
import { z } from "zod";

const switchTenantSchema = z.object({
  tenantId: z.string().min(1, "tenantId ist erforderlich"),
});

const COOKIE_NAME = "wpm-active-tenant";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

function signCookieValue(data: object): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function verifyCookieValue(signed: string): Record<string, unknown> | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = signed.substring(0, lastDot);
  const signature = signed.substring(lastDot + 1);
  try {
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (signature.length !== expected.length) return null;
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) return null;
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// GET /api/user/switch-tenant — return active tenant from signed cookie
export async function GET() {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const cookieStore = await cookies();
  const signed = cookieStore.get(COOKIE_NAME)?.value;

  if (!signed) {
    return NextResponse.json({ activeTenantId: null });
  }

  const data = verifyCookieValue(signed);
  // Extra safety: cookie must belong to the current user
  if (!data || data.userId !== check.userId) {
    return NextResponse.json({ activeTenantId: null });
  }

  return NextResponse.json({
    activeTenantId: data.activeTenantId,
    tenantName: data.tenantName,
    tenantSlug: data.tenantSlug,
    tenantLogoUrl: data.tenantLogoUrl,
    roleHierarchy: data.roleHierarchy,
  });
}

// POST /api/user/switch-tenant — switch active tenant context
export async function POST(request: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const userId = check.userId!;
  const body = await request.json();
  const parsed = switchTenantSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
  }
  const { tenantId } = parsed.data;

  // Verify user is a member of the target tenant
  const membership = await prisma.userTenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: { tenant: { select: { id: true, name: true, slug: true, logoUrl: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return apiError("FORBIDDEN", 403, { message: "Kein Zugriff auf diesen Mandanten" });
  }

  const roleHierarchy = await getRoleHierarchyForTenant(userId, tenantId);

  const cookieData = {
    activeTenantId: tenantId,
    tenantName: membership.tenant.name,
    tenantSlug: membership.tenant.slug,
    tenantLogoUrl: membership.tenant.logoUrl,
    roleHierarchy,
    userId,
    startedAt: new Date().toISOString(),
  };

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signCookieValue(cookieData), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
  });

  return NextResponse.json({
    tenantId,
    tenantName: membership.tenant.name,
    tenantSlug: membership.tenant.slug,
    tenantLogoUrl: membership.tenant.logoUrl,
    roleHierarchy,
  });
}

// DELETE /api/user/switch-tenant — return to primary tenant
export async function DELETE() {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);

  return NextResponse.json({ ok: true });
}
