/**
 * GoBD-compliant Archive Service for WindparkManager
 *
 * Provides immutable document archiving with SHA-256 hash chains,
 * retention policy enforcement, and integrity verification per GoBD
 * (Grundsaetze zur ordnungsgemaessen Fuehrung und Aufbewahrung von
 * Buechern, Aufzeichnungen und Unterlagen in elektronischer Form).
 *
 * Key properties:
 * - Documents are stored with content hash (SHA-256) for integrity
 * - A chain hash links each document to its predecessor for tamper detection
 * - Retention periods are enforced (10 years for tax documents per §147 AO)
 * - Every access is logged via the audit system
 * - Verification can be run at any time to check chain integrity
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { s3Client, S3_BUCKET } from "@/lib/storage";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "@/lib/logger";
import { getTenantSettings } from "@/lib/tenant-settings";

const archiveLogger = logger.child({ module: "gobd-archive" });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** S3 prefix for archived documents (separate from regular storage) */
const ARCHIVE_PREFIX = "gobd-archive";

/**
 * Default retention periods in years per document type (GoBD / §147 AO).
 * Can be overridden per tenant via tenant settings
 * (gobdRetentionYearsInvoice, gobdRetentionYearsContract).
 */
const DEFAULT_RETENTION_YEARS_MAP: Record<string, number> = {
  INVOICE: 10,
  CREDIT_NOTE: 10,
  RECEIPT: 10,
  CONTRACT: 10,
  SETTLEMENT: 10,
};

/** Default retention period for unknown document types */
const DEFAULT_RETENTION_YEARS = 10;

/** Initial chain hash for the first document in a tenant's chain */
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArchiveDocumentType =
  | "INVOICE"
  | "CREDIT_NOTE"
  | "RECEIPT"
  | "CONTRACT"
  | "SETTLEMENT";

export interface ArchiveDocumentParams {
  tenantId: string;
  documentType: ArchiveDocumentType;
  referenceId: string;
  referenceNumber: string;
  content: Buffer;
  fileName: string;
  mimeType?: string;
  metadata?: Record<string, string>;
  archivedById: string;
}

export interface ArchivedDocumentResult {
  id: string;
  tenantId: string;
  documentType: string;
  referenceId: string;
  referenceNumber: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  contentHash: string;
  chainHash: string;
  archivedAt: Date;
  retentionUntil: Date;
}

export interface ChainVerificationResult {
  passed: boolean;
  totalDocuments: number;
  validDocuments: number;
  invalidDocuments: number;
  errors: Array<{
    documentId: string;
    referenceNumber: string;
    reason: string;
  }>;
}

export interface ArchiveSearchParams {
  tenantId: string;
  documentType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

export interface ArchiveSearchResult {
  items: Array<{
    id: string;
    tenantId: string;
    documentType: string;
    referenceId: string;
    referenceNumber: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    contentHash: string;
    chainHash: string;
    archivedAt: Date;
    retentionUntil: Date;
    lastAccessedAt: Date | null;
    accessCount: number;
    metadata: Record<string, string> | null;
    archivedBy: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  }>;
  total: number;
}

// ---------------------------------------------------------------------------
// Hashing functions
// ---------------------------------------------------------------------------

/**
 * Create SHA-256 hash of document content.
 * Used as the primary integrity fingerprint for each archived document.
 */
export function hashDocument(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Create a chain hash that includes the previous document's hash.
 * This links documents in a tamper-evident chain: modifying or removing
 * any document in the sequence breaks the chain for all subsequent entries.
 */
export function createChainHash(
  documentHash: string,
  previousChainHash: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${previousChainHash}:${documentHash}`)
    .digest("hex");
}

/**
 * Verify that a document's content matches its stored hash.
 */
export function verifyDocumentIntegrity(
  content: Buffer,
  expectedHash: string
): boolean {
  const actualHash = hashDocument(content);
  return actualHash === expectedHash;
}

// ---------------------------------------------------------------------------
// Archive operations
// ---------------------------------------------------------------------------

/**
 * Archive a document with GoBD-compliant hash chain.
 *
 * The document is uploaded to a separate archive prefix in S3/MinIO,
 * a SHA-256 content hash is computed, and it is linked into the tenant's
 * hash chain for tamper detection.
 *
 * @throws Error if a document with the same (tenantId, referenceId, documentType) already exists
 */
export async function archiveDocument(
  params: ArchiveDocumentParams
): Promise<ArchivedDocumentResult> {
  const {
    tenantId,
    documentType,
    referenceId,
    referenceNumber,
    content,
    fileName,
    mimeType = "application/pdf",
    metadata,
    archivedById,
  } = params;

  archiveLogger.info(
    { tenantId, documentType, referenceId, referenceNumber },
    "Archiving document"
  );

  // Check for duplicate
  const existing = await prisma.archivedDocument.findUnique({
    where: {
      tenantId_referenceId_documentType: {
        tenantId,
        referenceId,
        documentType,
      },
    },
  });

  if (existing) {
    throw new Error(
      `Dokument bereits archiviert: ${documentType} / ${referenceNumber} (ID: ${existing.id})`
    );
  }

  // Compute content hash
  const contentHash = hashDocument(content);

  // Get the last document in the chain for this tenant
  const lastInChain = await prisma.archivedDocument.findFirst({
    where: { tenantId },
    orderBy: { archivedAt: "desc" },
    select: { id: true, chainHash: true },
  });

  const previousChainHash = lastInChain?.chainHash ?? GENESIS_HASH;
  const chainHash = createChainHash(contentHash, previousChainHash);

  // Calculate retention period from tenant settings (with fallback to defaults)
  const tenantSettings = await getTenantSettings(tenantId);
  const tenantRetentionMap: Record<string, number> = {
    INVOICE: tenantSettings.gobdRetentionYearsInvoice,
    CREDIT_NOTE: tenantSettings.gobdRetentionYearsInvoice,
    RECEIPT: tenantSettings.gobdRetentionYearsInvoice,
    CONTRACT: tenantSettings.gobdRetentionYearsContract,
    SETTLEMENT: tenantSettings.gobdRetentionYearsInvoice,
  };
  const retentionYears =
    tenantRetentionMap[documentType] ?? DEFAULT_RETENTION_YEARS_MAP[documentType] ?? DEFAULT_RETENTION_YEARS;
  const retentionUntil = new Date();
  retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);

  // Upload to S3 with archive prefix
  const archiveFileName = `${ARCHIVE_PREFIX}/${tenantId}/${documentType}/${referenceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}_${Date.now()}.pdf`;

  // Use the raw S3 client to upload with the archive prefix
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const putCommand = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: archiveFileName,
    Body: content,
    ContentType: mimeType,
    Metadata: {
      "archive-type": documentType,
      "reference-id": referenceId,
      "reference-number": referenceNumber,
      "content-hash": contentHash,
      "chain-hash": chainHash,
      "tenant-id": tenantId,
      "archived-at": new Date().toISOString(),
    },
  });

  await s3Client.send(putCommand);

  // Create database record
  const archived = await prisma.archivedDocument.create({
    data: {
      tenantId,
      documentType,
      referenceId,
      referenceNumber,
      fileName,
      fileSize: content.length,
      mimeType,
      storageKey: archiveFileName,
      contentHash,
      chainHash,
      previousArchiveId: lastInChain?.id ?? null,
      metadata: metadata ?? undefined,
      archivedById,
      retentionUntil,
    },
  });

  archiveLogger.info(
    { archiveId: archived.id, contentHash, chainHash },
    "Document archived successfully"
  );

  return {
    id: archived.id,
    tenantId: archived.tenantId,
    documentType: archived.documentType,
    referenceId: archived.referenceId,
    referenceNumber: archived.referenceNumber,
    fileName: archived.fileName,
    fileSize: archived.fileSize,
    mimeType: archived.mimeType,
    contentHash: archived.contentHash,
    chainHash: archived.chainHash,
    archivedAt: archived.archivedAt,
    retentionUntil: archived.retentionUntil,
  };
}

/**
 * Retrieve an archived document including its content from S3.
 * Updates access tracking (lastAccessedAt, accessCount).
 */
export async function getArchivedDocument(
  id: string,
  tenantId: string
): Promise<{
  document: ArchivedDocumentResult;
  content: Buffer;
} | null> {
  const doc = await prisma.archivedDocument.findFirst({
    where: { id, tenantId },
  });

  if (!doc) return null;

  // Fetch content from S3
  const getCommand = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: doc.storageKey,
  });

  const response = await s3Client.send(getCommand);
  const bodyStream = response.Body;

  if (!bodyStream) {
    throw new Error(`Archiviertes Dokument nicht in Storage gefunden: ${doc.storageKey}`);
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const chunk of bodyStream as any) {
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks);

  // Verify integrity on retrieval
  if (!verifyDocumentIntegrity(content, doc.contentHash)) {
    archiveLogger.error(
      { archiveId: id, storageKey: doc.storageKey },
      "INTEGRITY VIOLATION: Document content does not match stored hash!"
    );
    throw new Error(
      "Integritaetsverletzung: Der Dokumentinhalt stimmt nicht mit dem gespeicherten Hash ueberein. " +
      "Das Dokument wurde moeglicherweise manipuliert."
    );
  }

  // Update access tracking
  await prisma.archivedDocument.update({
    where: { id },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
    },
  });

  return {
    document: {
      id: doc.id,
      tenantId: doc.tenantId,
      documentType: doc.documentType,
      referenceId: doc.referenceId,
      referenceNumber: doc.referenceNumber,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      contentHash: doc.contentHash,
      chainHash: doc.chainHash,
      archivedAt: doc.archivedAt,
      retentionUntil: doc.retentionUntil,
    },
    content,
  };
}

/**
 * Search the archive with filters and pagination.
 */
export async function searchArchive(
  params: ArchiveSearchParams
): Promise<ArchiveSearchResult> {
  const {
    tenantId,
    documentType,
    dateFrom,
    dateTo,
    searchTerm,
    limit = 50,
    offset = 0,
  } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId };

  if (documentType) {
    where.documentType = documentType;
  }

  if (dateFrom || dateTo) {
    where.archivedAt = {};
    if (dateFrom) where.archivedAt.gte = dateFrom;
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      where.archivedAt.lte = endOfDay;
    }
  }

  if (searchTerm) {
    where.OR = [
      { referenceNumber: { contains: searchTerm, mode: "insensitive" } },
      { fileName: { contains: searchTerm, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.archivedDocument.findMany({
      where,
      include: {
        archivedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { archivedAt: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    prisma.archivedDocument.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      documentType: item.documentType,
      referenceId: item.referenceId,
      referenceNumber: item.referenceNumber,
      fileName: item.fileName,
      fileSize: item.fileSize,
      mimeType: item.mimeType,
      contentHash: item.contentHash,
      chainHash: item.chainHash,
      archivedAt: item.archivedAt,
      retentionUntil: item.retentionUntil,
      lastAccessedAt: item.lastAccessedAt,
      accessCount: item.accessCount,
      metadata: item.metadata as Record<string, string> | null,
      archivedBy: item.archivedBy,
    })),
    total,
  };
}

// ---------------------------------------------------------------------------
// Chain integrity verification
// ---------------------------------------------------------------------------

/**
 * Verify the integrity of the hash chain for a tenant.
 *
 * Walks the chain from oldest to newest, recomputing each chain hash
 * and comparing it to the stored value. Any mismatch indicates tampering.
 *
 * @param tenantId - Tenant to verify
 * @param startDate - Optional: only verify documents archived on or after this date
 * @param endDate - Optional: only verify documents archived on or before this date
 */
export async function verifyChainIntegrity(
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<ChainVerificationResult> {
  archiveLogger.info(
    { tenantId, startDate, endDate },
    "Starting chain integrity verification"
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId };

  if (startDate || endDate) {
    where.archivedAt = {};
    if (startDate) where.archivedAt.gte = startDate;
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      where.archivedAt.lte = endOfDay;
    }
  }

  // Fetch all documents in chain order (oldest first)
  const documents = await prisma.archivedDocument.findMany({
    where,
    orderBy: { archivedAt: "asc" },
    select: {
      id: true,
      referenceNumber: true,
      contentHash: true,
      chainHash: true,
      previousArchiveId: true,
    },
  });

  const errors: ChainVerificationResult["errors"] = [];
  let validCount = 0;

  // If we're verifying a subset, we need the chain hash of the document
  // immediately before our range
  let expectedPreviousChainHash = GENESIS_HASH;

  if (startDate && documents.length > 0) {
    // Get the document just before our range
    const predecessor = await prisma.archivedDocument.findFirst({
      where: {
        tenantId,
        archivedAt: { lt: startDate },
      },
      orderBy: { archivedAt: "desc" },
      select: { chainHash: true },
    });
    if (predecessor) {
      expectedPreviousChainHash = predecessor.chainHash;
    }
  }

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const previousChainHash =
      i === 0 ? expectedPreviousChainHash : documents[i - 1].chainHash;

    // Recompute the expected chain hash
    const expectedChainHash = createChainHash(doc.contentHash, previousChainHash);

    if (expectedChainHash !== doc.chainHash) {
      errors.push({
        documentId: doc.id,
        referenceNumber: doc.referenceNumber,
        reason: `Ketten-Hash stimmt nicht ueberein. Erwartet: ${expectedChainHash.substring(0, 16)}..., Gespeichert: ${doc.chainHash.substring(0, 16)}...`,
      });
    } else {
      validCount++;
    }
  }

  const result: ChainVerificationResult = {
    passed: errors.length === 0,
    totalDocuments: documents.length,
    validDocuments: validCount,
    invalidDocuments: errors.length,
    errors,
  };

  archiveLogger.info(
    {
      tenantId,
      passed: result.passed,
      total: result.totalDocuments,
      valid: result.validDocuments,
      invalid: result.invalidDocuments,
    },
    "Chain integrity verification completed"
  );

  return result;
}

/**
 * Save a verification result to the database.
 */
export async function saveVerificationResult(
  tenantId: string,
  verifiedById: string,
  scope: string,
  result: ChainVerificationResult
) {
  return prisma.archiveVerificationLog.create({
    data: {
      tenantId,
      verifiedById,
      scope,
      result: result.passed
        ? "PASSED"
        : result.invalidDocuments === result.totalDocuments
          ? "FAILED"
          : "PARTIAL",
      totalDocs: result.totalDocuments,
      validDocs: result.validDocuments,
      invalidDocs: result.invalidDocuments,
      details: result.errors.length > 0 ? result.errors : undefined,
    },
  });
}

// ---------------------------------------------------------------------------
// Archive export (Betriebspruefung / tax audit)
// ---------------------------------------------------------------------------

/**
 * Export all archived documents for a given year as a structured dataset.
 * Returns metadata for building a ZIP archive on the API layer.
 *
 * The export includes:
 * - An index CSV with all document metadata
 * - References to each archived file in S3 for streaming into a ZIP
 */
export async function getArchiveExportData(
  tenantId: string,
  year: number
): Promise<{
  documents: Array<{
    id: string;
    documentType: string;
    referenceNumber: string;
    fileName: string;
    fileSize: number;
    contentHash: string;
    chainHash: string;
    archivedAt: Date;
    storageKey: string;
    metadata: Record<string, string> | null;
  }>;
  indexCsv: string;
  totalSize: number;
}> {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

  const documents = await prisma.archivedDocument.findMany({
    where: {
      tenantId,
      archivedAt: {
        gte: startOfYear,
        lte: endOfYear,
      },
    },
    orderBy: { archivedAt: "asc" },
  });

  // Build index CSV (GDPdU/GoBD-compatible)
  const csvHeader = [
    "Lfd.Nr.",
    "Dokumenttyp",
    "Referenznummer",
    "Dateiname",
    "Dateigroesse (Bytes)",
    "MIME-Typ",
    "SHA-256 Hash",
    "Ketten-Hash",
    "Archiviert am",
    "Aufbewahrung bis",
  ].join(";");

  // Sanitize CSV values to prevent formula injection in spreadsheet applications
  const sanitizeCsvValue = (value: string | number): string => {
    const str = String(value);
    const FORMULA_CHARS = ["=", "+", "-", "@", "\t", "\r"];
    if (FORMULA_CHARS.some((c) => str.startsWith(c))) {
      return "'" + str;
    }
    return str;
  };

  const csvRows = documents.map((doc, index) =>
    [
      index + 1,
      sanitizeCsvValue(doc.documentType),
      sanitizeCsvValue(doc.referenceNumber),
      sanitizeCsvValue(doc.fileName),
      doc.fileSize,
      sanitizeCsvValue(doc.mimeType),
      doc.contentHash,
      doc.chainHash,
      doc.archivedAt.toISOString(),
      doc.retentionUntil.toISOString(),
    ].join(";")
  );

  // UTF-8 BOM for Excel compatibility
  const indexCsv = "\uFEFF" + [csvHeader, ...csvRows].join("\r\n");
  const totalSize = documents.reduce((sum, doc) => sum + doc.fileSize, 0);

  return {
    documents: documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      referenceNumber: doc.referenceNumber,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      contentHash: doc.contentHash,
      chainHash: doc.chainHash,
      archivedAt: doc.archivedAt,
      storageKey: doc.storageKey,
      metadata: doc.metadata as Record<string, string> | null,
    })),
    indexCsv,
    totalSize,
  };
}

// ---------------------------------------------------------------------------
// Retention policy
// ---------------------------------------------------------------------------

/**
 * Check if a document is within its retention period.
 * Returns true if the document CANNOT be deleted yet.
 */
export function isWithinRetention(retentionUntil: Date): boolean {
  return new Date() < retentionUntil;
}

/**
 * Get archive statistics for a tenant.
 */
export async function getArchiveStats(tenantId: string) {
  const [totalDocs, totalSize, byType, nextRetention, lastVerification] =
    await Promise.all([
      prisma.archivedDocument.count({ where: { tenantId } }),

      prisma.archivedDocument.aggregate({
        where: { tenantId },
        _sum: { fileSize: true },
      }),

      prisma.archivedDocument.groupBy({
        by: ["documentType"],
        where: { tenantId },
        _count: { id: true },
      }),

      prisma.archivedDocument.findFirst({
        where: {
          tenantId,
          retentionUntil: { gt: new Date() },
        },
        orderBy: { retentionUntil: "asc" },
        select: { retentionUntil: true, referenceNumber: true },
      }),

      prisma.archiveVerificationLog.findFirst({
        where: { tenantId },
        orderBy: { verifiedAt: "desc" },
        select: {
          verifiedAt: true,
          result: true,
          totalDocs: true,
          validDocs: true,
          invalidDocs: true,
        },
      }),
    ]);

  return {
    totalDocuments: totalDocs,
    totalSizeBytes: totalSize._sum.fileSize ?? 0,
    documentsByType: byType.map((g) => ({
      type: g.documentType,
      count: g._count.id,
    })),
    nextRetentionExpiry: nextRetention
      ? {
          date: nextRetention.retentionUntil,
          referenceNumber: nextRetention.referenceNumber,
        }
      : null,
    lastVerification: lastVerification
      ? {
          date: lastVerification.verifiedAt,
          result: lastVerification.result,
          totalDocs: lastVerification.totalDocs,
          validDocs: lastVerification.validDocs,
          invalidDocs: lastVerification.invalidDocs,
        }
      : null,
  };
}
