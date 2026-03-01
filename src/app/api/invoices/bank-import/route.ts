import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { parseMt940 } from "@/lib/bank-import/mt940-parser";
import { parseCamt054 } from "@/lib/bank-import/camt054-parser";
import { matchTransactions } from "@/lib/bank-import/matcher";

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_EXTENSIONS = [".sta", ".mt940", ".txt", ".xml"];

// ============================================================================
// POST /api/invoices/bank-import
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
    }

    // Read multipart form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen" },
        { status: 400 }
      );
    }

    // File size check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Datei zu groß (max. 5 MB)" },
        { status: 400 }
      );
    }

    // Extension check
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext)
    );
    if (!hasValidExtension) {
      return NextResponse.json(
        {
          error: `Ungültiges Dateiformat. Erlaubt: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Read file content as text (MT940 and CAMT.054 are both text formats)
    const text = await file.text();

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Datei ist leer" },
        { status: 400 }
      );
    }

    // Auto-detect format:
    // MT940 files always start with ":20:" (SWIFT tag)
    // CAMT.054 files are XML (start with "<")
    const isMt940 = text.trimStart().startsWith(":") || text.includes(":20:");
    const isCamt054 =
      text.trimStart().startsWith("<") ||
      text.includes("<BkToCstmrDbtCdtNtfctn") ||
      text.includes("<BkToCstmrStmt");

    if (!isMt940 && !isCamt054) {
      return NextResponse.json(
        {
          error:
            "Dateiformat nicht erkannt. Bitte MT940 (.sta/.mt940) oder CAMT.054 (.xml) hochladen.",
        },
        { status: 400 }
      );
    }

    // Parse the file
    let transactions;
    try {
      transactions = isMt940 ? parseMt940(text) : parseCamt054(text);
    } catch (parseError) {
      logger.warn(
        { err: parseError, format: isMt940 ? "MT940" : "CAMT054" },
        "Bank import parse error"
      );
      return NextResponse.json(
        {
          error: `Fehler beim Lesen der Datei: ${
            parseError instanceof Error
              ? parseError.message
              : "Unbekannter Fehler"
          }`,
        },
        { status: 422 }
      );
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        { error: "Keine Transaktionen in der Datei gefunden" },
        { status: 422 }
      );
    }

    // Match transactions against open invoices
    const matches = await matchTransactions(transactions, check.tenantId);

    const highCount = matches.filter((m) => m.confidence === "high").length;
    const mediumCount = matches.filter(
      (m) => m.confidence === "medium"
    ).length;

    logger.info(
      {
        userId: check.userId,
        tenantId: check.tenantId,
        format: isMt940 ? "MT940" : "CAMT054",
        totalTransactions: transactions.length,
        highMatches: highCount,
        mediumMatches: mediumCount,
      },
      "Bank import parsed and matched"
    );

    return NextResponse.json({
      format: isMt940 ? "MT940" : "CAMT054",
      count: transactions.length,
      highMatches: highCount,
      mediumMatches: mediumCount,
      matches,
    });
  } catch (error) {
    logger.error({ err: error }, "Error processing bank import");
    return NextResponse.json(
      { error: "Fehler beim Verarbeiten der Kontoauszug-Datei" },
      { status: 500 }
    );
  }
}
