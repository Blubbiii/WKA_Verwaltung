import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { uploadFile, deleteFile, getSignedUrl } from "@/lib/storage";
import { apiError } from "@/lib/api-errors";

interface TenantSettings {
  marketingVideoUrl?: string;
  marketing?: {
    showcase?: {
      videoUrl?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_TYPES = ["video/mp4", "video/webm"];

// POST /api/admin/marketing-video — Upload marketing video
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error!;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return apiError("BAD_REQUEST", undefined, { message: "Keine Datei hochgeladen" });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return apiError("BAD_REQUEST", undefined, { message: `Ungültiger Dateityp. Erlaubt: ${ALLOWED_TYPES.join(", ")}` });
    }

    if (file.size > MAX_VIDEO_SIZE) {
      return apiError("BAD_REQUEST", undefined, { message: `Datei zu groß. Maximum: ${MAX_VIDEO_SIZE / 1024 / 1024} MB` });
    }

    // Upload to S3
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await uploadFile(buffer, `marketing-video.${file.type.split("/")[1]}`, file.type, check.tenantId!);

    // Get signed URL for immediate display
    const signedUrl = await getSignedUrl(key);

    // Save video URL in tenant marketing config
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { settings: true },
    });

    const settings = (tenant?.settings as TenantSettings) || {};
    const marketing = settings.marketing || {};
    const showcase = marketing.showcase || {};
    showcase.videoUrl = key; // Store S3 key, not signed URL

    await prisma.tenant.update({
      where: { id: check.tenantId },
      data: {
        settings: {
          ...settings,
          marketing: { ...marketing, showcase: { ...showcase } },
        },
      },
    });

    logger.info({ tenantId: check.tenantId, key }, "Marketing video uploaded");

    return NextResponse.json({
      key,
      signedUrl,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    logger.error({ err: error }, "Error uploading marketing video");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Hochladen" });
  }
}

// DELETE /api/admin/marketing-video — Remove marketing video
export async function DELETE(_request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error!;

    // Get current video key from settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { settings: true },
    });

    const settings = (tenant?.settings as TenantSettings) || {};
    const videoKey = settings?.marketing?.showcase?.videoUrl;

    if (videoKey) {
      try {
        await deleteFile(videoKey);
      } catch {
        logger.warn({ key: videoKey }, "Video file not found in storage, clearing reference");
      }

      // Clear video URL from settings
      const marketing = settings.marketing || {};
      const showcase = marketing.showcase || {};
      showcase.videoUrl = "";

      await prisma.tenant.update({
        where: { id: check.tenantId },
        data: {
          settings: {
            ...settings,
            marketing: { ...marketing, showcase: { ...showcase } },
          },
        },
      });
    }

    logger.info({ tenantId: check.tenantId }, "Marketing video removed");

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error removing marketing video");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Entfernen" });
  }
}
