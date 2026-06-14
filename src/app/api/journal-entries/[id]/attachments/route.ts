/**
 * GET  /api/journal-entries/[id]/attachments  — Liste der Belege
 * POST /api/journal-entries/[id]/attachments  — Beleg hochladen
 *
 * P24.2 GoBD §147 AO Belegablage. SHA-256-Hash wird beim Upload berechnet
 * und ist unveränderlich. Audit-Trail über uploadedById + uploadedAt.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { uploadFile } from "@/lib/storage";
import { serializePrisma } from "@/lib/serialize";
import { UPLOAD_LIMITS } from "@/lib/config/upload-limits";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
];

const MAX_SIZE_BYTES = UPLOAD_LIMITS.journalAttachment;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;

    const entry = await prisma.journalEntry.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      return apiError("NOT_FOUND", 404, { message: "Buchung nicht gefunden" });
    }

    const attachments = await prisma.journalAttachment.findMany({
      where: { tenantId: check.tenantId, journalEntryId: id },
      include: {
        uploadedBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { uploadedAt: "asc" },
    });

    return NextResponse.json({ data: serializePrisma(attachments) });
  } catch (error) {
    logger.error({ err: error }, "Error listing attachments");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden" });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("accounting:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;

    const entry = await prisma.journalEntry.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      return apiError("NOT_FOUND", 404, { message: "Buchung nicht gefunden" });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const description = (formData.get("description") as string) || null;

    if (!file) {
      return apiError("BAD_REQUEST", 400, { message: "Keine Datei im Request" });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return apiError("BAD_REQUEST", 400, {
        message: "Nur PDF und Bilddateien erlaubt (JPEG/PNG/TIFF/WebP)",
      });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return apiError("BAD_REQUEST", 400, {
        message: `Datei zu groß (max. ${MAX_SIZE_BYTES / 1024 / 1024} MB)`,
      });
    }

    // SHA-256 berechnen + S3-Upload parallel
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const fileUrl = await uploadFile(buffer, file.name, file.type, check.tenantId);

    const attachment = await prisma.journalAttachment.create({
      data: {
        tenantId: check.tenantId,
        journalEntryId: id,
        fileName: file.name,
        fileUrl,
        mimeType: file.type,
        fileHash,
        fileSizeBytes: BigInt(file.size),
        description: description?.slice(0, 500) ?? null,
        uploadedById: check.userId!,
      },
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        journalEntryId: id,
        attachmentId: attachment.id,
        fileHash,
      },
      "Journal attachment uploaded",
    );

    return NextResponse.json(serializePrisma(attachment), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error uploading attachment");
    return apiError("CREATE_FAILED", 500, {
      message: "Fehler beim Hochladen",
    });
  }
}
