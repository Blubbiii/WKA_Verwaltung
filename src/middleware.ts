import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

const ACTIVE_TENANT_COOKIE = "wpm-active-tenant";

interface ActiveTenantData {
  activeTenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantLogoUrl: string | null;
  roleHierarchy: number;
  userId: string;
  startedAt: string;
}

// Web Crypto API — edge-compatible HMAC verification
async function verifyActiveTenantCookie(
  signed: string,
  secret: string
): Promise<ActiveTenantData | null> {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = signed.substring(0, lastDot);
  const signature = signed.substring(lastDot + 1);

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison
    if (signature.length !== expected.length) return null;
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    return JSON.parse(payload) as ActiveTenantData;
  } catch {
    return null;
  }
}

const { auth } = NextAuth(authConfig);

export default auth(async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // Check for active-tenant cookie (multi-tenant switching)
  const cookieValue = request.cookies.get(ACTIVE_TENANT_COOKIE)?.value;
  if (cookieValue) {
    const secret =
      process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
    const data = await verifyActiveTenantCookie(cookieValue, secret);

    if (data) {
      requestHeaders.set("x-active-tenant-id", data.activeTenantId);
      requestHeaders.set("x-active-tenant-name", data.tenantName);
      requestHeaders.set("x-active-tenant-slug", data.tenantSlug);
      requestHeaders.set(
        "x-active-tenant-logo-url",
        data.tenantLogoUrl ?? ""
      );
      requestHeaders.set(
        "x-active-role-hierarchy",
        String(data.roleHierarchy)
      );
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)",
  ],
};
