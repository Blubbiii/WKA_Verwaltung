import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseMt940 } from "@/lib/bank-import/mt940-parser";
import { parseCamt054 } from "@/lib/bank-import/camt054-parser";
import { matchTransactions } from "@/lib/bank-import/matcher";
import { randomUUID } from "crypto";
import { UPLOAD_LIMITS } from "@/lib/config/upload-limits";

// POST /api/buchhaltung/bank/import — Upload + Parse + Persist bank statement
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const iban = formData.get("iban") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
    }

    const MAX_FILE_SIZE = UPLOAD_LIMITS.bankImport;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Datei zu groß (max. 10 MB)" }, { status: 400 });
    }

    const content = await file.text();
    const isXml = content.trimStart().startsWith("<?xml") || content.trimStart().startsWith("<");

    const transactions = isXml ? parseCamt054(content) : parseMt940(content);

    if (transactions.length === 0) {
      return NextResponse.json({ error: "Keine Transaktionen in der Datei gefunden" }, { status: 400 });
    }

    // Match against open invoices
    const matches = await matchTransactions(transactions, check.tenantId!);

    // Persist to DB
    const batchId = randomUUID().slice(0, 8);
    const created = await prisma.bankTransaction.createMany({
      data: matches.map((m) => ({
        tenantId: check.tenantId!,
        bankAccountIban: iban || "UNKNOWN",
        bookingDate: m.transaction.date,
        amount: m.transaction.amount,
        currency: m.transaction.currency,
        counterpartName: m.transaction.counterpartName || null,
        counterpartIban: m.transaction.counterpartIban || null,
        reference: m.transaction.reference || null,
        bankReference: m.transaction.bankReference || null,
        matchStatus: m.confidence === "high" ? "MATCHED" : m.confidence === "medium" ? "SUGGESTED" : "UNMATCHED",
        matchedInvoiceId: m.matchedInvoiceId,
        matchConfidence: m.confidence === "high" ? 1.0 : m.confidence === "medium" ? 0.6 : null,
        importBatchId: batchId,
        importFileName: file.name,
      })),
    });

    return NextResponse.json({
      imported: created.count,
      batchId,
      matched: matches.filter((m) => m.confidence === "high").length,
      suggested: matches.filter((m) => m.confidence === "medium").length,
      unmatched: matches.filter((m) => m.confidence === "none").length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error importing bank transactions");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
