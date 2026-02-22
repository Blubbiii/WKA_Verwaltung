/**
 * User Avatar API
 *
 * POST   /api/user/avatar - Upload avatar image
 * DELETE /api/user/avatar - Remove avatar image
 *
 * Authentication: Any authenticated user (for their own avatar)
 *
 * Constraints:
 * - Max file size: 2MB
 * - Allowed formats: PNG, JPEG, WebP
 * - Stored in S3/MinIO via storage service
 * - URL saved in user.avatarUrl field
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { uploadFile, deleteFile, getSignedUrl } from "@/lib/storage";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Constants
// =============================================================================

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

// =============================================================================
// POST /api/user/avatar - Upload avatar
// =============================================================================

export async function POST(request: Request) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId, tenantId } = check;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: "Ungültiges Dateiformat. Erlaubt: PNG, JPEG, WebP",
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: "Datei zu groß. Maximale Größe: 2MB",
        },
        { status: 400 }
      );
    }

    // Get current user to check for existing avatar
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    // Delete old avatar from storage if it exists
    if (currentUser?.avatarUrl) {
      try {
        await deleteFile(currentUser.avatarUrl);
      } catch (error) {
        // Log but don't fail if old file deletion fails
        logger.warn(
          { err: error },
          "[Avatar API] Could not delete old avatar"
        );
      }
    }

    // Convert File to Buffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate a specific path for avatars
    const extension = file.name.split(".").pop() || "jpg";
    const avatarFileName = `avatar.${extension}`;

    // Upload to S3/MinIO - key is stored as avatarUrl
    // The storage service prefixes with tenantId automatically
    const storageKey = await uploadFile(
      buffer,
      avatarFileName,
      file.type,
      tenantId || "default"
    );

    // Save the storage key in the user record
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: storageKey },
    });

    // Generate a signed URL for immediate display
    const signedUrl = await getSignedUrl(storageKey, 3600);

    return NextResponse.json(
      {
        success: true,
        avatarUrl: storageKey,
        signedUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error({ err: error }, "[Avatar API] POST error");
    return NextResponse.json(
      { error: "Fehler beim Hochladen des Avatars" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/user/avatar - Remove avatar
// =============================================================================

export async function DELETE() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    // Get current user's avatar
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (!currentUser?.avatarUrl) {
      return NextResponse.json(
        { error: "Kein Avatar vorhanden" },
        { status: 404 }
      );
    }

    // Delete from storage
    try {
      await deleteFile(currentUser.avatarUrl);
    } catch (error) {
      logger.warn(
        { err: error },
        "[Avatar API] Could not delete avatar from storage"
      );
    }

    // Remove URL from user record
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    return NextResponse.json({
      success: true,
      message: "Avatar wurde entfernt",
    });
  } catch (error) {
    logger.error({ err: error }, "[Avatar API] DELETE error");
    return NextResponse.json(
      { error: "Fehler beim Entfernen des Avatars" },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET /api/user/avatar - Get avatar signed URL
// =============================================================================

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (!user?.avatarUrl) {
      return NextResponse.json({ avatarUrl: null, signedUrl: null });
    }

    // Generate a signed URL for display
    const signedUrl = await getSignedUrl(user.avatarUrl, 3600);

    return NextResponse.json({
      avatarUrl: user.avatarUrl,
      signedUrl,
    });
  } catch (error) {
    logger.error({ err: error }, "[Avatar API] GET error");
    return NextResponse.json(
      { error: "Fehler beim Laden des Avatars" },
      { status: 500 }
    );
  }
}
