import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { parseMt940 } from "@/lib/bank-import/mt940-parser";
import { parseCamt054 } from "@/lib/bank-import/camt054-parser";
import { matchTransactions } from "@/lib/bank-import/matcher";
import { UPLOAD_LIMITS } from "@/lib/config/upload-limits";
import { apiError } from "@/lib/api-errors";

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_FILE_SIZE_BYTES = UPLOAD_LIMITS.bankImport;

const ALLOWED_EXTENSIONS = [".sta", ".mt940", ".txt", ".xml"];

// ============================================================================
// POST /api/invoices/bank-import
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    // Read multipart form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Datei hochgeladen" });
    }

    // File size check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return apiError("BAD_REQUEST", undefined, { message: "Datei zu groß (max. 5 MB)" });
    }

    // Extension check
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext)
    );
    if (!hasValidExtension) {
      return apiError("BAD_REQUEST", undefined, { message: `Ungültiges Dateiformat. Erlaubt: ${ALLOWED_EXTENSIONS.join(", ")}` });
    }

    // Read file content as text (MT940 and CAMT.054 are both text formats)
    const text = await file.text();

    if (!text.trim()) {
      return apiError("BAD_REQUEST", undefined, { message: "Datei ist leer" });
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
      return apiError("BAD_REQUEST", undefined, { message: "Dateiformat nicht erkannt. Bitte MT940 (.sta/.mt940) oder CAMT.054 (.xml) hochladen." });
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
      return apiError("INTERNAL_ERROR", 422, { message: `Fehler beim Lesen der Datei: ${
            parseError instanceof Error
              ? parseError.message
              : "Unbekannter Fehler"
          }` });
    }

    if (transactions.length === 0) {
      return apiError("INTERNAL_ERROR", 422, { message: "Keine Transaktionen in der Datei gefunden" });
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
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Verarbeiten der Kontoauszug-Datei" });
  }
}
