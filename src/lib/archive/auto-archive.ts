/**
 * Auto-Archive Integration for WindparkManager
 *
 * Provides hooks that can be called from existing API routes to
 * automatically archive documents when they reach a final state:
 *
 * - Invoice finalized (status -> SENT) -> archive PDF
 * - Credit note created -> archive PDF
 * - Settlement approved -> archive settlement documents
 *
 * These functions are designed to be called AFTER the primary operation
 * succeeds. Archive failures are logged but do not block the main flow.
 */

import { prisma } from "@/lib/prisma";
import { s3Client, S3_BUCKET } from "@/lib/storage";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  archiveDocument,
  type ArchiveDocumentType,
} from "./gobd-archive";
import { logger } from "@/lib/logger";

const autoArchiveLogger = logger.child({ module: "auto-archive" });

// ---------------------------------------------------------------------------
// Helper: fetch file content from S3 by storage key
// ---------------------------------------------------------------------------

async function fetchFileFromStorage(storageKey: string): Promise<Buffer | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: storageKey,
    });

    const response = await s3Client.send(command);
    const bodyStream = response.Body;

    if (!bodyStream) return null;

    const chunks: Uint8Array[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of bodyStream as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    autoArchiveLogger.error(
      { err: error, storageKey },
      "Failed to fetch file from storage"
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auto-archive: Invoice
// ---------------------------------------------------------------------------

/**
 * Archive an invoice PDF when it is finalized (status SENT or PAID).
 *
 * Call this from the invoice status update API route after successfully
 * changing the status to SENT.
 *
 * @param invoiceId - The ID of the invoice to archive
 * @param userId - The user performing the action (for audit trail)
 * @returns The archive ID if successful, null if archiving was skipped or failed
 */
export async function autoArchiveInvoice(
  invoiceId: string,
  userId: string
): Promise<string | null> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        tenantId: true,
        invoiceType: true,
        invoiceNumber: true,
        pdfUrl: true,
        status: true,
        recipientName: true,
        grossAmount: true,
        invoiceDate: true,
        fundId: true,
        fund: { select: { name: true } },
      },
    });

    if (!invoice) {
      autoArchiveLogger.warn({ invoiceId }, "Invoice not found for auto-archive");
      return null;
    }

    // Only archive if PDF exists
    if (!invoice.pdfUrl) {
      autoArchiveLogger.info(
        { invoiceId },
        "Skipping auto-archive: no PDF URL"
      );
      return null;
    }

    // Determine document type
    const documentType: ArchiveDocumentType =
      invoice.invoiceType === "CREDIT_NOTE" ? "CREDIT_NOTE" : "INVOICE";

    // Fetch PDF content from storage
    const content = await fetchFileFromStorage(invoice.pdfUrl);
    if (!content) {
      autoArchiveLogger.error(
        { invoiceId, pdfUrl: invoice.pdfUrl },
        "Failed to fetch invoice PDF for archiving"
      );
      return null;
    }

    const result = await archiveDocument({
      tenantId: invoice.tenantId,
      documentType,
      referenceId: invoice.id,
      referenceNumber: invoice.invoiceNumber,
      content,
      fileName: `${invoice.invoiceNumber}.pdf`,
      mimeType: "application/pdf",
      metadata: {
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        recipientName: invoice.recipientName ?? "",
        grossAmount: String(invoice.grossAmount),
        invoiceDate: invoice.invoiceDate.toISOString(),
        fundName: invoice.fund?.name ?? "",
      },
      archivedById: userId,
    });

    autoArchiveLogger.info(
      { invoiceId, archiveId: result.id },
      "Invoice auto-archived successfully"
    );

    return result.id;
  } catch (error) {
    // Log but don't throw - auto-archive should not block main flow
    autoArchiveLogger.error(
      { err: error, invoiceId },
      "Auto-archive failed for invoice"
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auto-archive: Settlement
// ---------------------------------------------------------------------------

/**
 * Archive a settlement document when it is approved.
 *
 * Call this from the settlement approval API route.
 *
 * @param settlementId - The settlement ID
 * @param userId - The user performing the action
 * @param pdfContent - The PDF content buffer (if already generated)
 * @param referenceNumber - Human-readable reference number
 * @returns The archive ID if successful, null otherwise
 */
export async function autoArchiveSettlement(
  settlementId: string,
  tenantId: string,
  userId: string,
  pdfContent: Buffer,
  referenceNumber: string
): Promise<string | null> {
  try {
    const result = await archiveDocument({
      tenantId,
      documentType: "SETTLEMENT",
      referenceId: settlementId,
      referenceNumber,
      content: pdfContent,
      fileName: `${referenceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`,
      mimeType: "application/pdf",
      metadata: {
        settlementId,
      },
      archivedById: userId,
    });

    autoArchiveLogger.info(
      { settlementId, archiveId: result.id },
      "Settlement auto-archived successfully"
    );

    return result.id;
  } catch (error) {
    autoArchiveLogger.error(
      { err: error, settlementId },
      "Auto-archive failed for settlement"
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auto-archive: Contract
// ---------------------------------------------------------------------------

/**
 * Archive a contract document.
 *
 * Call this when a contract is finalized or a signed version is uploaded.
 *
 * @param contractId - The contract ID
 * @param userId - The user performing the action
 * @returns The archive ID if successful, null otherwise
 */
export async function autoArchiveContract(
  contractId: string,
  userId: string
): Promise<string | null> {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        tenantId: true,
        contractNumber: true,
        title: true,
        contractType: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!contract) {
      autoArchiveLogger.warn(
        { contractId },
        "Contract not found for auto-archive"
      );
      return null;
    }

    // Look for the contract's primary document
    const document = await prisma.document.findFirst({
      where: {
        tenantId: contract.tenantId,
        // Search for documents linked to this contract
        OR: [
          { title: { contains: contract.contractNumber ?? "" } },
        ],
        category: "CONTRACT",
      },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!document?.fileUrl) {
      autoArchiveLogger.info(
        { contractId },
        "Skipping auto-archive: no document file found for contract"
      );
      return null;
    }

    const content = await fetchFileFromStorage(document.fileUrl);
    if (!content) {
      autoArchiveLogger.error(
        { contractId, fileUrl: document.fileUrl },
        "Failed to fetch contract document for archiving"
      );
      return null;
    }

    const referenceNumber = contract.contractNumber ?? `V-${contract.id.substring(0, 8)}`;

    const result = await archiveDocument({
      tenantId: contract.tenantId,
      documentType: "CONTRACT",
      referenceId: contract.id,
      referenceNumber,
      content,
      fileName: document.fileName ?? `${referenceNumber}.pdf`,
      mimeType: document.mimeType ?? "application/pdf",
      metadata: {
        contractType: contract.contractType,
        contractStatus: contract.status,
        title: contract.title ?? "",
        startDate: contract.startDate?.toISOString() ?? "",
        endDate: contract.endDate?.toISOString() ?? "",
      },
      archivedById: userId,
    });

    autoArchiveLogger.info(
      { contractId, archiveId: result.id },
      "Contract auto-archived successfully"
    );

    return result.id;
  } catch (error) {
    autoArchiveLogger.error(
      { err: error, contractId },
      "Auto-archive failed for contract"
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auto-archive: Generic document
// ---------------------------------------------------------------------------

/**
 * Archive any document by providing content directly.
 * Useful for manual archiving from the UI.
 *
 * @param params - Archive parameters
 * @returns The archive ID if successful, null otherwise
 */
export async function autoArchiveGenericDocument(params: {
  tenantId: string;
  documentType: ArchiveDocumentType;
  referenceId: string;
  referenceNumber: string;
  storageKey: string;
  fileName: string;
  mimeType?: string;
  metadata?: Record<string, string>;
  archivedById: string;
}): Promise<string | null> {
  try {
    const content = await fetchFileFromStorage(params.storageKey);
    if (!content) {
      autoArchiveLogger.error(
        { storageKey: params.storageKey },
        "Failed to fetch document for archiving"
      );
      return null;
    }

    const result = await archiveDocument({
      tenantId: params.tenantId,
      documentType: params.documentType,
      referenceId: params.referenceId,
      referenceNumber: params.referenceNumber,
      content,
      fileName: params.fileName,
      mimeType: params.mimeType,
      metadata: params.metadata,
      archivedById: params.archivedById,
    });

    autoArchiveLogger.info(
      { referenceId: params.referenceId, archiveId: result.id },
      "Generic document auto-archived successfully"
    );

    return result.id;
  } catch (error) {
    autoArchiveLogger.error(
      { err: error, referenceId: params.referenceId },
      "Auto-archive failed for generic document"
    );
    return null;
  }
}
