/**
 * GET  /api/insurance/policies — Policen auflisten, mit Deckungslücken
 * POST /api/insurance/policies — Police zu einem Versicherungsvertrag anlegen
 *
 * A6 (Audit 2026-07): Policen waren nur `Contract(contractType=INSURANCE)`.
 * „Unterversicherung ist selten, aber existenziell" — deshalb rechnet die
 * Liste die Deckungslücke gleich mit aus, statt sie erst im Schadenfall
 * sichtbar werden zu lassen.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { checkCoverageGap } from "@/lib/insurance/reimbursement";

const COVERAGE_TYPES = [
  "MACHINERY_BREAKDOWN",
  "BUSINESS_INTERRUPTION",
  "LIABILITY",
  "ELEMENTAL",
  "ERECTION",
  "TRANSPORT",
  "LEGAL_PROTECTION",
  "OTHER",
] as const;

const coverageSchema = z.object({
  coverageType: z.enum(COVERAGE_TYPES),
  sumInsuredEur: z.number().nonnegative().nullable().optional(),
  insuredValueEur: z.number().nonnegative().nullable().optional(),
  deductibleType: z.enum(["FIXED_EUR", "PERCENT_OF_LOSS", "PERCENT_OF_SUM_INSURED"]).nullable().optional(),
  deductibleValue: z.number().nonnegative().nullable().optional(),
  indemnityPeriodMonths: z.number().int().positive().nullable().optional(),
  notes: z.string().optional(),
});

const createSchema = z
  .object({
    contractId: z.string().uuid(),
    policyNumber: z.string().max(100).optional(),
    insurerName: z.string().max(200).optional(),
    brokerName: z.string().max(200).optional(),
    sumInsuredEur: z.number().nonnegative().nullable().optional(),
    insuredValueEur: z.number().nonnegative().nullable().optional(),
    waivesUnderinsurance: z.boolean().default(false),
    deductibleType: z.enum(["FIXED_EUR", "PERCENT_OF_LOSS", "PERCENT_OF_SUM_INSURED"]).default("FIXED_EUR"),
    deductibleValue: z.number().nonnegative().default(0),
    deductibleMinEur: z.number().nonnegative().nullable().optional(),
    deductibleMaxEur: z.number().nonnegative().nullable().optional(),
    premiumEur: z.number().nonnegative().nullable().optional(),
    premiumInterval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]).nullable().optional(),
    nextPremiumDue: z.string().nullable().optional(),
    noticePeriodMonths: z.number().int().positive().nullable().optional(),
    notes: z.string().optional(),
    coverages: z.array(coverageSchema).default([]),
    insuredObjects: z
      .array(
        z.object({
          parkId: z.string().uuid().nullable().optional(),
          turbineId: z.string().uuid().nullable().optional(),
          insuredValueEur: z.number().nonnegative().nullable().optional(),
        }),
      )
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (
      data.deductibleMinEur != null &&
      data.deductibleMaxEur != null &&
      data.deductibleMinEur > data.deductibleMaxEur
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["deductibleMaxEur"],
        message: "Der Höchstselbstbehalt liegt unter dem Mindestselbstbehalt",
      });
    }
    // Mindest- und Höchstbetrag sind bei einem festen Selbstbehalt
    // widersprüchlich — sie greifen dort nicht, und ein Feld, das nichts tut,
    // führt in die Irre.
    if (
      data.deductibleType === "FIXED_EUR" &&
      (data.deductibleMinEur != null || data.deductibleMaxEur != null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["deductibleType"],
        message:
          "Mindest- und Höchstselbstbehalt wirken nur bei prozentualen Formen — bei einem festen Betrag bitte weglassen",
      });
    }
    for (const [index, object] of data.insuredObjects.entries()) {
      if (!object.parkId && !object.turbineId) {
        ctx.addIssue({
          code: "custom",
          path: ["insuredObjects", index],
          message: "Versichertes Objekt braucht einen Park oder eine Anlage",
        });
      }
    }
  });

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.INSURANCE_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId");
    /** Nur Policen mit Deckungslücke. */
    const gapsOnly = searchParams.get("gapsOnly") === "true";

    const policies = await prisma.insurancePolicy.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(contractId ? { contractId } : {}),
      },
      include: {
        contract: {
          select: { id: true, title: true, status: true, startDate: true, endDate: true },
        },
        coverages: { orderBy: { coverageType: "asc" } },
        insuredObjects: {
          include: {
            park: { select: { id: true, name: true, shortName: true } },
            turbine: { select: { id: true, designation: true } },
          },
        },
        _count: { select: { claims: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Deckungslücke je Police mitrechnen. Die Frage stellt sich VOR dem
    // Schaden, nicht danach.
    const withGap = policies.map((policy) => {
      // Der Wert aus den versicherten Objekten ist belastbarer als ein
      // pauschaler Wert an der Police — er ist je Objekt gepflegt.
      const objectValue = policy.insuredObjects.reduce(
        (sum, object) => sum + Number(object.insuredValueEur ?? 0),
        0,
      );
      const insuredValueEur =
        objectValue > 0 ? objectValue : policy.insuredValueEur ? Number(policy.insuredValueEur) : null;

      return {
        ...policy,
        coverageGap: checkCoverageGap({
          sumInsuredEur: Number(policy.sumInsuredEur ?? 0),
          insuredValueEur,
          waivesUnderinsurance: policy.waivesUnderinsurance,
        }),
        insuredValueSource: objectValue > 0 ? "INSURED_OBJECTS" : "POLICY",
      };
    });

    return NextResponse.json({
      data: gapsOnly ? withGap.filter((p) => (p.coverageGap.gapEur ?? 0) > 0) : withGap,
    });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] Policen konnten nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Policen konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.INSURANCE_MANAGE);
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
      select: { id: true, title: true, contractType: true },
    });
    if (!contract) {
      return apiError("NOT_FOUND", 404, { message: "Vertrag nicht gefunden" });
    }
    if (contract.contractType !== "INSURANCE") {
      // Eine Police an einem Pacht- oder Wartungsvertrag wäre ein
      // Erfassungsfehler, der später niemandem auffällt.
      return apiError("VALIDATION_FAILED", 400, {
        message: "Der Vertrag ist kein Versicherungsvertrag",
      });
    }

    const existing = await prisma.insurancePolicy.findUnique({
      where: { contractId: data.contractId },
      select: { id: true },
    });
    if (existing) {
      return apiError("ALREADY_EXISTS", 409, {
        message: "Zu diesem Vertrag gibt es bereits eine Police",
        details: { policyId: existing.id },
      });
    }

    // Parks und Anlagen gegen den Mandanten prüfen — die IDs kommen vom Client.
    const parkIds = data.insuredObjects.map((o) => o.parkId).filter(Boolean) as string[];
    const turbineIds = data.insuredObjects.map((o) => o.turbineId).filter(Boolean) as string[];

    if (parkIds.length > 0) {
      const parks = await prisma.park.count({
        where: { id: { in: parkIds }, tenantId: check.tenantId! },
      });
      if (parks !== new Set(parkIds).size) {
        return apiError("NOT_FOUND", 404, { message: "Park nicht gefunden" });
      }
    }
    if (turbineIds.length > 0) {
      const turbines = await prisma.turbine.count({
        where: { id: { in: turbineIds }, park: { tenantId: check.tenantId! } },
      });
      if (turbines !== new Set(turbineIds).size) {
        return apiError("NOT_FOUND", 404, { message: "Anlage nicht gefunden" });
      }
    }

    const created = await prisma.insurancePolicy.create({
      data: {
        tenantId: check.tenantId!,
        contractId: data.contractId,
        policyNumber: data.policyNumber,
        insurerName: data.insurerName,
        brokerName: data.brokerName,
        sumInsuredEur: data.sumInsuredEur ?? null,
        insuredValueEur: data.insuredValueEur ?? null,
        waivesUnderinsurance: data.waivesUnderinsurance,
        deductibleType: data.deductibleType,
        deductibleValue: data.deductibleValue,
        deductibleMinEur: data.deductibleMinEur ?? null,
        deductibleMaxEur: data.deductibleMaxEur ?? null,
        premiumEur: data.premiumEur ?? null,
        premiumInterval: data.premiumInterval ?? null,
        nextPremiumDue: data.nextPremiumDue ? new Date(data.nextPremiumDue) : null,
        noticePeriodMonths: data.noticePeriodMonths ?? null,
        notes: data.notes,
        coverages: {
          create: data.coverages.map((coverage) => ({
            coverageType: coverage.coverageType,
            sumInsuredEur: coverage.sumInsuredEur ?? null,
            insuredValueEur: coverage.insuredValueEur ?? null,
            deductibleType: coverage.deductibleType ?? null,
            deductibleValue: coverage.deductibleValue ?? null,
            indemnityPeriodMonths: coverage.indemnityPeriodMonths ?? null,
            notes: coverage.notes,
          })),
        },
        insuredObjects: {
          create: data.insuredObjects.map((object) => ({
            parkId: object.parkId ?? null,
            turbineId: object.turbineId ?? null,
            insuredValueEur: object.insuredValueEur ?? null,
          })),
        },
      },
      include: { coverages: true, insuredObjects: true },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Contract",
      entityId: data.contractId,
      description: `Versicherungspolice zu "${contract.title}" erfasst`,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] Police konnte nicht angelegt werden");
    return apiError("CREATE_FAILED", 500, { message: "Police konnte nicht angelegt werden" });
  }
}
