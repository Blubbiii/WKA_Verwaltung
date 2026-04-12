import { NextRequest, NextResponse, after } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { processBatch } from "@/lib/batch/batch-operations";
import { createAuditLog } from "@/lib/audit";

const validTransitions: Record<string, string[]> = {
  approve: ["PENDING_REVIEW"],
  publish: ["APPROVED"],
  archive: ["PUBLISHED", "APPROVED"],
  delete: ["DRAFT", "REJECTED"],
};

const targetStatus: Record<string, string> = {
  approve: "APPROVED",
  publish: "PUBLISHED",
  archive: "PUBLISHED", // keep status, set isArchived
  delete: "DRAFT", // will be deleted
};

const batchDocumentSchema = z.object({
  action: z.enum(["approve", "publish", "archive", "delete"]),
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

    // Granular permission check per action (falls back to documents:update)
    const permissionMap: Record<string, string[]> = {
      approve: ["documents:approve", "documents:update"],
      publish: ["documents:publish", "documents:update"],
      archive: ["documents:archive", "documents:update"],
      delete: ["documents:delete"],
    };
    const check = await requirePermission(permissionMap[action] || ["documents:update"]);
    if (!check.authorized) return check.error;

    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds }, tenantId: check.tenantId },
      select: { id: true, approvalStatus: true, isArchived: true },
    });

    const foundIds = new Set(documents.map((d) => d.id));
    const missingIds = documentIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return apiError("NOT_FOUND", 404, { message: `Dokumente nicht gefunden: ${missingIds.join(", ")}` });
    }

    const result = await processBatch(documentIds, async (id) => {
      const doc = documents.find((d) => d.id === id)!;
      const allowedStatuses = validTransitions[action];

      if (action === "archive") {
        if (doc.isArchived) {
          throw new Error("Dokument ist bereits archiviert");
        }
        await prisma.document.update({
          where: { id },
          data: { isArchived: true },
        });
      } else if (action === "delete") {
        if (!allowedStatuses.includes(doc.approvalStatus)) {
          throw new Error(
            `Dokument hat Status ${doc.approvalStatus}, nur DRAFT/REJECTED kann gelöscht werden`
          );
        }
        await prisma.document.delete({ where: { id, tenantId: check.tenantId! } });
      } else {
        if (!allowedStatuses.includes(doc.approvalStatus)) {
          throw new Error(
            `Dokument hat Status ${doc.approvalStatus}, erwartet: ${allowedStatuses.join(", ")}`
          );
        }
        await prisma.document.update({
          where: { id },
          data: {
            approvalStatus: targetStatus[action] as "APPROVED" | "PUBLISHED",
            reviewedById: check.userId,
          },
        });
      }

      after(async () => {
        await createAuditLog({
          action: action === "delete" ? "DELETE" : "UPDATE",
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
