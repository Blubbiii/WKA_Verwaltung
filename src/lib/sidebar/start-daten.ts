/**
 * What the sidebar needs for its first paint, loaded on the server by the
 * dashboard layout: saved group order, favorites, permissions, feature flags.
 * Same sources as /api/user/sidebar-order, /api/user/sidebar-prefs,
 * /api/auth/my-permissions and /api/features. Any failure returns null — the client then fetches as before.
 */
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAuth } from "@/lib/auth/withPermission";
import { getUserPermissions, getUserHighestHierarchy } from "@/lib/auth/permissions";
import { ladeFeatureFlags } from "@/lib/features/tenant-flags";
import { apiLogger as logger } from "@/lib/logger";
import type { UserSettings } from "@/types/dashboard";
import { lesePrefs, type SidebarPrefs } from "@/lib/sidebar/prefs";
import { cookies } from "next/headers";
import { leseZuletzt, ZULETZT_COOKIE, type BesuchteSeite } from "@/lib/sidebar/zuletzt";

export interface SeitenleisteStartDaten {
  gruppenReihenfolge: string[];
  favoriten: SidebarPrefs;
  zuletzt: BesuchteSeite[];
  mandantName: string | null;
  rechte: { permissions: string[]; roleHierarchy: number };
  flags: Record<string, boolean>;
}

export async function ladeSeitenleisteStart(): Promise<SeitenleisteStartDaten | null> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return null;
    // Flags follow the active tenant (superadmin may switch) like /api/features.
    const check = await requireAuth();
    if (!check.authorized) return null;

    const cookieSpeicher = await cookies();
    const [user, rechte, hierarchie, flags] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { settings: true } }),
      getUserPermissions(userId, check.tenantId!),
      getUserHighestHierarchy(userId, check.tenantId!),
      ladeFeatureFlags(check.tenantId),
    ]);
    const settings = (user?.settings as UserSettings | null) ?? {};
    return {
      gruppenReihenfolge: settings.sidebarGroupOrder ?? [],
      favoriten: lesePrefs((settings as Record<string, unknown>).sidebarPrefs),
      zuletzt: leseZuletzt(cookieSpeicher.get(ZULETZT_COOKIE)?.value),
      mandantName: session?.user?.tenantName ?? null,
      rechte: { permissions: rechte.permissions, roleHierarchy: hierarchie },
      flags,
    };
  } catch (err) {
    logger.warn({ err }, "[sidebar] start data unavailable, client will fetch");
    return null;
  }
}
