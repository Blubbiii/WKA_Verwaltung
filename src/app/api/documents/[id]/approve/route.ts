import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  PERMISSIONS,
  getUserHighestHierarchy,
  ROLE_HIERARCHY,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// Valid state transitions for the document approval workflow
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED"],
  REJECTED: ["DRAFT", "PENDING_REVIEW"],
  PUBLISHED: ["DRAFT"], // Allow unpublish back to draft
};

const approvalActionSchema = z.object({
  // Submit for review (DRAFT -> PENDING_REVIEW)
  submit: z.boolean().optional(),
  // Approve (PENDING_REVIEW -> APPROVED)
  approve: z.boolean().optional(),
  // Reject with notes (PENDING_REVIEW -> REJECTED)
  reject: z.boolean().optional(),
  // Publish (APPROVED -> PUBLISHED)
  publish: z.boolean().optional(),
  // Revision: send back to draft (REJECTED -> DRAFT)
  revise: z.boolean().optional(),
  // Notes for approval/rejection
  notes: z.string().max(2000).optional(),
});

// POST /api/documents/[id]/approve - Document approval workflow actions
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_UPDATE);
    if (!check.authorized) return check.error;

    if (!check.tenantId || !check.userId) {
      return NextResponse.json(
        { error: "Kein Mandant oder Benutzer zugeordnet" },
        { status: 400 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const action = approvalActionSchema.parse(body);

    // Fetch the document
    const document = await prisma.document.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    const currentStatus = document.approvalStatus;
    const hierarchy = await getUserHighestHierarchy(check.userId);
    const isAdmin = hierarchy >= ROLE_HIERARCHY.ADMIN;

    // Determine target status based on action
    let targetStatus: string | null = null;

    if (action.submit) {
      targetStatus = "PENDING_REVIEW";
    } else if (action.approve) {
      targetStatus = "APPROVED";
    } else if (action.reject) {
      if (!action.notes) {
        return NextResponse.json(
          { error: "Ablehnungsgrund ist erforderlich" },
          { status: 400 }
        );
      }
      targetStatus = "REJECTED";
    } else if (action.publish) {
      targetStatus = "PUBLISHED";
    } else if (action.revise) {
      targetStatus = "DRAFT";
    } else {
      return NextResponse.json(
        { error: "Keine gueltige Aktion angegeben. Verwenden Sie: submit, approve, reject, publish oder revise." },
        { status: 400 }
      );
    }

    // Validate state transition
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(targetStatus)) {
      return NextResponse.json(
        {
          error: `Ungültiger Statuswechsel: ${currentStatus} -> ${targetStatus}. Erlaubt: ${allowedTransitions.join(", ") || "keine"}`,
        },
        { status: 400 }
      );
    }

    // Permission checks for specific actions
    // Approve/Reject/Publish require admin role
    if (
      (action.approve || action.reject || action.publish) &&
      !isAdmin
    ) {
      return NextResponse.json(
        { error: "Nur Administratoren koennen Dokumente genehmigen, ablehnen oder veroeffentlichen." },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      approvalStatus: targetStatus,
    };

    // Set reviewer info for approve/reject actions
    if (action.approve || action.reject) {
      updateData.reviewedById = check.userId;
      updateData.reviewedAt = new Date();
      updateData.reviewNotes = action.notes || null;
    }

    // Set publishedAt when publishing
    if (targetStatus === "PUBLISHED") {
      updateData.publishedAt = new Date();
      // Also set reviewer if publishing directly (admin approving and publishing)
      if (!document.reviewedById) {
        updateData.reviewedById = check.userId;
        updateData.reviewedAt = new Date();
      }
    }

    // Clear review data when sending back to draft
    if (action.revise) {
      updateData.reviewedById = null;
      updateData.reviewedAt = null;
      updateData.reviewNotes = null;
      updateData.publishedAt = null;
    }

    // If submitting for review, add notes if provided
    if (action.submit && action.notes) {
      updateData.reviewNotes = action.notes;
    }

    // Update the document
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: updateData,
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        reviewedBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // TODO: Notification integration
    // When document is submitted for review -> notify admins
    // When document is approved/rejected -> notify uploader
    // Use createNotification() from src/lib/notifications.ts when available
    // Example:
    // if (action.submit && document.uploadedById) {
    //   // Notify all admins in the tenant about the pending review
    //   const admins = await prisma.user.findMany({
    //     where: { tenantId: check.tenantId, role: { in: ["ADMIN", "SUPERADMIN"] } },
    //   });
    //   for (const admin of admins) {
    //     await createNotification({
    //       type: "DOCUMENT",
    //       title: "Dokument zur Pruefung eingereicht",
    //       message: `"${document.title}" wartet auf Genehmigung`,
    //       link: `/documents/${document.id}`,
    //       userId: admin.id,
    //       tenantId: check.tenantId,
    //     });
    //   }
    // }
    // if ((action.approve || action.reject) && document.uploadedById) {
    //   await createNotification({
    //     type: "DOCUMENT",
    //     title: action.approve ? "Dokument genehmigt" : "Dokument abgelehnt",
    //     message: action.approve
    //       ? `"${document.title}" wurde genehmigt`
    //       : `"${document.title}" wurde abgelehnt: ${action.notes}`,
    //     link: `/documents/${document.id}`,
    //     userId: document.uploadedById,
    //     tenantId: check.tenantId,
    //   });
    // }

    // Log the action in audit trail
    try {
      await prisma.auditLog.create({
        data: {
          action: "UPDATE",
          entityType: "Document",
          entityId: id,
          oldValues: { approvalStatus: currentStatus },
          newValues: { approvalStatus: targetStatus, notes: action.notes || null },
          tenantId: check.tenantId,
          userId: check.userId,
        },
      });
    } catch (auditError) {
      // Don't fail the request if audit logging fails
      logger.warn({ err: auditError }, "Failed to create audit log for document approval");
    }

    const statusLabels: Record<string, string> = {
      DRAFT: "Entwurf",
      PENDING_REVIEW: "Zur Pruefung eingereicht",
      APPROVED: "Genehmigt",
      PUBLISHED: "Veroeffentlicht",
      REJECTED: "Abgelehnt",
    };

    return NextResponse.json({
      id: updatedDocument.id,
      approvalStatus: updatedDocument.approvalStatus,
      reviewedBy: updatedDocument.reviewedBy
        ? [updatedDocument.reviewedBy.firstName, updatedDocument.reviewedBy.lastName]
            .filter(Boolean)
            .join(" ")
        : null,
      reviewedAt: updatedDocument.reviewedAt?.toISOString() || null,
      reviewNotes: updatedDocument.reviewNotes,
      publishedAt: updatedDocument.publishedAt?.toISOString() || null,
      message: `Status geaendert: ${statusLabels[targetStatus] || targetStatus}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error in document approval workflow");
    return NextResponse.json(
      { error: "Fehler bei der Dokumenten-Freigabe" },
      { status: 500 }
    );
  }
}
