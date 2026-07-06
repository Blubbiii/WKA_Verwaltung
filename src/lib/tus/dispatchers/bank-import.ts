/**
 * Dispatcher for bank-import uploads (MT940 / CAMT.054).
 *
 * Called from tus onUploadFinish for uploadType="bank-import". Reads the
 * completed file as text, auto-detects the format, parses it, and returns
 * the preview data in the tus response body. Same shape as the legacy
 * POST /api/invoices/bank-import so consumers can swap uploaders without
 * touching downstream matcher logic.
 *
 * We delete the tus file after parsing — bank statements contain PII
 * (IBAN, account holder names) and never need to be persisted on disk.
 */

import * as fsp from "fs/promises";
import { logger } from "@/lib/logger";
import { parseMt940 } from "@/lib/bank-import/mt940-parser";
import { parseCamt054 } from "@/lib/bank-import/camt054-parser";

const bankLogger = logger.child({ module: "tus-bank-import-dispatcher" });

const ALLOWED_EXTENSIONS = [".sta", ".mt940", ".txt", ".xml"];

export interface BankImportDispatchInput {
  uploadId: string;
  tusFilePath: string;
  metadata: Record<string, string | null>;
  tenantId: string;
}

export interface BankImportDispatchResult {
  ok: boolean;
  reason?: string;
  /** Same shape as the legacy /api/invoices/bank-import success response. */
  preview?: {
    format: "MT940" | "CAMT054";
    transactionCount: number;
    transactions: unknown[];
  };
}

export function validateBankImportMetadata(
  metadata: Record<string, string | null>
): { ok: true } | { ok: false; reason: string } {
  const { filename } = metadata;
  if (!filename) return { ok: false, reason: "filename fehlt in metadata" };

  const name = filename.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!hasValidExt) {
    return {
      ok: false,
      reason: `Ungültiges Format. Erlaubt: ${ALLOWED_EXTENSIONS.join(", ")}`,
    };
  }
  return { ok: true };
}

export async function dispatchBankImportUpload(
  input: BankImportDispatchInput
): Promise<BankImportDispatchResult> {
  const { uploadId, tusFilePath, metadata, tenantId } = input;

  const validation = validateBankImportMetadata(metadata);
  if (!validation.ok) return { ok: false, reason: validation.reason };

  let text: string;
  try {
    text = await fsp.readFile(tusFilePath, "utf-8");
  } catch (err) {
    bankLogger.error({ err, uploadId }, "Bank-Import: readFile failed");
    return { ok: false, reason: "Datei konnte nicht gelesen werden" };
  }

  if (!text.trim()) {
    await fsp.unlink(tusFilePath).catch(() => undefined);
    return { ok: false, reason: "Datei ist leer" };
  }

  const isMt940 = text.trimStart().startsWith(":") || text.includes(":20:");
  const isCamt054 =
    text.trimStart().startsWith("<") ||
    text.includes("<BkToCstmrDbtCdtNtfctn") ||
    text.includes("<BkToCstmrStmt");

  if (!isMt940 && !isCamt054) {
    await fsp.unlink(tusFilePath).catch(() => undefined);
    return {
      ok: false,
      reason: "Dateiformat nicht erkannt. Bitte MT940 (.sta/.mt940) oder CAMT.054 (.xml) hochladen.",
    };
  }

  const format: "MT940" | "CAMT054" = isMt940 ? "MT940" : "CAMT054";

  let transactions: unknown[];
  try {
    transactions = isMt940 ? parseMt940(text) : parseCamt054(text);
  } catch (err) {
    bankLogger.warn({ err, format, uploadId }, "Bank-Import parse error");
    await fsp.unlink(tusFilePath).catch(() => undefined);
    return {
      ok: false,
      reason: `Fehler beim Parsen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Delete the tus file — PII should not linger on disk
  await fsp.unlink(tusFilePath).catch(() => undefined);
  await fsp.unlink(tusFilePath + ".json").catch(() => undefined);

  bankLogger.info(
    { uploadId, tenantId, format, transactionCount: transactions.length },
    "Bank-Import parsed"
  );

  return {
    ok: true,
    preview: {
      format,
      transactionCount: transactions.length,
      transactions,
    },
  };
}
