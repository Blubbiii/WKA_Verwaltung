/**
 * Platform support: entering a customer's tenant (2026-09).
 *
 * GET  — which tenants currently have an active support access (dates only,
 *        no customer data) for the tenant overview.
 * POST — enter a tenant: needs an active FREIGABE by the customer, or opens
 *        a NOTFALL access with a mandatory reason (one hour, the customer's
 *        admins are notified). Leaving: DELETE /api/user/switch-tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { aktiverSupportZugriff, vergesseZugang, NOTFALL_DAUER_MS } from "@/lib/support/zugang";
import { setzeAktivenMandanten } from "@/lib/auth/aktiver-mandant-cookie";
import { notifyAdmins } from "@/lib/notifications";
import { apiLogger as logger } from "@/lib/logger";

const betretenSchema = z.object({
  tenantId: z.string().min(1),
  notfall: z
    .object({ begruendung: z.string().trim().min(20, "Bitte den Notfall in mindestens 20 Zeichen begründen") })
    .optional(),
});

export async function GET() {
  const check = await requireSuperadmin();
  if (!check.authorized) return check.error!;

  const aktiv = await prisma.supportZugriff.findMany({
    where: { beendetAm: null, gueltigBis: { gt: new Date() } },
    select: { tenantId: true, art: true, gueltigBis: true },
    orderBy: { gueltigBis: "desc" },
  });
  return NextResponse.json({ zugriffe: aktiv });
}

export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    const parsed = betretenSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
      });
    }
    const { tenantId, notfall } = parsed.data;
    if (tenantId === check.tenantId) {
      return apiError("BAD_REQUEST", 400, { message: "Das ist bereits der eigene Mandant" });
    }

    const mandant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, logoUrl: true },
    });
    if (!mandant) return apiError("NOT_FOUND", 404, { message: "Mandant nicht gefunden" });

    let zugriff = notfall ? null : await aktiverSupportZugriff(tenantId);
    if (!notfall && !zugriff) {
      return apiError("FORBIDDEN", 403, {
        message: "Keine Support-Freigabe. Der Kunde kann sie unter Einstellungen → Externe Zugriffe erteilen.",
      });
    }

    if (notfall) {
      zugriff = await prisma.supportZugriff.create({
        data: {
          tenantId,
          art: "NOTFALL",
          superadminId: check.userId!,
          begruendung: notfall.begruendung,
          gueltigBis: new Date(Date.now() + NOTFALL_DAUER_MS),
        },
        select: { id: true, art: true, gueltigBis: true, begruendung: true },
      });
      await notifyAdmins({
        tenantId,
        type: "SYSTEM",
        title: "Notfallzugang des Plattform-Supports",
        message: `Der Plattform-Support hat für eine Stunde Zugriff auf Ihre Daten genommen. Begründung: ${notfall.begruendung}`,
        link: "/settings?tab=zugriffe",
      });
    }

    // Recorded in the customer's tenant: the customer's protocol shows it.
    await prisma.auditLog.create({
      data: {
        action: "IMPERSONATE",
        entityType: "Tenant",
        entityId: tenantId,
        tenantId,
        userId: check.userId!,
        impersonatedById: check.userId!,
        newValues: { support: zugriff!.art, bis: zugriff!.gueltigBis.toISOString(), begruendung: notfall?.begruendung ?? null },
      },
    });

    const sekunden = Math.max(60, Math.floor((zugriff!.gueltigBis.getTime() - Date.now()) / 1000));
    await setzeAktivenMandanten(
      {
        userId: check.userId!,
        activeTenantId: mandant.id,
        tenantName: mandant.name,
        tenantSlug: mandant.slug,
        tenantLogoUrl: mandant.logoUrl,
        roleHierarchy: 100,
        startedAt: new Date().toISOString(),
        support: true,
      },
      sekunden,
    );
    vergesseZugang(tenantId);

    return NextResponse.json({ tenantName: mandant.name, art: zugriff!.art, gueltigBis: zugriff!.gueltigBis });
  } catch (error) {
    logger.error({ err: error }, "[Support] betreten");
    return apiError("INTERNAL_ERROR", 500, { message: "Mandant konnte nicht betreten werden" });
  }
}
