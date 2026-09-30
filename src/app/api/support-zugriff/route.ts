/**
 * Support access from the customer's side (2026-09).
 *
 * GET    (settings:read)   — active access, history, protocol of the
 *                            support's actions in this tenant
 * POST   (settings:update) — grant for 1 h / 1 d / 7 d (replaces an active grant)
 * DELETE (settings:update) — end every active access now, emergency included
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { createAuditLog } from "@/lib/audit";
import { gueltigBisFuer, vergesseZugang } from "@/lib/support/zugang";
import { apiLogger as logger } from "@/lib/logger";

const erteilenSchema = z.object({ laufzeit: z.enum(["1h", "1d", "7d"]) });

const AKTIV = () => ({ beendetAm: null, gueltigBis: { gt: new Date() } });

export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);

    const [aktiv, verlauf, protokoll] = await Promise.all([
      db.supportZugriff.findFirst({ where: AKTIV(), orderBy: { gueltigBis: "desc" } }),
      db.supportZugriff.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      // AuditLog has an optional tenantId — not scoped by mandantDb, so explicit.
      db.auditLog.findMany({
        where: { tenantId: check.tenantId!, impersonatedById: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, action: true, entityType: true, entityId: true, newValues: true, createdAt: true },
      }),
    ]);

    // Names of the customer's own admins who granted or ended an access.
    const ids = [...new Set(verlauf.flatMap((v) => [v.erteiltVonId, v.beendetVonId]).filter((x): x is string => !!x))];
    const personen = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const name = new Map(personen.map((p) => [p.id, [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email]));

    return NextResponse.json({
      aktiv: aktiv && { id: aktiv.id, art: aktiv.art, gueltigBis: aktiv.gueltigBis, begruendung: aktiv.begruendung },
      verlauf: verlauf.map((v) => ({
        id: v.id,
        art: v.art,
        erstellt: v.createdAt,
        gueltigBis: v.gueltigBis,
        beendetAm: v.beendetAm,
        begruendung: v.begruendung,
        erteiltVon: v.erteiltVonId ? (name.get(v.erteiltVonId) ?? null) : null,
        beendetVon: v.beendetVonId ? (name.get(v.beendetVonId) ?? null) : null,
      })),
      protokoll,
    });
  } catch (error) {
    logger.error({ err: error }, "[Support] GET");
    return apiError("FETCH_FAILED", 500, { message: "Support-Zugriff konnte nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);

    const parsed = erteilenSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("VALIDATION_FAILED", 400, { message: "Laufzeit 1h, 1d oder 7d" });

    const jetzt = new Date();
    const neu = await db.$transaction(async (tx) => {
      await tx.supportZugriff.updateMany({
        where: { art: "FREIGABE", ...AKTIV() },
        data: { beendetAm: jetzt, beendetVonId: check.userId! },
      });
      return tx.supportZugriff.create({
        data: {
          tenantId: check.tenantId!,
          art: "FREIGABE",
          erteiltVonId: check.userId!,
          gueltigBis: gueltigBisFuer(parsed.data.laufzeit, jetzt),
        },
      });
    });
    vergesseZugang(check.tenantId!);

    await createAuditLog({
      action: "CREATE",
      entityType: "SupportZugriff",
      entityId: neu.id,
      newValues: { art: "FREIGABE", gueltigBis: neu.gueltigBis.toISOString() },
      description: "Support-Freigabe erteilt",
    });

    return NextResponse.json({ id: neu.id, gueltigBis: neu.gueltigBis }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Support] POST");
    return apiError("CREATE_FAILED", 500, { message: "Freigabe konnte nicht erteilt werden" });
  }
}

export async function DELETE() {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);

    const beendet = await db.supportZugriff.updateMany({
      where: AKTIV(),
      data: { beendetAm: new Date(), beendetVonId: check.userId! },
    });
    vergesseZugang(check.tenantId!);

    if (beendet.count > 0) {
      await createAuditLog({
        action: "UPDATE",
        entityType: "SupportZugriff",
        entityId: check.tenantId!,
        newValues: { beendet: beendet.count },
        description: "Support-Zugriff vom Kunden beendet",
      });
    }
    return NextResponse.json({ beendet: beendet.count });
  } catch (error) {
    logger.error({ err: error }, "[Support] DELETE");
    return apiError("UPDATE_FAILED", 500, { message: "Support-Zugriff konnte nicht beendet werden" });
  }
}
