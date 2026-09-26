/**
 * GET /api/marketing/video — streams the showcase video of the public site.
 *
 * Public on purpose (the landing page is shown to visitors). It serves
 * exactly one object: the key stored as marketing.showcase.videoUrl of the
 * public tenant (lib/marketing/oeffentlicher-mandant) — never a key taken
 * from the request. Range requests are passed to S3 so browsers can seek
 * without loading the whole file.
 */

import { NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { s3Client, S3_BUCKET } from "@/lib/storage";
import { oeffentlicheEinstellungen } from "@/lib/marketing/oeffentlicher-mandant";

export async function GET(request: NextRequest) {
  try {
    const settings = (await oeffentlicheEinstellungen()) ?? {};
    const key = (settings.marketing as { showcase?: { videoUrl?: string } } | undefined)?.showcase?.videoUrl?.trim();
    if (!key || /^https?:\/\//i.test(key)) {
      return apiError("NOT_FOUND", 404, { message: "Kein Video hinterlegt" });
    }

    const range = request.headers.get("range") ?? undefined;
    const obj = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, Range: range }));
    if (!obj.Body) return apiError("NOT_FOUND", 404, { message: "Video nicht gefunden" });

    const headers: Record<string, string> = {
      "Content-Type": obj.ContentType || "video/mp4",
      "Accept-Ranges": "bytes",
      // The URL carries a version (?v=), so the file may be cached for long.
      "Cache-Control": "public, max-age=86400",
    };
    if (obj.ContentLength !== undefined) headers["Content-Length"] = String(obj.ContentLength);
    if (obj.ContentRange) headers["Content-Range"] = obj.ContentRange;

    return new Response(obj.Body.transformToWebStream(), {
      status: range && obj.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    logger.error({ err: error }, "[Marketing] Video konnte nicht geladen werden");
    return apiError("FETCH_FAILED", 500, { message: "Video konnte nicht geladen werden" });
  }
}
