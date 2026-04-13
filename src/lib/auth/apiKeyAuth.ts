import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

/**
 * Validates API key from Authorization header (Bearer token) or X-API-Key header.
 * Used for machine-to-machine endpoints (n8n, scripts).
 *
 * The API key is checked against the SCADA_API_KEY env var using a timing-safe
 * comparison to prevent timing side-channel attacks.
 *
 * When X-Tenant-Id is provided it is validated against the database to prevent
 * tenant spoofing by an authorized-but-malicious caller.
 */
export async function requireApiKey(
  request: NextRequest,
): Promise<
  | { authorized: true; tenantId: string }
  | { authorized: false; error: NextResponse }
> {
  const expectedKey = process.env.SCADA_API_KEY;
  if (!expectedKey) {
    logger.error("SCADA_API_KEY env var is not configured");
    return {
      authorized: false,
      error: apiError("INTERNAL_ERROR", 500, {
        message: "API key authentication not configured on server",
      }),
    };
  }

  // Extract key from Authorization: Bearer <key> or X-API-Key: <key>
  let providedKey: string | null = null;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    providedKey = authHeader.slice(7).trim();
  }

  if (!providedKey) {
    providedKey = request.headers.get("x-api-key");
  }

  // Timing-safe comparison to prevent timing side-channel attacks
  const isValid =
    providedKey !== null &&
    providedKey.length === expectedKey.length &&
    crypto.timingSafeEqual(
      Buffer.from(providedKey, "utf8"),
      Buffer.from(expectedKey, "utf8"),
    );

  if (!isValid) {
    return {
      authorized: false,
      error: apiError("UNAUTHORIZED", 401, {
        message: "Unauthorized: Invalid or missing API key",
      }),
    };
  }

  // Resolve tenant: validate X-Tenant-Id against DB to prevent spoofing
  const tenantIdHeader = request.headers.get("x-tenant-id");
  if (tenantIdHeader) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdHeader },
      select: { id: true },
    });
    if (!tenant) {
      logger.warn({ tenantId: tenantIdHeader }, "requireApiKey: X-Tenant-Id refers to unknown tenant");
      return {
        authorized: false,
        error: apiError("UNAUTHORIZED", 401, {
          message: "Unauthorized: Unknown tenant",
        }),
      };
    }
    return { authorized: true, tenantId: tenant.id };
  }

  // Fallback: use the first (and usually only) tenant
  const tenant = await prisma.tenant.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (!tenant) {
    return {
      authorized: false,
      error: apiError("INTERNAL_ERROR", 500, {
        message: "No tenant found in database",
      }),
    };
  }

  return { authorized: true, tenantId: tenant.id };
}
