import { NextRequest, NextResponse } from "next/server";
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
  documentIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const permissionNeeded =
      "documents:update";
    const check = await requirePermission(permissionNeeded);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = batchDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Anfrage", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action, documentIds } = parsed.data;

    // For delete, check delete permission
    if (action === "delete") {
      const deleteCheck = await requirePermission("documents:delete");
      if (!deleteCheck.authorized) return deleteCheck.error;
    }

    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds }, tenantId: check.tenantId },
      select: { id: true, approvalStatus: true, isArchived: true },
    });

    const foundIds = new Set(documents.map((d) => d.id));
    const missingIds = documentIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Dokumente nicht gefunden: ${missingIds.join(", ")}` },
        { status: 404 }
      );
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
        await prisma.document.delete({ where: { id } });
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

      await createAuditLog({
        action: action === "delete" ? "DELETE" : "UPDATE",
        entityType: "Document",
        entityId: id,
        newValues: { batchAction: action },
        description: `Batch ${action}: Dokument`,
      });
    });

    return NextResponse.json({
      action,
      ...result,
      message: `${result.success.length} von ${result.totalProcessed} Dokumente erfolgreich verarbeitet`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Interner Serverfehler",
      },
      { status: 500 }
    );
  }
}
