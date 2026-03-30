import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { uploadFile, deleteFile, getSignedUrl } from "@/lib/storage";

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
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Ungültiger Dateityp. Erlaubt: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: `Datei zu groß. Maximum: ${MAX_VIDEO_SIZE / 1024 / 1024} MB` },
        { status: 400 }
      );
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = (tenant?.settings as any) || {};
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
    return NextResponse.json({ error: "Fehler beim Hochladen" }, { status: 500 });
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = (tenant?.settings as any) || {};
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
    return NextResponse.json({ error: "Fehler beim Entfernen" }, { status: 500 });
  }
}
