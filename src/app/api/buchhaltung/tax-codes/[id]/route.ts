/**
 * Tenant-Steuerschlüssel Einzel-CRUD (P10, Schicht 2).
 *
 * PATCH  /api/buchhaltung/tax-codes/[id]   — Tenant-Felder editieren
 *        (code, nameOverride, rateOverride, vatReportBoxOverride,
 *         taxAccountId, active). Template-Verweis (templateId) ist nicht
 *         änderbar — wer eine andere Kategorie braucht, legt einen
 *         eigenen TaxCode an oder nutzt den materialisierten.
 *
 * DELETE /api/buchhaltung/tax-codes/[id]   — Code löschen
 *        Nur möglich wenn keine Referenzen aus Invoice/IncomingInvoice/
 *        JournalEntryLine existieren. Sonst DEPENDENCY_EXISTS.
 *        Empfohlene Alternative: active=false setzen.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const patchSchema = z.object({
  code: z.string().min(1).max(10).optional(),
  nameOverride: z.string().max(150).optional().nullable(),
  rateOverride: z.number().min(0).max(1).optional().nullable(),
  vatReportBoxOverride: z.string().max(10).optional().nullable(),
  taxAccountId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;

    const existing = await prisma.taxCode.findFirst({
      where: { id, tenantId: check.tenantId },
      select: { id: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, {
        message: "Steuerschlüssel nicht gefunden",
      });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabedaten",
      });
    }

    if (parsed.data.taxAccountId) {
      const acct = await prisma.ledgerAccount.findFirst({
        where: { id: parsed.data.taxAccountId, tenantId: check.tenantId },
        select: { id: true },
      });
      if (!acct) {
        return apiError("BAD_REQUEST", 400, {
          message: "Verknüpftes USt-Konto gehört nicht zum aktiven Mandanten",
        });
      }
    }

    const updated = await prisma.taxCode.update({
      where: { id },
      data: {
        ...(parsed.data.code !== undefined ? { code: parsed.data.code } : {}),
        ...(parsed.data.nameOverride !== undefined
          ? { nameOverride: parsed.data.nameOverride }
          : {}),
        ...(parsed.data.rateOverride !== undefined
          ? { rateOverride: parsed.data.rateOverride }
          : {}),
        ...(parsed.data.vatReportBoxOverride !== undefined
          ? { vatReportBoxOverride: parsed.data.vatReportBoxOverride }
          : {}),
        ...(parsed.data.taxAccountId !== undefined
          ? { taxAccountId: parsed.data.taxAccountId }
          : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    });

    logger.info(
      { tenantId: check.tenantId, userId: check.userId, taxCodeId: id },
      "Tax code updated",
    );

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating tax code");
    return apiError("UPDATE_FAILED", 500, {
      message: "Fehler beim Aktualisieren des Steuerschlüssels",
    });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;

    const existing = await prisma.taxCode.findFirst({
      where: { id, tenantId: check.tenantId },
      select: { id: true, code: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, {
        message: "Steuerschlüssel nicht gefunden",
      });
    }

    // Referenz-Check (verhindert silent SetNull → Audit-Verlust).
    const [invoiceRefs, incomingRefs, journalRefs] = await Promise.all([
      prisma.invoice.count({ where: { taxCodeId: id } }),
      prisma.incomingInvoice.count({ where: { taxCodeId: id } }),
      prisma.journalEntryLine.count({ where: { taxCodeId: id } }),
    ]);

    const total = invoiceRefs + incomingRefs + journalRefs;
    if (total > 0) {
      return apiError("DEPENDENCY_EXISTS", 409, {
        message: `Steuerschlüssel wird noch verwendet (${total} Referenz(en)). Bitte deaktivieren statt löschen.`,
        details: { invoiceRefs, incomingRefs, journalRefs },
      });
    }

    await prisma.taxCode.delete({ where: { id } });

    logger.info(
      { tenantId: check.tenantId, userId: check.userId, taxCodeId: id, code: existing.code },
      "Tax code deleted",
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting tax code");
    return apiError("DELETE_FAILED", 500, {
      message: "Fehler beim Löschen des Steuerschlüssels",
    });
  }
}
