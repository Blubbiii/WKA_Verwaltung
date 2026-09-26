import { NextRequest, NextResponse, after } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { requirePermission } from "@/lib/auth/withPermission";
import { processBatch } from "@/lib/batch/batch-operations";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/batch/documents — archive several documents in one request.
 *
 * Only archiving lives here. The route used to approve, publish and delete as
 * well, but weaker than the single-document routes: no admin check on
 * approval, no reviewedAt/publishedAt, no webhooks or notifications, and a
 * hard delete. Those stay with /api/documents/[id](/approve), which the
 * document list calls per item (audit 2026-09).
 */
const batchDocumentSchema = z.object({
  action: z.literal("archive"),
  documentIds: z.array(z.uuid()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = batchDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Anfrage", details: parsed.error.flatten() });
    }

    const { action, documentIds } = parsed.data;

    const check = await requirePermission(["documents:archive", "documents:update"]);
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);

    const documents = await db.document.findMany({
      where: { id: { in: documentIds }, tenantId: check.tenantId },
      select: { id: true, isArchived: true },
    });

    const foundIds = new Set(documents.map((d) => d.id));
    const missingIds = documentIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return apiError("NOT_FOUND", 404, { message: `Dokumente nicht gefunden: ${missingIds.join(", ")}` });
    }

    const result = await processBatch(documentIds, async (id) => {
      const doc = documents.find((d) => d.id === id)!;
      if (doc.isArchived) {
        throw new Error("Dokument ist bereits archiviert");
      }
      await db.document.update({
        where: { id, tenantId: check.tenantId! },
        data: { isArchived: true },
      });

      after(async () => {
        await createAuditLog({
          action: "UPDATE",
          entityType: "Document",
          entityId: id,
          newValues: { batchAction: action },
          description: `Batch ${action}: Dokument`,
        });
      });
    });

    return NextResponse.json({
      action,
      ...result,
      message: `${result.success.length} von ${result.totalProcessed} Dokumente erfolgreich verarbeitet`,
    });
  } catch (error) {
    return apiError("INTERNAL_ERROR", 500, { message: error instanceof Error ? error.message : "Interner Serverfehler" });
  }
}
