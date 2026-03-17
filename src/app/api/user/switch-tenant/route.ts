import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getRoleHierarchyForTenant } from "@/lib/auth/role-hierarchy";

const COOKIE_NAME = "wpm-active-tenant";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

function signCookieValue(data: object): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

// POST /api/user/switch-tenant — switch active tenant context
export async function POST(request: NextRequest) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const userId = check.userId!;
  const body = await request.json();
  const tenantId: string = body.tenantId;

  if (!tenantId || typeof tenantId !== "string") {
    return NextResponse.json({ error: "tenantId erforderlich" }, { status: 400 });
  }

  // Verify user is a member of the target tenant
  const membership = await prisma.userTenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: { tenant: { select: { id: true, name: true, slug: true, logoUrl: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Kein Zugriff auf diesen Mandanten" },
      { status: 403 }
    );
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
