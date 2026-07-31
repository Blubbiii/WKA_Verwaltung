/**
 * GET  /api/energy/metering-points — Zählpunkte auflisten
 * POST /api/energy/metering-points — Zählpunkt anlegen
 *
 * A3 (Audit 2026-07): „Zählpunkt / Marktlokations-ID kommen im ganzen
 * Codebase nicht vor." Damit fehlte der Schlüssel, über den sich eine
 * Netzbetreiber-Abrechnung überhaupt einem Park zuordnen lässt.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";

/**
 * Eine Marktlokation hat 11 Ziffern, davon ist die letzte eine Prüfziffer.
 * Eine Messlokation hat 33 Zeichen und beginnt mit dem Ländercode.
 *
 * Geprüft wird die Form, nicht die Prüfziffer: das Verfahren ist zwar
 * spezifiziert, aber Bestandsdaten enthalten regelmässig historische
 * Kennungen, die sie nicht erfüllen. Eine Formprüfung fängt Tippfehler ab,
 * ohne echte Daten abzuweisen.
 */
const MALO_PATTERN = /^\d{11}$/;
const MELO_PATTERN = /^[A-Z]{2}[0-9A-Z]{31}$/;

const createSchema = z
  .object({
    kind: z.enum(["MARKTLOKATION", "MESSLOKATION"]),
    direction: z.enum(["FEED_IN", "CONSUMPTION"]).default("FEED_IN"),
    code: z.string().min(1).max(40),
    parkId: z.string().uuid(),
    turbineId: z.string().uuid().nullable().optional(),
    gridOperator: z.string().max(200).optional(),
    meteringOperator: z.string().max(200).optional(),
    balancingGroup: z.string().max(50).optional(),
    validFrom: z.string().nullable().optional(),
    validTo: z.string().nullable().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const normalized = data.code.replace(/\s/g, "").toUpperCase();
    if (data.kind === "MARKTLOKATION" && !MALO_PATTERN.test(normalized)) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "Eine Marktlokation besteht aus 11 Ziffern",
      });
    }
    if (data.kind === "MESSLOKATION" && !MELO_PATTERN.test(normalized)) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "Eine Messlokation besteht aus 33 Zeichen und beginnt mit dem Ländercode (z. B. DE)",
      });
    }
    if (data.validTo && data.validFrom && new Date(data.validTo) < new Date(data.validFrom)) {
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "Ende liegt vor dem Beginn" });
    }
  });

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.ENERGY_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const code = searchParams.get("code");

    const points = await prisma.meteringPoint.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(parkId ? { parkId } : {}),
        // Nachschlagen einer Kennung aus einer Abrechnung: dafür ist der
        // Schlüssel da.
        ...(code ? { code: { equals: code.replace(/\s/g, "").toUpperCase(), mode: "insensitive" } } : {}),
      },
      include: {
        park: { select: { id: true, name: true, shortName: true } },
        turbine: { select: { id: true, designation: true } },
      },
      orderBy: [{ isActive: "desc" }, { kind: "asc" }, { code: "asc" }],
    });

    return NextResponse.json({ data: points });
  } catch (error) {
    logger.error({ err: error }, "[MeteringPoint] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, { message: "Zählpunkte konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.ENERGY_METERING_POINTS);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: parsed.error.issues,
      });
    }
    const data = parsed.data;

    const park = await prisma.park.findFirst({
      where: { id: data.parkId, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!park) {
      return apiError("NOT_FOUND", 404, { message: "Park nicht gefunden" });
    }

    // Die Anlage muss zum angegebenen Park gehören. Ohne diese Prüfung liesse
    // sich ein Zählpunkt an eine Anlage eines anderen Parks hängen, und der
    // Abgleich zöge die falschen SCADA-Daten heran.
    if (data.turbineId) {
      const turbine = await prisma.turbine.findFirst({
        where: { id: data.turbineId, parkId: data.parkId },
        select: { id: true },
      });
      if (!turbine) {
        return apiError("VALIDATION_FAILED", 400, {
          message: "Die Anlage gehört nicht zum angegebenen Park",
        });
      }
    }

    const normalizedCode = data.code.replace(/\s/g, "").toUpperCase();

    const duplicate = await prisma.meteringPoint.findFirst({
      where: { tenantId: check.tenantId!, code: normalizedCode },
      select: { id: true, parkId: true },
    });
    if (duplicate) {
      // Zwei Datensätze mit derselben Kennung würden eine Abrechnung zwei
      // Parks zuordnen — der Abgleich wäre dann beliebig.
      return apiError("ALREADY_EXISTS", 409, {
        message: "Diese Kennung ist bereits einem Zählpunkt zugeordnet",
        details: { meteringPointId: duplicate.id },
      });
    }

    const created = await prisma.meteringPoint.create({
      data: {
        tenantId: check.tenantId!,
        kind: data.kind,
        direction: data.direction,
        code: normalizedCode,
        parkId: data.parkId,
        turbineId: data.turbineId ?? null,
        gridOperator: data.gridOperator,
        meteringOperator: data.meteringOperator,
        balancingGroup: data.balancingGroup,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validTo: data.validTo ? new Date(data.validTo) : null,
        notes: data.notes,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Park",
      entityId: data.parkId,
      description: `Zählpunkt ${normalizedCode} (${data.kind}) angelegt`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[MeteringPoint] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, { message: "Zählpunkt konnte nicht angelegt werden" });
  }
}
