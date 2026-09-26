/**
 * The showcase video setting holds either an uploaded file's S3 key
 * (POST /api/admin/marketing-video) or an external URL. The landing page
 * cannot play a storage key — uploaded files go through the public route
 * /api/marketing/video, which streams exactly this one configured object.
 */
export function videoQuelle(wert: string | undefined | null): string | undefined {
  const v = wert?.trim();
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v)) return v;
  // Last path segment carries the upload timestamp — a cache-busting version.
  const version = v.split("/").pop() ?? v;
  return `/api/marketing/video?v=${encodeURIComponent(version)}`;
}
