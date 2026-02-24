import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { uploadFile, getSignedUrl, ensureBucket } from "@/lib/storage";
import { validateFileContent } from "@/lib/file-validation";
import { apiLogger as logger } from "@/lib/logger";
import {
  rateLimit,
  getClientIp,
  getRateLimitResponse,
  UPLOAD_RATE_LIMIT,
} from "@/lib/rate-limit";
import {
  checkStorageLimit,
  incrementStorageUsage,
} from "@/lib/storage-tracking";

// Allowed file types for different upload categories
const ALLOWED_TYPES: Record<string, string[]> = {
  logo: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"],
  document: ["application/pdf", "image/png", "image/jpeg"],
  letterhead: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
};

const MAX_FILE_SIZE: Record<string, number> = {
  logo: 2 * 1024 * 1024, // 2MB
  document: 10 * 1024 * 1024, // 10MB
  letterhead: 5 * 1024 * 1024, // 5MB
};

// POST /api/upload - Upload a file to S3/MinIO
export async function POST(request: NextRequest) {
  // Rate limiting: 20 uploads per minute
  const clientIp = getClientIp(request);
  const rateLimitResult = rateLimit(
    `${clientIp}:/api/upload`,
    UPLOAD_RATE_LIMIT
  );
  if (!rateLimitResult.success) {
    return getRateLimitResponse(rateLimitResult, UPLOAD_RATE_LIMIT);
  }

  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_CREATE);
    if (!check.authorized) return check.error!;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "document";

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ALLOWED_TYPES[category] || ALLOWED_TYPES.document;
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Ungültiger Dateityp. Erlaubt: ${allowedTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate file size
    const maxSize = MAX_FILE_SIZE[category] || MAX_FILE_SIZE.document;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `Datei zu gross. Maximum: ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Check tenant storage limit
    if (check.tenantId) {
      const { allowed, info } = await checkStorageLimit(
        check.tenantId,
        file.size
      );
      if (!allowed) {
        return NextResponse.json(
          {
            error: `Speicherlimit erreicht. Verwendet: ${info.usedFormatted} von ${info.limitFormatted}. Die Datei (${(file.size / 1024 / 1024).toFixed(1)} MB) überschreitet das Limit.`,
            code: "STORAGE_LIMIT_EXCEEDED",
            storageInfo: info,
          },
          { status: 413 }
        );
      }
    }

    // Ensure S3 bucket exists
    try {
      await ensureBucket();
    } catch (bucketError) {
      logger.error({ err: bucketError }, "S3 bucket error");
      return NextResponse.json(
        { error: "Storage-Service nicht verfügbar. Bitte später erneut versuchen." },
        { status: 503 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate file content (magic number check)
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

    // Upload to S3/MinIO
    const s3Key = await uploadFile(
      buffer,
      `${category}/${file.name}`,
      file.type,
      check.tenantId!
    );

    // Track storage usage
    if (check.tenantId) {
      await incrementStorageUsage(check.tenantId, file.size);
    }

    // Generate a signed URL for immediate access (valid for 1 hour)
    const signedUrl = await getSignedUrl(s3Key);

    return NextResponse.json({
      key: s3Key,
      url: signedUrl,
      filename: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    logger.error({ err: error }, "Error uploading file");
    return NextResponse.json(
      { error: "Fehler beim Hochladen der Datei" },
      { status: 500 }
    );
  }
}
