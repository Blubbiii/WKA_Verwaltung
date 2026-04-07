import { NextResponse } from "next/server";

/**
 * GET /api/auth/sso-config
 *
 * Public endpoint — returns whether SSO (Authentik OIDC) is configured.
 * The login page fetches this to decide whether to show the SSO button.
 * No auth required: the response contains no sensitive data.
 */
export async function GET() {
  try {
    return NextResponse.json({
      ssoEnabled: !!process.env.AUTHENTIK_ISSUER,
      providerName: process.env.AUTHENTIK_DISPLAY_NAME || "SSO Login",
    });
  } catch {
    return NextResponse.json({ ssoEnabled: false, providerName: "SSO Login" });
  }
}
