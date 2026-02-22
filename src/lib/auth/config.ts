import { NextAuthConfig } from "next-auth";

// Edge-compatible auth config (no database operations here)
export const authConfig: NextAuthConfig = {
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
      const legacyRole = auth?.user?.role ?? "";
      const isPortalUser = roleHierarchy <= 20 && roleHierarchy > 0;

      if (isProtected) {
        if (!isLoggedIn) return false; // Redirect to login

        // Portal users can only access /portal routes
        if (isPortalUser && !isPortalRoute) {
          return Response.redirect(new URL("/portal", nextUrl));
        }

        // Admin route protection — server-side, not just sidebar hiding
        if (nextUrl.pathname.startsWith("/admin")) {
          const isAdmin = roleHierarchy >= 80 || ["ADMIN", "SUPERADMIN"].includes(legacyRole);
          const isSuperadmin = roleHierarchy >= 100 || legacyRole === "SUPERADMIN";

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
        token.role = user.role ?? "VIEWER"; // Legacy enum value
        token.roleHierarchy = user.roleHierarchy ?? 0; // New hierarchy level
        token.tenantId = user.tenantId ?? "";
        token.tenantName = user.tenantName ?? "";
        token.tenantSlug = user.tenantSlug ?? "";
        token.tenantLogoUrl = user.tenantLogoUrl ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string; // Legacy enum value
        session.user.roleHierarchy = (token.roleHierarchy as number) ?? 0; // New hierarchy level
        session.user.tenantId = token.tenantId as string;
        session.user.tenantName = token.tenantName as string;
        session.user.tenantSlug = token.tenantSlug as string;
        session.user.tenantLogoUrl = (token.tenantLogoUrl as string | null) ?? null;
      }
      return session;
    },
  },
  providers: [], // Providers are added in auth.ts
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};
