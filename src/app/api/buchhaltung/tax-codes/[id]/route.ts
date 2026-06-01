/**
 * Tax-Code Einzel-CRUD (Phase 10).
 *
 * PATCH  /api/buchhaltung/tax-codes/[id]   — Code editieren
 * DELETE /api/buchhaltung/tax-codes/[id]   — Code löschen (nicht für isSystem)
 *
 * Wir prüfen vor DELETE, ob der Code irgendwo referenziert wird
 * (Invoice / IncomingInvoice / JournalEntryLine). Ist das der Fall,
 * lehnen wir mit DEPENDENCY_EXISTS ab — die Referenzen würden via
 * onDelete: SetNull stillschweigend verschwinden, was Audit-Trails
 * verfälscht.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TaxCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  category: z.enum(TaxCategory).optional(),
  rate: z.number().min(0).max(1).optional(),
  vatReportBox: z.string().max(10).nullable().optional(),
  reverseCharge: z.boolean().optional(),
  taxAccountId: z.string().uuid().nullable().optional(),
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
      select: { id: true, isSystem: true, code: true },
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

    // System-Codes: Kategorie und Code sind fest, sonst bricht die UStVA-Logik.
    if (existing.isSystem && parsed.data.category !== undefined) {
      return apiError("OPERATION_NOT_ALLOWED", 409, {
        message: "Kategorie von System-Steuerschlüsseln kann nicht geändert werden",
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
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
        ...(parsed.data.rate !== undefined ? { rate: parsed.data.rate } : {}),
        ...(parsed.data.vatReportBox !== undefined ? { vatReportBox: parsed.data.vatReportBox } : {}),
        ...(parsed.data.reverseCharge !== undefined ? { reverseCharge: parsed.data.reverseCharge } : {}),
        ...(parsed.data.taxAccountId !== undefined ? { taxAccountId: parsed.data.taxAccountId } : {}),
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
      select: { id: true, isSystem: true, code: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, {
        message: "Steuerschlüssel nicht gefunden",
      });
    }

    if (existing.isSystem) {
      return apiError("OPERATION_NOT_ALLOWED", 409, {
        message: "System-Steuerschlüssel können nicht gelöscht werden. Setze active=false zum Deaktivieren.",
      });
    }

    // Referenz-Check: wenn der Code irgendwo verwendet wird, lehnen wir ab
    // statt SetNull zuzulassen (Audit-Verlust). User muss erst deaktivieren.
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
