/**
 * Extract the filename from a Content-Disposition header.
 *
 * Handles both:
 *   - RFC 6266 `filename*=UTF-8''<url-encoded>` (correctly decodes Umlauts)
 *   - Legacy `filename="..."` or unquoted `filename=...`
 *
 * Returns null if no filename can be extracted.
 */
export function extractFilename(header: string | null): string | null {
  if (!header) return null;

  // Prefer RFC 6266 filename*=UTF-8''... — it round-trips Umlauts safely
  const encoded = header.match(/filename\*=(?:UTF-8'')?([^;\s]+)/i);
  if (encoded && encoded[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // fall through to legacy fallback
    }
  }

  // Legacy: filename="..." or filename=<value>
  const legacy = header.match(/filename="?([^";\r\n]+)"?/i);
  if (legacy && legacy[1]) {
    return legacy[1].trim();
  }

  return null;
}
