/**
 * Whether the current user works in a customer's tenant as platform support
 * (2026-09) — drives the banner "Support-Zugriff bei … bis …" in the header.
 */

import { NextResponse } from "next/server";
import { aktiverMandant } from "@/lib/auth/withPermission";
import { getUserHighestHierarchy, ROLE_HIERARCHY } from "@/lib/auth/permissions";
import { mandantDb } from "@/lib/mandant/mandant-db";

export async function GET() {
  const aktiv = await aktiverMandant();
  if (!aktiv?.fremd || !aktiv.tenantId) return NextResponse.json({ aktiv: false });
  if ((await getUserHighestHierarchy(aktiv.userId)) < ROLE_HIERARCHY.SUPERADMIN) {
    return NextResponse.json({ aktiv: false });
  }

  const db = mandantDb(aktiv.tenantId);
  const [zugriff, mandant] = await Promise.all([
    db.supportZugriff.findFirst({
      where: { beendetAm: null, gueltigBis: { gt: new Date() } },
      orderBy: { gueltigBis: "desc" },
      select: { art: true, gueltigBis: true },
    }),
    db.tenant.findUnique({ where: { id: aktiv.tenantId }, select: { name: true } }),
  ]);
  if (!zugriff) return NextResponse.json({ aktiv: false });

  return NextResponse.json({ aktiv: true, mandant: mandant?.name ?? "", art: zugriff.art, gueltigBis: zugriff.gueltigBis });
}
