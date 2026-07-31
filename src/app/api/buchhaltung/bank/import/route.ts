/**
 * POST /api/buchhaltung/bank/import — Kontoauszug hochladen, parsen, speichern
 *
 * Die Kette parsen → entdoppeln → zuordnen → speichern steht seit B7
 * (Audit 2026-07) in `ingestStatement`. Sie wird auch vom automatischen Abruf
 * benutzt; zwei Fassungen derselben Dublettenerkennung würden auseinander-
 * driften, und bei Kontoumsätzen heisst das doppelte Buchungen.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { UPLOAD_LIMITS } from "@/lib/config/upload-limits";
import { z } from "zod";
import { ingestStatement, EmptyStatementError } from "@/lib/bank-import/ingest-service";

const bankImportFieldsSchema = z.object({
  iban: z.string().min(1).nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:create");
    if (!check.authorized) return check.error;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawIban = formData.get("iban") as string | null;

    const fieldsParsed = bankImportFieldsSchema.safeParse({ iban: rawIban });
    if (!fieldsParsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: fieldsParsed.error.flatten().fieldErrors,
      });
    }
    const iban = fieldsParsed.data.iban;

    if (!file) {
      return apiError("BAD_REQUEST", 400, { message: "Keine Datei hochgeladen" });
    }

    if (file.size > UPLOAD_LIMITS.bankImport) {
      return apiError("BAD_REQUEST", 400, { message: "Datei zu groß (max. 10 MB)" });
    }

    const result = await ingestStatement({
      content: await file.text(),
      fileName: file.name,
      iban,
      tenantId: check.tenantId!,
    });

    // Antwortform unverändert — die Oberfläche liest diese Felder.
    return NextResponse.json({
      imported: result.imported,
      batchId: result.batchId,
      matched: result.matched,
      suggested: result.suggested,
      unmatched: result.unmatched,
      skipped: result.skipped,
    });
  } catch (error) {
    if (error instanceof EmptyStatementError) {
      return apiError("BAD_REQUEST", 400, { message: error.message });
    }
    logger.error({ err: error }, "Error importing bank transactions");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
