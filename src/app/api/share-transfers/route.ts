/**
 * GET  /api/share-transfers — Anteilsübertragungen eines Fonds
 * POST /api/share-transfers — Übertragung erfassen (noch nicht vollzogen)
 *
 * A8 (Audit 2026-07): „Anteilsübertragung ist nicht abgebildet." Bisher wurde
 * beim Verkauf der Stammsatz überschrieben — die Gesellschafterliste zum
 * letzten Bilanzstichtag ist danach nicht mehr rekonstruierbar.
 *
 * Das Anlegen vollzieht NICHTS. Der Vollzug ist ein eigener Schritt hinter
 * einem eigenen Recht, weil er die zum Handelsregister eingereichte
 * Gesellschafterliste ändert.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { PAGE_SIZE_DEFAULT } from "@/lib/config/pagination";
import { checkTransfer } from "@/lib/shareholding/transfer-service";
import { resolveShareholderSharesFrom } from "@/lib/shareholding/resolve-shares";
import { shareRegisterAt } from "@/lib/shareholding/distribution-split";

const TRANSFER_TYPES = ["SALE", "GIFT", "INHERITANCE", "REDEMPTION", "ISSUE"] as const;

const createSchema = z.object({
  fundId: z.string().uuid(),
  type: z.enum(TRANSFER_TYPES),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromShareholderId: z.string().uuid().nullable().optional(),
  toShareholderId: z.string().uuid().nullable().optional(),
  sharePercent: z.number().positive().max(100),
  capitalAmount: z.number().nonnegative().nullable().optional(),
  priceEur: z.number().nonnegative().nullable().optional(),
  consentRequired: z.boolean().default(true),
  consentGrantedAt: z.string().nullable().optional(),
  consentReference: z.string().max(200).optional(),
  notarizedAt: z.string().nullable().optional(),
  notaryName: z.string().max(200).optional(),
  documentId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});

const PREFIX = "AT";
const DIGITS = 4;

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit")) || PAGE_SIZE_DEFAULT, 200);

    const transfers = await prisma.shareTransfer.findMany({
      where: {
        tenantId: check.tenantId!,
        ...(fundId ? { fundId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        fund: { select: { id: true, name: true } },
        fromShareholder: { select: { id: true, shareholderNumber: true, person: PERSON_SELECT } },
        toShareholder: { select: { id: true, shareholderNumber: true, person: PERSON_SELECT } },
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json({ transfers });
  } catch (error) {
    logger.error({ err: error }, "Error fetching share transfers");
    return apiError("FETCH_FAILED", undefined, {
      message: "Fehler beim Laden der Anteilsübertragungen",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_TRANSFER);
    if (!check.authorized) return check.error;

    const data = createSchema.parse(await request.json());
    const effectiveDate = new Date(`${data.effectiveDate}T00:00:00.000Z`);

    const fund = await prisma.fund.findFirst({
      where: { id: data.fundId, tenantId: check.tenantId! },
      select: {
        id: true,
        shareholders: {
          select: {
            id: true,
            entryDate: true,
            exitDate: true,
            ownershipPercentage: true,
            distributionPercentage: true,
            shareHistory: {
              select: { sharePercent: true, validFrom: true, validTo: true },
              orderBy: { validFrom: "asc" },
            },
          },
        },
      },
    });

    if (!fund) {
      return apiError("NOT_FOUND", undefined, { message: "Gesellschaft nicht gefunden" });
    }

    // Beide Beteiligten müssen zu DIESEM Fonds gehören — sonst entstünde eine
    // Übertragung quer über zwei Gesellschaften.
    const ids = new Set(fund.shareholders.map((s) => s.id));
    for (const [label, id] of [
      ["Der abgebende", data.fromShareholderId],
      ["Der erwerbende", data.toShareholderId],
    ] as const) {
      if (id && !ids.has(id)) {
        return apiError("BAD_REQUEST", undefined, {
          message: `${label} Gesellschafter gehört nicht zu dieser Gesellschaft`,
        });
      }
    }

    // Stand am Stichtag ermitteln — daran wird geprüft, ob überhaupt so viel
    // übertragen werden kann.
    const resolved = resolveShareholderSharesFrom(fund.shareholders);
    const register = shareRegisterAt(resolved.shares, effectiveDate);
    const fromEntry = data.fromShareholderId
      ? register.find((r) => r.shareholderId === data.fromShareholderId)
      : undefined;
    const totalSharePercent = register.reduce((sum, r) => sum + r.sharePercent, 0);

    const verdict = checkTransfer(
      {
        id: "neu",
        type: data.type,
        effectiveDate,
        sharePercent: data.sharePercent,
        capitalAmount: data.capitalAmount ?? null,
        consentRequired: data.consentRequired,
        // Beim ANLEGEN ist die fehlende Zustimmung kein Hindernis — der
        // Vorgang darf erfasst und die Zustimmung nachgereicht werden. Nur der
        // Vollzug verlangt sie.
        consentGrantedAt: data.consentGrantedAt ? new Date(data.consentGrantedAt) : new Date(),
        fromShareholderId: data.fromShareholderId ?? null,
        toShareholderId: data.toShareholderId ?? null,
      },
      {
        fromSharePercent: fromEntry ? fromEntry.sharePercent : data.fromShareholderId ? 0 : null,
        totalSharePercent,
      },
    );

    if (!verdict.ok) {
      return apiError("VALIDATION_FAILED", 400, {
        message: verdict.problems[0],
        details: { problems: verdict.problems },
      });
    }

    const consentGrantedAt = data.consentGrantedAt ? new Date(data.consentGrantedAt) : null;
    const transferNumber = await nextTransferNumber(check.tenantId!, effectiveDate);

    const transfer = await prisma.shareTransfer.create({
      data: {
        transferNumber,
        fundId: data.fundId,
        tenantId: check.tenantId!,
        type: data.type,
        status: data.consentRequired && !consentGrantedAt ? "PENDING_CONSENT" : "DRAFT",
        effectiveDate,
        fromShareholderId: data.fromShareholderId ?? null,
        toShareholderId: data.toShareholderId ?? null,
        sharePercent: data.sharePercent,
        capitalAmount: data.capitalAmount ?? null,
        priceEur: data.type === "SALE" ? (data.priceEur ?? null) : null,
        consentRequired: data.consentRequired,
        consentGrantedAt,
        consentReference: data.consentReference,
        notarizedAt: data.notarizedAt ? new Date(data.notarizedAt) : null,
        notaryName: data.notaryName,
        documentId: data.documentId ?? null,
        notes: data.notes,
        createdById: check.userId,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "ShareTransfer",
      entityId: transfer.id,
      newValues: {
        transferNumber,
        type: data.type,
        effectiveDate: data.effectiveDate,
        sharePercent: data.sharePercent,
      },
    });

    return NextResponse.json({ transfer, warnings: verdict.warnings }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_FAILED", 400, { details: { issues: error.issues } });
    }
    logger.error({ err: error }, "Error creating share transfer");
    return apiError("CREATE_FAILED", undefined, {
      message: "Fehler beim Anlegen der Anteilsübertragung",
    });
  }
}

const PERSON_SELECT = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    companyName: true,
    personType: true,
  },
} as const;

/**
 * Nächste Vorgangsnummer. Wie bei den Störungsvorgängen (A1) ohne
 * Sequenztabelle: eine Lücke in den Übertragungsnummern hat keine rechtliche
 * Folge, der Unique-Index fängt die Kollision ab.
 */
async function nextTransferNumber(tenantId: string, reference: Date): Promise<string> {
  const year = reference.getUTCFullYear();
  const prefix = `${PREFIX}-${year}-`;

  const latest = await prisma.shareTransfer.findFirst({
    where: { tenantId, transferNumber: { startsWith: prefix } },
    orderBy: { transferNumber: "desc" },
    select: { transferNumber: true },
  });

  const last = latest ? Number.parseInt(latest.transferNumber.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(last) ? last + 1 : 1;
  return `${prefix}${String(next).padStart(DIGITS, "0")}`;
}
