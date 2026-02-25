import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { DocumentCategory, DocumentApprovalStatus } from "@prisma/client";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import {
  rateLimit,
  getClientIp,
  getRateLimitResponse,
  UPLOAD_RATE_LIMIT,
} from "@/lib/rate-limit";
import {
  checkStorageLimit,
} from "@/lib/storage-tracking";
import { dispatchWebhook } from "@/lib/webhooks";
import {
  getUserHighestHierarchy,
  ROLE_HIERARCHY,
} from "@/lib/auth/permissions";

// Schema für JSON-basierte Dokument-Erstellung (ohne Datei-Upload)
const documentCreateSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich"),
  description: z.string().optional(),
  category: z.enum(["CONTRACT", "PROTOCOL", "REPORT", "INVOICE", "PERMIT", "CORRESPONDENCE", "OTHER"]),
  fileName: z.string().min(1, "Dateiname ist erforderlich"),
  fileUrl: z.string().min(1, "Datei-URL ist erforderlich"),
  fileSizeBytes: z.number().optional(),
  mimeType: z.string().optional(),
  tags: z.array(z.string()).default([]),
  parkId: z.string().optional().nullable(),
  turbineId: z.string().optional().nullable(),
  fundId: z.string().optional().nullable(),
  contractId: z.string().optional().nullable(),
  shareholderId: z.string().optional().nullable(),
  serviceEventId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(), // For versioning
});

// Erlaubte MIME-Types für Dokumente
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
];

// Maximale Dateigröße: 50 MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// GET /api/documents - Liste aller Dokumente
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error;

    // Validate tenantId exists
    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Kein Mandant zugeordnet" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category");
    const parkId = searchParams.get("parkId");
    const fundId = searchParams.get("fundId");
    const contractId = searchParams.get("contractId");
    const turbineId = searchParams.get("turbineId");
    const serviceEventId = searchParams.get("serviceEventId");
    const approvalStatus = searchParams.get("approvalStatus");
    const includeArchived = searchParams.get("includeArchived") === "true";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const where = {
      tenantId: check.tenantId,
      parentId: null, // Only show latest versions
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { fileName: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(category && { category: category as DocumentCategory }),
      ...(approvalStatus && { approvalStatus: approvalStatus as DocumentApprovalStatus }),
      ...(parkId && { parkId }),
      ...(fundId && { fundId }),
      ...(contractId && { contractId }),
      ...(turbineId && { turbineId }),
      ...(serviceEventId && { serviceEventId }),
      ...(!includeArchived && { isArchived: false }),
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          park: {
            select: { id: true, name: true, shortName: true },
          },
          fund: {
            select: { id: true, name: true },
          },
          turbine: {
            select: { id: true, designation: true },
          },
          contract: {
            select: { id: true, title: true },
          },
          serviceEvent: {
            select: { id: true, eventType: true, eventDate: true },
          },
          uploadedBy: {
            select: { firstName: true, lastName: true },
          },
          reviewedBy: {
            select: { firstName: true, lastName: true },
          },
          _count: {
            select: { versions: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    // Get category counts
    const categoryCounts = await prisma.document.groupBy({
      by: ["category"],
      where: {
        tenantId: check.tenantId,
        parentId: null,
        isArchived: false,
      },
      _count: true,
    });

    // Get approval status counts
    const approvalStatusCounts = await prisma.document.groupBy({
      by: ["approvalStatus"],
      where: {
        tenantId: check.tenantId,
        parentId: null,
        isArchived: false,
      },
      _count: true,
    });

    return NextResponse.json({
      data: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSizeBytes: doc.fileSizeBytes ? Number(doc.fileSizeBytes) : null,
        mimeType: doc.mimeType,
        version: doc.version,
        tags: doc.tags,
        isArchived: doc.isArchived,
        park: doc.park,
        fund: doc.fund,
        turbine: doc.turbine,
        contract: doc.contract,
        serviceEvent: doc.serviceEvent,
        approvalStatus: doc.approvalStatus,
        uploadedBy: doc.uploadedBy
          ? [doc.uploadedBy.firstName, doc.uploadedBy.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
        reviewedBy: doc.reviewedBy
          ? [doc.reviewedBy.firstName, doc.reviewedBy.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
        reviewedAt: doc.reviewedAt?.toISOString() || null,
        reviewNotes: doc.reviewNotes,
        publishedAt: doc.publishedAt?.toISOString() || null,
        versionCount: doc._count.versions + 1,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      categoryCounts: categoryCounts.reduce(
        (acc, item) => {
          acc[item.category] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      approvalStatusCounts: approvalStatusCounts.reduce(
        (acc, item) => {
          acc[item.approvalStatus] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching documents");
    return NextResponse.json(
      { error: "Fehler beim Laden der Dokumente" },
      { status: 500 }
    );
  }
}

// POST /api/documents - Dokument erstellen (mit oder ohne Datei-Upload)
export async function POST(request: NextRequest) {
  // Rate limiting: 20 uploads per minute
  const clientIp = getClientIp(request);
  const rateLimitResult = rateLimit(
    `${clientIp}:/api/documents`,
    UPLOAD_RATE_LIMIT
  );
  if (!rateLimitResult.success) {
    return getRateLimitResponse(rateLimitResult, UPLOAD_RATE_LIMIT);
  }

  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_CREATE);
    if (!check.authorized) return check.error;

    // Validate tenantId exists
    if (!check.tenantId) {
      logger.error("Document creation failed: No tenantId in session");
      return NextResponse.json(
        { error: "Kein Mandant zugeordnet. Bitte kontaktieren Sie den Administrator." },
        { status: 400 }
      );
    }

    const contentType = request.headers.get("content-type") || "";

    // Multipart Form Data: Datei-Upload
    if (contentType.includes("multipart/form-data")) {
      return handleFileUpload(request, check.tenantId, check.userId);
    }

    // JSON: Dokument ohne Datei-Upload erstellen (z.B. für externe URLs)
    return handleJsonCreate(request, check.tenantId, check.userId);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    // Log full error for debugging
    logger.error({ err: error }, "Error creating document");
    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json(
      { error: `Fehler beim Erstellen des Dokuments: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * Verarbeitet multipart/form-data Datei-Uploads
 */
async function handleFileUpload(
  request: NextRequest,
  tenantId: string,
  userId: string | undefined
) {
  // Stelle sicher dass der Bucket existiert
  try {
    await ensureBucket();
  } catch (bucketError) {
    logger.error({ err: bucketError }, "Bucket initialization failed");
    return NextResponse.json(
      { error: "Storage-System nicht verfügbar. Bitte versuchen Sie es später erneut." },
      { status: 503 }
    );
  }

  // Parse FormData
  const formData = await request.formData();

  // Hole die Datei aus dem FormData
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: "Keine Datei im Request gefunden" },
      { status: 400 }
    );
  }

  // Validiere Dateigröße
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Datei zu gross. Maximum: ${MAX_FILE_SIZE / 1024 / 1024} MB` },
      { status: 400 }
    );
  }

  // Check tenant storage limit
  const { allowed, info: storageInfo } = await checkStorageLimit(
    tenantId,
    file.size
  );
  if (!allowed) {
    return NextResponse.json(
      {
        error: `Speicherlimit erreicht. Verwendet: ${storageInfo.usedFormatted} von ${storageInfo.limitFormatted}. Die Datei (${(file.size / 1024 / 1024).toFixed(1)} MB) überschreitet das Limit.`,
        code: "STORAGE_LIMIT_EXCEEDED",
        storageInfo,
      },
      { status: 413 }
    );
  }

  // Validiere MIME-Type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: "Dateityp nicht erlaubt",
        allowedTypes: ALLOWED_MIME_TYPES,
        receivedType: file.type
      },
      { status: 400 }
    );
  }

  // Hole Metadaten aus FormData
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || undefined;
  const category = formData.get("category") as string;
  const tagsRaw = formData.get("tags") as string;
  let tags: string[] = [];
  if (tagsRaw) {
    try {
      tags = JSON.parse(tagsRaw);
    } catch {
      // Invalid JSON for tags - fall back to empty array
      tags = [];
    }
  }
  const parkId = (formData.get("parkId") as string) || null;
  const turbineId = (formData.get("turbineId") as string) || null;
  const fundId = (formData.get("fundId") as string) || null;
  const contractId = (formData.get("contractId") as string) || null;
  const shareholderId = (formData.get("shareholderId") as string) || null;
  const serviceEventId = (formData.get("serviceEventId") as string) || null;
  const parentId = (formData.get("parentId") as string) || null;

  // Validiere Pflichtfelder
  if (!title || !category) {
    return NextResponse.json(
      { error: "Titel und Kategorie sind erforderlich" },
      { status: 400 }
    );
  }

  // Validiere Kategorie
  const validCategories = ["CONTRACT", "PROTOCOL", "REPORT", "INVOICE", "PERMIT", "CORRESPONDENCE", "OTHER"];
  if (!validCategories.includes(category)) {
    return NextResponse.json(
      { error: "Ungültige Kategorie", validCategories },
      { status: 400 }
    );
  }

  // Konvertiere File zu Buffer für S3 Upload
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validiere Dateiinhalt (Magic Number Check)
  const contentValidation = validateFileContent(buffer, file.type);
  if (!contentValidation.valid) {
    return NextResponse.json(
      {
        error: "Dateiinhalt-Validierung fehlgeschlagen",
        reason: contentValidation.reason,
        detectedType: contentValidation.detectedType,
      },
      { status: 400 }
    );
  }

  // Upload zu S3/MinIO
  let s3Key: string;
  try {
    s3Key = await uploadFile(buffer, file.name, file.type, tenantId);
  } catch (uploadError) {
    logger.error({ err: uploadError }, "S3 upload failed");
    return NextResponse.json(
      { error: "Datei-Upload fehlgeschlagen. Bitte versuchen Sie es erneut." },
      { status: 500 }
    );
  }

  // Bestimme Versionsnummer
  let version = 1;
  if (parentId) {
    const latestVersion = await prisma.document.findFirst({
      where: {
        OR: [
          { id: parentId },
          { parentId: parentId },
        ],
      },
      orderBy: { version: "desc" },
    });
    version = (latestVersion?.version || 0) + 1;
  }

  // Determine approval status: Admins can auto-publish, others start as DRAFT
  let approvalStatus: "DRAFT" | "PUBLISHED" = "DRAFT";
  let publishedAt: Date | null = null;
  if (userId) {
    const hierarchy = await getUserHighestHierarchy(userId);
    if (hierarchy >= ROLE_HIERARCHY.ADMIN) {
      approvalStatus = "PUBLISHED";
      publishedAt = new Date();
    }
  }

  // Erstelle Datenbank-Eintrag + Storage-Tracking atomar in einer Transaktion
  const document = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        title,
        description,
        category: category as DocumentCategory,
        fileName: file.name,
        fileUrl: s3Key, // S3-Key (nicht die volle URL!)
        fileSizeBytes: BigInt(file.size),
        mimeType: file.type,
        tags,
        version,
        approvalStatus,
        publishedAt,
        parkId,
        turbineId,
        fundId,
        contractId,
        shareholderId,
        serviceEventId,
        parentId,
        tenantId,
        uploadedById: userId || null,
      },
    });

    // Track storage usage within the same transaction
    await tx.tenant.update({
      where: { id: tenantId },
      data: { storageUsedBytes: { increment: file.size } },
    });

    return doc;
  });

  // Fire-and-forget webhook dispatch
  dispatchWebhook(tenantId, "document.uploaded", {
    id: document.id,
    title: document.title,
    category: document.category,
  }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });

  return NextResponse.json({
    ...document,
    fileSizeBytes: document.fileSizeBytes ? Number(document.fileSizeBytes) : null,
  }, { status: 201 });
}

/**
 * Verarbeitet JSON-basierte Dokument-Erstellung (ohne Datei-Upload)
 */
async function handleJsonCreate(
  request: NextRequest,
  tenantId: string,
  userId: string | undefined
) {
  const body = await request.json();
  const validatedData = documentCreateSchema.parse(body);

  // If this is a new version, get the current latest version number
  let version = 1;
  if (validatedData.parentId) {
    const parent = await prisma.document.findUnique({
      where: { id: validatedData.parentId },
    });
    if (parent) {
      // Get the highest version in this document's version chain
      const latestVersion = await prisma.document.findFirst({
        where: {
          OR: [
            { id: validatedData.parentId },
            { parentId: validatedData.parentId },
          ],
        },
        orderBy: { version: "desc" },
      });
      version = (latestVersion?.version || 0) + 1;
    }
  }

  // Determine approval status: Admins can auto-publish, others start as DRAFT
  let jsonApprovalStatus: "DRAFT" | "PUBLISHED" = "DRAFT";
  let jsonPublishedAt: Date | null = null;
  if (userId) {
    const hierarchy = await getUserHighestHierarchy(userId);
    if (hierarchy >= ROLE_HIERARCHY.ADMIN) {
      jsonApprovalStatus = "PUBLISHED";
      jsonPublishedAt = new Date();
    }
  }

  // Erstelle Dokument + Storage-Tracking atomar in einer Transaktion
  const document = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        category: validatedData.category,
        fileName: validatedData.fileName,
        fileUrl: validatedData.fileUrl,
        fileSizeBytes: validatedData.fileSizeBytes
          ? BigInt(validatedData.fileSizeBytes)
          : null,
        mimeType: validatedData.mimeType,
        tags: validatedData.tags,
        version,
        approvalStatus: jsonApprovalStatus,
        publishedAt: jsonPublishedAt,
        parkId: validatedData.parkId || null,
        turbineId: validatedData.turbineId || null,
        fundId: validatedData.fundId || null,
        contractId: validatedData.contractId || null,
        shareholderId: validatedData.shareholderId || null,
        serviceEventId: validatedData.serviceEventId || null,
        parentId: validatedData.parentId || null,
        tenantId,
        uploadedById: userId || null,
      },
    });

    // Track storage usage within the same transaction (if file size is known)
    if (validatedData.fileSizeBytes && validatedData.fileSizeBytes > 0) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { storageUsedBytes: { increment: validatedData.fileSizeBytes } },
      });
    }

    return doc;
  });

  // Fire-and-forget webhook dispatch
  dispatchWebhook(tenantId, "document.uploaded", {
    id: document.id,
    title: document.title,
    category: document.category,
  }).catch((err) => { logger.warn({ err }, "[Webhook] Dispatch failed"); });

  // Convert BigInt to Number for JSON serialization
  return NextResponse.json({
    ...document,
    fileSizeBytes: document.fileSizeBytes ? Number(document.fileSizeBytes) : null,
  }, { status: 201 });
}
