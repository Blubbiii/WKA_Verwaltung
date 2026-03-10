import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

/**
 * Validates API key from Authorization header (Bearer token) or X-API-Key header.
 * Used for machine-to-machine endpoints (n8n, scripts).
 *
 * The API key is checked against the SCADA_API_KEY env var.
 * Returns the first tenant's ID (for single-tenant setups) or a specified tenantId.
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
      error: NextResponse.json(
        { error: "API key authentication not configured on server" },
        { status: 500 },
      ),
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

  if (!providedKey || providedKey !== expectedKey) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Unauthorized: Invalid or missing API key" },
        { status: 401 },
      ),
    };
  }

  // Resolve tenant: use X-Tenant-Id header or fall back to first tenant
  const tenantIdHeader = request.headers.get("x-tenant-id");
  if (tenantIdHeader) {
    return { authorized: true, tenantId: tenantIdHeader };
  }

  // Fallback: use the first (and usually only) tenant
  const tenant = await prisma.tenant.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (!tenant) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "No tenant found in database" },
        { status: 500 },
      ),
    };
  }

  return { authorized: true, tenantId: tenant.id };
}
