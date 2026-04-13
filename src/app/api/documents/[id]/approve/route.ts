import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  PERMISSIONS,
  getUserHighestHierarchy,
  ROLE_HIERARCHY,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";
import { apiError } from "@/lib/api-errors";
import { createNotification, notifyAdmins } from "@/lib/notifications";

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
      return apiError("BAD_REQUEST", undefined, { message: "Kein Mandant oder Benutzer zugeordnet" });
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
      return apiError("NOT_FOUND", undefined, { message: "Dokument nicht gefunden" });
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
        return apiError("MISSING_FIELD", undefined, { message: "Ablehnungsgrund ist erforderlich" });
      }
      targetStatus = "REJECTED";
    } else if (action.publish) {
      targetStatus = "PUBLISHED";
    } else if (action.revise) {
      targetStatus = "DRAFT";
    } else {
      return apiError("BAD_REQUEST", undefined, { message: "Keine gültige Aktion angegeben. Verwenden Sie: submit, approve, reject, publish oder revise." });
    }

    // Validate state transition
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(targetStatus)) {
      return apiError("BAD_REQUEST", undefined, { message: `Ungültiger Statuswechsel: ${currentStatus} -> ${targetStatus}. Erlaubt: ${allowedTransitions.join(", ") || "keine"}` });
    }

    // Permission checks for specific actions
    // Approve/Reject/Publish require admin role
    if (
      (action.approve || action.reject || action.publish) &&
      !isAdmin
    ) {
      return apiError("FORBIDDEN", undefined, { message: "Nur Administratoren können Dokumente genehmigen, ablehnen oder veroeffentlichen." });
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

    // Fire-and-forget webhook when document is approved
    if (action.approve && targetStatus === "APPROVED") {
      dispatchWebhook(check.tenantId!, "document.approved", {
        documentId: updatedDocument.id,
        title: document.title,
        approvedBy: check.userId,
      }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });
    }

    // Notification integration — non-blocking, errors swallowed inside helpers
    if (action.submit && targetStatus === "PENDING_REVIEW") {
      // Notify admins of pending review
      notifyAdmins({
        tenantId: check.tenantId!,
        type: "DOCUMENT",
        title: "Dokument zur Prüfung eingereicht",
        message: `"${document.title}" wartet auf Genehmigung`,
        link: `/documents/${document.id}`,
      }).catch((err) => logger.warn({ err }, "[Notifications] notifyAdmins failed"));
    } else if (
      (action.approve || action.reject) &&
      document.uploadedBy?.id &&
      document.uploadedBy.id !== check.userId
    ) {
      // Notify uploader of approval/rejection (skip if uploader is the reviewer)
      createNotification({
        userId: document.uploadedBy.id,
        tenantId: check.tenantId!,
        type: "DOCUMENT",
        title: action.approve ? "Dokument genehmigt" : "Dokument abgelehnt",
        message: action.approve
          ? `"${document.title}" wurde genehmigt`
          : `"${document.title}" wurde abgelehnt${action.notes ? `: ${action.notes}` : ""}`,
        link: `/documents/${document.id}`,
      }).catch((err) => logger.warn({ err }, "[Notifications] createNotification failed"));
    }

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
      PENDING_REVIEW: "Zur Prüfung eingereicht",
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
      message: `Status geändert: ${statusLabels[targetStatus] || targetStatus}`,
    });
  } catch (error) {
    return handleApiError(error, "Fehler bei der Dokumenten-Freigabe");
  }
}
