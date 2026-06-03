import { NextAuthConfig } from "next-auth";
import { AUTH_CONFIG } from "@/lib/config/auth-config";

// Edge-compatible auth config (no database operations here)
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      // All paths that require authentication
      const protectedPaths = [
        "/dashboard",
        "/parks",
        "/funds",
        "/shareholders",
        "/leases",
        "/contracts",
        "/votes",
        "/documents",
        "/invoices",
        "/reports",
        "/news",
        "/settings",
        "/admin",
        "/energy",
        "/service-events",
        "/setup",
        "/portal",
      ];

      const isProtected = protectedPaths.some((path) =>
        nextUrl.pathname.startsWith(path)
      );
      const isPortalRoute = nextUrl.pathname.startsWith("/portal");
      const roleHierarchy = auth?.user?.roleHierarchy ?? 0;
      const isPortalUser = roleHierarchy <= 20 && roleHierarchy > 0;

      if (isProtected) {
        if (!isLoggedIn) return false; // Redirect to login

        // Portal users can only access /portal routes
        if (isPortalUser && !isPortalRoute) {
          return Response.redirect(new URL("/portal", nextUrl));
        }

        // Admin route protection — server-side, not just sidebar hiding
        if (nextUrl.pathname.startsWith("/admin")) {
          const isAdmin = roleHierarchy >= 80;
          const isSuperadmin = roleHierarchy >= 100;

          // System routes require Superadmin level (hierarchy >= 100)
          const systemRoutes = [
            "/admin/tenants",
            "/admin/settings",
            "/admin/system-settings",
            "/admin/system",
            "/admin/system-config",
            "/admin/audit-logs",
            "/admin/backup",
            "/admin/marketing",
            "/admin/revenue-types",
            "/admin/fund-categories",
          ];

          const isSystemRoute = systemRoutes.some(
            (route) =>
              nextUrl.pathname === route ||
              nextUrl.pathname.startsWith(route + "/")
          );

          if (isSystemRoute && !isSuperadmin) {
            return Response.redirect(new URL("/dashboard", nextUrl));
          }

          // Regular admin routes require at least Admin level (hierarchy >= 80)
          if (!isSystemRoute && !isAdmin) {
            return Response.redirect(new URL("/dashboard", nextUrl));
          }
        }

        return true;
      } else if (isLoggedIn && (nextUrl.pathname === "/login" || nextUrl.pathname === "/")) {
        // Portal users go to /portal, everyone else to /dashboard
        if (isPortalUser) {
          return Response.redirect(new URL("/portal", nextUrl));
        }
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.roleHierarchy = user.roleHierarchy ?? 0;
        token.tenantId = user.tenantId ?? "";
        token.tenantName = user.tenantName ?? "";
        token.tenantSlug = user.tenantSlug ?? "";
        token.tenantLogoUrl = user.tenantLogoUrl ?? null;
      }
      // Normalize on every refresh: fix stale JWTs that contain null string fields
      // (causes NextAuth v5 internal Zod validation to fail with "Expected string, received null")
      if (token.tenantId == null) token.tenantId = "";
      if (token.tenantName == null) token.tenantName = "";
      if (token.tenantSlug == null) token.tenantSlug = "";
      if (!token.id) token.id = "";
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session(params: any) {
      const { session, token } = params as { session: typeof params.session; token: typeof params.token };
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.roleHierarchy = (token.roleHierarchy as number) ?? 0;
        session.user.tenantId = (token.tenantId as string | null | undefined) ?? "";
        session.user.tenantName = (token.tenantName as string | null | undefined) ?? "";
        session.user.tenantSlug = (token.tenantSlug as string | null | undefined) ?? "";
        session.user.tenantLogoUrl = (token.tenantLogoUrl as string | null | undefined) ?? null;

        // P2-10 Fix: Tenant-Override aus HMAC-Cookie verifizieren — NICHT
        // aus Request-Header lesen. Bei API-Direct-Calls (außerhalb des
        // Middleware-Matchers) könnte sonst ein Angreifer mit gestohlenem
        // JWT den x-active-tenant-id-Header injizieren → Cross-Tenant-Zugriff.
        const req = params.request as Request | undefined;
        const cookieHeader = req?.headers?.get("cookie") ?? "";
        const cookieMatch = cookieHeader.match(/wpm-active-tenant=([^;]+)/);
        if (cookieMatch) {
          const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
          const { verifyActiveTenantCookie } = await import("./active-tenant-cookie");
          const data = await verifyActiveTenantCookie(
            decodeURIComponent(cookieMatch[1]),
            secret,
          );
          if (data) {
            session.user.tenantId = data.activeTenantId;
            session.user.tenantName = data.tenantName;
            session.user.tenantSlug = data.tenantSlug;
            session.user.tenantLogoUrl = data.tenantLogoUrl;
            if (typeof data.roleHierarchy === "number") {
              session.user.roleHierarchy = data.roleHierarchy;
            }
          }
        }
      }
      return session;
    },
  },
  providers: [], // Providers are added in auth.ts
  session: {
    strategy: "jwt",
    maxAge: AUTH_CONFIG.sessionMaxAge,
  },
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        // Sicherer Default: in Production immer secure (auch wenn TLS am Edge/Reverse-Proxy
        // terminiert und NEXTAUTH_URL intern auf http:// zeigt). Opt-out nur für lokale
        // HTTP-Setups via FORCE_INSECURE_COOKIES=true.
        secure:
          process.env.NODE_ENV === "production" &&
          process.env.FORCE_INSECURE_COOKIES !== "true",
      },
    },
  },
};
