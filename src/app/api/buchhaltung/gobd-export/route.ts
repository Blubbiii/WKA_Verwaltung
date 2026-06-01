/**
 * POST /api/buchhaltung/gobd-export
 *
 * Generiert ein GoBD Z3 IDEA-Format-ZIP für die Datenträgerüberlassung
 * gemäß §147 Abs. 6 AO. Wird bei Betriebsprüfung an den Prüfer übergeben.
 *
 * Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 *
 * Response: application/zip mit Content-Disposition attachment.
 * Persistiert parallel einen GobdExport-Audit-Eintrag (Hash, Größe,
 * Record-Counts).
 *
 * Exportierte Tabellen:
 *  - journal_entries         (Buchungsjournal)
 *  - journal_entry_lines     (Buchungspositionen)
 *  - invoices                (Ausgangsrechnungen)
 *  - incoming_invoices       (Eingangsrechnungen)
 *  - ledger_accounts         (Sachkontenstamm)
 *  - opening_balances        (Saldenvortrag)
 */

import { NextRequest } from "next/server";
import { createHash } from "crypto";
import JSZip from "jszip";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  IDEA_DTD_PLACEHOLDER,
  generateGobdExport,
  type GobdTable,
} from "@/lib/accounting/gobd-export";

const schema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }
    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return apiError("BAD_REQUEST", 400, {
        message: "Ungültiges Datumsformat (erwartet: YYYY-MM-DD)",
      });
    }
    if (from > to) {
      return apiError("BAD_REQUEST", 400, {
        message: "Startdatum muss vor dem Enddatum liegen",
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { name: true },
    });
    if (!tenant) {
      return apiError("NOT_FOUND", 404, { message: "Mandant nicht gefunden" });
    }

    const tables = await loadTables(check.tenantId, from, to);

    const exportResult = generateGobdExport({
      tenantName: tenant.name,
      periodFrom: from,
      periodTo: to,
      generatedAt: new Date(),
      tables,
    });

    // ZIP bauen via JSZip (im Memory — bei sehr großen Exports ggf. Streaming).
    const zip = new JSZip();
    zip.file("index.xml", exportResult.indexXml);
    zip.file("gdpdu-01-08-2002.dtd", IDEA_DTD_PLACEHOLDER);
    for (const f of exportResult.csvFiles) {
      zip.file(f.filename, f.content);
    }
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const fileHash = createHash("sha256").update(zipBuffer).digest("hex");

    await prisma.gobdExport.create({
      data: {
        tenantId: check.tenantId,
        periodFrom: from,
        periodTo: to,
        fileHash,
        fileSizeBytes: BigInt(zipBuffer.length),
        recordCounts: exportResult.recordCounts,
        createdById: check.userId!,
      },
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        from: parsed.data.from,
        to: parsed.data.to,
        sizeBytes: zipBuffer.length,
        recordCounts: exportResult.recordCounts,
      },
      "GoBD Z3 export generated",
    );

    const filename = `gobd-z3-${parsed.data.from}-${parsed.data.to}.zip`;
    return new Response(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-GoBD-File-Hash": fileHash,
        "X-GoBD-Total-Records": String(
          Object.values(exportResult.recordCounts).reduce((s, n) => s + n, 0),
        ),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "GoBD export failed");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim GoBD-Export",
    });
  }
}

/**
 * Lädt die zu exportierenden Daten aus der DB und mappt sie auf die
 * IDEA-Tabellen-Struktur. Wir nehmen explizit nur Audit-relevante Felder
 * (KEINE blob/json-Felder, KEINE Multi-Tenant-IDs außer tenantId).
 */
async function loadTables(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<GobdTable[]> {
  const [journals, lines, invoices, incoming, accounts, openings] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        entryDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        entryDate: true,
        description: true,
        reference: true,
        status: true,
        source: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
      },
      orderBy: { entryDate: "asc" },
    }),
    prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          tenantId,
          status: "POSTED",
          deletedAt: null,
          entryDate: { gte: from, lte: to },
        },
      },
      select: {
        id: true,
        journalEntryId: true,
        lineNumber: true,
        account: true,
        accountName: true,
        description: true,
        debitAmount: true,
        creditAmount: true,
        taxKey: true,
        costCenter: true,
        ustvaKennzahl: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        invoiceDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceType: true,
        invoiceDate: true,
        dueDate: true,
        recipientName: true,
        netAmount: true,
        taxAmount: true,
        grossAmount: true,
        currency: true,
        status: true,
        paidAt: true,
        paidAmount: true,
      },
      orderBy: { invoiceDate: "asc" },
    }),
    prisma.incomingInvoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        invoiceDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceType: true,
        invoiceDate: true,
        dueDate: true,
        vendorNameFallback: true,
        netAmount: true,
        vatAmount: true,
        grossAmount: true,
        status: true,
        paidAt: true,
        paidAmount: true,
      },
      orderBy: { invoiceDate: "asc" },
    }),
    prisma.ledgerAccount.findMany({
      where: { tenantId },
      select: {
        id: true,
        accountNumber: true,
        name: true,
        category: true,
        balanceSheetSection: true,
        taxBehavior: true,
        isActive: true,
      },
      orderBy: { accountNumber: "asc" },
    }),
    prisma.openingBalance.findMany({
      where: {
        tenantId,
        fiscalYear: { gte: from.getUTCFullYear(), lte: to.getUTCFullYear() },
      },
      select: {
        id: true,
        fiscalYear: true,
        ledgerAccountId: true,
        debitAmount: true,
        creditAmount: true,
      },
      orderBy: { fiscalYear: "asc" },
    }),
  ]);

  return [
    {
      name: "journal_entries",
      description: "Buchungsjournal (POSTED Entries)",
      columns: [
        { name: "id", type: "string", maxLength: 36 },
        { name: "entryDate", type: "date" },
        { name: "description", type: "string", maxLength: 200 },
        { name: "reference", type: "string", maxLength: 100 },
        { name: "status", type: "string", maxLength: 20 },
        { name: "source", type: "string", maxLength: 20 },
        { name: "referenceType", type: "string", maxLength: 50 },
        { name: "referenceId", type: "string", maxLength: 36 },
        { name: "createdAt", type: "date" },
      ],
      rows: journals.map((j) => ({
        id: j.id,
        entryDate: j.entryDate,
        description: j.description,
        reference: j.reference,
        status: j.status,
        source: j.source,
        referenceType: j.referenceType,
        referenceId: j.referenceId,
        createdAt: j.createdAt,
      })),
    },
    {
      name: "journal_entry_lines",
      description: "Buchungspositionen (Soll/Haben)",
      columns: [
        { name: "id", type: "string", maxLength: 36 },
        { name: "journalEntryId", type: "string", maxLength: 36 },
        { name: "lineNumber", type: "number" },
        { name: "account", type: "string", maxLength: 20 },
        { name: "accountName", type: "string", maxLength: 100 },
        { name: "description", type: "string", maxLength: 200 },
        { name: "debitAmount", type: "decimal", decimalPlaces: 2 },
        { name: "creditAmount", type: "decimal", decimalPlaces: 2 },
        { name: "taxKey", type: "string", maxLength: 10 },
        { name: "costCenter", type: "string", maxLength: 50 },
        { name: "ustvaKennzahl", type: "string", maxLength: 10 },
      ],
      rows: lines,
    },
    {
      name: "invoices",
      description: "Ausgangsrechnungen",
      columns: [
        { name: "id", type: "string", maxLength: 36 },
        { name: "invoiceNumber", type: "string", maxLength: 50 },
        { name: "invoiceType", type: "string", maxLength: 20 },
        { name: "invoiceDate", type: "date" },
        { name: "dueDate", type: "date" },
        { name: "recipientName", type: "string", maxLength: 200 },
        { name: "netAmount", type: "decimal", decimalPlaces: 2 },
        { name: "taxAmount", type: "decimal", decimalPlaces: 2 },
        { name: "grossAmount", type: "decimal", decimalPlaces: 2 },
        { name: "currency", type: "string", maxLength: 3 },
        { name: "status", type: "string", maxLength: 20 },
        { name: "paidAt", type: "date" },
        { name: "paidAmount", type: "decimal", decimalPlaces: 2 },
      ],
      rows: invoices,
    },
    {
      name: "incoming_invoices",
      description: "Eingangsrechnungen",
      columns: [
        { name: "id", type: "string", maxLength: 36 },
        { name: "invoiceNumber", type: "string", maxLength: 100 },
        { name: "invoiceType", type: "string", maxLength: 20 },
        { name: "invoiceDate", type: "date" },
        { name: "dueDate", type: "date" },
        { name: "vendorNameFallback", type: "string", maxLength: 200 },
        { name: "netAmount", type: "decimal", decimalPlaces: 2 },
        { name: "vatAmount", type: "decimal", decimalPlaces: 2 },
        { name: "grossAmount", type: "decimal", decimalPlaces: 2 },
        { name: "status", type: "string", maxLength: 20 },
        { name: "paidAt", type: "date" },
        { name: "paidAmount", type: "decimal", decimalPlaces: 2 },
      ],
      rows: incoming,
    },
    {
      name: "ledger_accounts",
      description: "Sachkontenstamm",
      columns: [
        { name: "id", type: "string", maxLength: 36 },
        { name: "accountNumber", type: "string", maxLength: 10 },
        { name: "name", type: "string", maxLength: 200 },
        { name: "category", type: "string", maxLength: 20 },
        { name: "balanceSheetSection", type: "string", maxLength: 40 },
        { name: "taxBehavior", type: "string", maxLength: 20 },
        { name: "isActive", type: "boolean" },
      ],
      rows: accounts,
    },
    {
      name: "opening_balances",
      description: "Saldenvortrag (Eröffnungsbilanz)",
      columns: [
        { name: "id", type: "string", maxLength: 36 },
        { name: "fiscalYear", type: "number" },
        { name: "ledgerAccountId", type: "string", maxLength: 36 },
        { name: "debitAmount", type: "decimal", decimalPlaces: 2 },
        { name: "creditAmount", type: "decimal", decimalPlaces: 2 },
      ],
      rows: openings,
    },
  ];
}
