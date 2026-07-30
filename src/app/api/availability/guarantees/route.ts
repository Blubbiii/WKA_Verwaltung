/**
 * GET  /api/availability/guarantees — Verfügbarkeitsgarantien auflisten
 * POST /api/availability/guarantees — Garantie zu einem Wartungsvertrag erfassen
 *
 * A2 (Audit 2026-07).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { MAIN_CATEGORIES, SUB_CATEGORIES } from "@/lib/availability/contractual-availability";

const ALL_CATEGORIES = [...MAIN_CATEGORIES, ...SUB_CATEGORIES] as const;

const tierSchema = z.object({
  fromPct: z.number().min(0).max(200),
  toPct: z.number().min(0).max(200),
  kind: z.enum(["BONUS", "MALUS"]),
  mode: z.enum(["PER_PERCENTAGE_POINT", "FIXED_EUR", "PERCENT_OF_ANNUAL_VALUE"]),
  amount: z.number(),
  sortOrder: z.number().int().optional(),
});

const createSchema = z
  .object({
    contractId: z.string().uuid(),
    targetAvailabilityPct: z.number().min(0).max(100),
    method: z.enum(["TIME_BASED", "ENERGY_BASED"]).default("TIME_BASED"),
    // Nur Hauptkategorien können "verfügbar" sein — eine Unterkategorie ist
    // definitionsgemäss Teil einer Störung.
    availableCategories: z.array(z.enum(MAIN_CATEGORIES)).min(1),
    excludedCategories: z.array(z.enum(ALL_CATEGORIES)).default([]),
    exclusionNotes: z.string().optional(),
    pointRounding: z.enum(["UP", "DOWN", "EXACT"]).default("UP"),
    maxMalusEur: z.number().nonnegative().nullable().optional(),
    maxBonusEur: z.number().nonnegative().nullable().optional(),
    validFrom: z.string(),
    validTo: z.string().nullable().optional(),
    notes: z.string().optional(),
    tiers: z.array(tierSchema).default([]),
  })
  .superRefine((data, ctx) => {
    // Eine Kategorie kann nicht zugleich verfügbar und ausgeschlossen sein.
    // Der Rechenkern weist das ohnehin ab — hier gibt es dafür eine Meldung
    // beim Erfassen statt erst bei der Abrechnung.
    const overlap = data.availableCategories.filter((c) => data.excludedCategories.includes(c));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["excludedCategories"],
        message: `${overlap.join(", ").toUpperCase()} ist zugleich als verfügbar und ausgeschlossen angegeben`,
      });
    }

    for (const [index, tier] of data.tiers.entries()) {
      if (tier.toPct <= tier.fromPct) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", index, "toPct"],
          message: "Die obere Grenze muss über der unteren liegen",
        });
      }
    }

    // Überlappende Staffeln machen die Abrechnung uneindeutig. Der Rechenkern
    // meldet das zur Laufzeit; besser gar nicht erst speichern.
    const sorted = [...data.tiers].sort((a, b) => a.fromPct - b.fromPct);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].fromPct < sorted[i - 1].toPct) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers"],
          message: `Die Staffeln ${sorted[i - 1].fromPct}–${sorted[i - 1].toPct} % und ${sorted[i].fromPct}–${sorted[i].toPct} % überlappen sich`,
        });
        break;
      }
    }

    if (data.validTo && new Date(data.validTo) < new Date(data.validFrom)) {
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "Ende liegt vor dem Beginn" });
    }
  });

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.AVAILABILITY_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const guarantees = await prisma.availabilityGuarantee.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(contractId ? { contractId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        tiers: { orderBy: { sortOrder: "asc" } },
        contract: {
          select: {
            id: true,
            title: true,
            contractNumber: true,
            annualValue: true,
            park: { select: { id: true, name: true, shortName: true } },
          },
        },
        _count: { select: { settlements: true } },
      },
      orderBy: [{ isActive: "desc" }, { validFrom: "desc" }],
    });

    return NextResponse.json({ data: guarantees });
  } catch (error) {
    logger.error({ err: error }, "[Availability] Garantien konnten nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Garantien konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.AVAILABILITY_MANAGE);
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

    const contract = await prisma.contract.findFirst({
      where: { id: data.contractId, tenantId: check.tenantId!, deletedAt: null },
      select: { id: true, title: true, parkId: true },
    });
    if (!contract) {
      return apiError("NOT_FOUND", 404, { message: "Wartungsvertrag nicht gefunden" });
    }

    // Ohne Park gibt es keine Anlagen und damit keine Verfügbarkeit. Das wird
    // hier gemeldet statt später bei der Abrechnung — dann steht die Garantie
    // schon im System und niemand versteht, warum sie nichts liefert.
    if (!contract.parkId) {
      return apiError("VALIDATION_FAILED", 400, {
        message:
          "Der Vertrag ist keinem Park zugeordnet. Ohne Park lässt sich die Verfügbarkeit nicht ermitteln.",
      });
    }

    const created = await prisma.availabilityGuarantee.create({
      data: {
        tenantId: check.tenantId!,
        contractId: data.contractId,
        targetAvailabilityPct: data.targetAvailabilityPct,
        method: data.method,
        availableCategories: data.availableCategories,
        excludedCategories: data.excludedCategories,
        exclusionNotes: data.exclusionNotes,
        pointRounding: data.pointRounding,
        maxMalusEur: data.maxMalusEur ?? null,
        maxBonusEur: data.maxBonusEur ?? null,
        validFrom: new Date(data.validFrom),
        validTo: data.validTo ? new Date(data.validTo) : null,
        notes: data.notes,
        tiers: {
          create: data.tiers.map((tier, index) => ({
            fromPct: tier.fromPct,
            toPct: tier.toPct,
            kind: tier.kind,
            mode: tier.mode,
            amount: tier.amount,
            sortOrder: tier.sortOrder ?? index,
          })),
        },
      },
      include: { tiers: true },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Contract",
      entityId: data.contractId,
      description: `Verfügbarkeitsgarantie ${data.targetAvailabilityPct} % zu "${contract.title}" erfasst`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Availability] Garantie konnte nicht angelegt werden");
    return apiError("CREATE_FAILED", 500, { message: "Garantie konnte nicht angelegt werden" });
  }
}
