import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";

const ACTIVE_TENANT_COOKIE = "wpm-active-tenant";

/**
 * Resolve the roleHierarchy for the active tenant from the signed cookie.
 * Falls back to the session JWT value when no cookie is present or invalid.
 */
async function resolveHierarchy(sessionUserId: string, sessionHierarchy: number): Promise<number> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const signed = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
    if (!signed) return sessionHierarchy;

    const lastDot = signed.lastIndexOf(".");
    if (lastDot === -1) return sessionHierarchy;

    const payload = signed.substring(0, lastDot);
    const signature = signed.substring(lastDot + 1);
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (signature.length !== expected.length) return sessionHierarchy;
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) return sessionHierarchy;

    const data = JSON.parse(payload) as { userId?: string; roleHierarchy?: number };
    if (data.userId !== sessionUserId) return sessionHierarchy;
    return data.roleHierarchy ?? sessionHierarchy;
  } catch {
    return sessionHierarchy;
  }
}

/**
 * GET /api/sidebar-links
 * Returns active sidebar links the current user is allowed to see
 * based on their role hierarchy for the currently active tenant.
 */
export async function GET() {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;

  const { auth } = await import("@/lib/auth");
  const session = await auth();
  const sessionHierarchy = session?.user?.roleHierarchy ?? 0;

  // Resolve hierarchy from active-tenant cookie so tenant-switching works correctly
  const hierarchy = await resolveHierarchy(check.userId!, sessionHierarchy);

  const links = await prisma.sidebarLink.findMany({
    where: {
      tenantId: check.tenantId,
      status: "ACTIVE",
      minHierarchy: { lte: hierarchy },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      url: true,
      icon: true,
      description: true,
      openInNewTab: true,
    },
  });

  return NextResponse.json(links);
}
