import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authConfig } from "./config";
import { prisma } from "@/lib/prisma";
import { authLogger } from "@/lib/logger";
import { rateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { getRoleHierarchyForTenant } from "./role-hierarchy";

const loginSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(1, "Passwort erforderlich"),
});

/**
 * Resolve the active tenant and role hierarchy for a DB user.
 * Prefers the primary tenant membership, falls back to user.tenantId.
 */
async function resolveUserTenantContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenant: true,
      userTenantMemberships: {
        where: { isPrimary: true, status: "ACTIVE" },
        include: { tenant: true },
        take: 1,
      },
    },
  });
  if (!user) return null;

  const primaryMembership = user.userTenantMemberships[0];
  const activeTenant = primaryMembership?.tenant ?? user.tenant;
  const roleHierarchy = await getRoleHierarchyForTenant(user.id, activeTenant.id);

  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
    roleHierarchy,
    tenantId: activeTenant.id,
    tenantName: activeTenant.name,
    tenantSlug: activeTenant.slug,
    tenantLogoUrl: activeTenant.logoUrl,
  };
}

// ---------------------------------------------------------------------------
// SSO: Authentik OIDC provider — only active when env vars are set
// ---------------------------------------------------------------------------
interface AuthentikProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ssoProviders: any[] = process.env.AUTHENTIK_ISSUER
  ? [
      {
        id: "authentik",
        name: process.env.AUTHENTIK_DISPLAY_NAME || "SSO Login",
        type: "oidc" as const,
        issuer: process.env.AUTHENTIK_ISSUER,
        clientId: process.env.AUTHENTIK_CLIENT_ID!,
        clientSecret: process.env.AUTHENTIK_CLIENT_SECRET!,
        checks: ["pkce", "state"] as const,
        profile(profile: AuthentikProfile) {
          // Map Authentik profile to a minimal Auth.js User shape.
          // Full tenant/role resolution happens in the signIn callback.
          return {
            id: profile.sub,
            email: profile.email,
            name: profile.name ?? profile.preferred_username ?? profile.email,
            // Placeholder values — overwritten inside signIn callback
            roleHierarchy: 0,
            tenantId: "",
            tenantName: "",
            tenantSlug: "",
            tenantLogoUrl: null,
          };
        },
      },
    ]
  : [];

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * signIn callback — called for every provider.
     * For Authentik: look up the user by email and attach tenant context to
     * the user object so the jwt callback can persist it in the token.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider === "authentik") {
        const email = profile?.email as string | undefined;
        if (!email) {
          authLogger.warn("Authentik SSO: no email in OIDC profile — login denied");
          return false;
        }

        try {
          const dbUser = await prisma.user.findFirst({
            where: { email, status: "ACTIVE" },
          });

          if (!dbUser) {
            authLogger.warn({ email }, "Authentik SSO: no active WPM user found for email — login denied");
            return false;
          }

          // Resolve tenant context and write it back onto the mutable user object
          // so the jwt callback receives the full context.
          const ctx = await resolveUserTenantContext(dbUser.id);
          if (!ctx) return false;

          // Update last login timestamp
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { lastLoginAt: new Date() },
          });

          // Overwrite the user object in-place — Auth.js passes it by reference
          user.id = ctx.id;
          user.email = ctx.email;
          user.name = ctx.name;
          user.roleHierarchy = ctx.roleHierarchy;
          user.tenantId = ctx.tenantId;
          user.tenantName = ctx.tenantName;
          user.tenantSlug = ctx.tenantSlug;
          user.tenantLogoUrl = ctx.tenantLogoUrl;

          authLogger.info({ email, tenantId: ctx.tenantId }, "Authentik SSO login successful");
          return true;
        } catch (error) {
          authLogger.error({ err: error, email }, "Authentik SSO: error during user lookup");
          return false;
        }
      }

      // All other providers (credentials) — allow by default
      return true;
    },
  },
  providers: [
    ...ssoProviders,
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials, _request) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        // Rate limiting: max 5 login attempts per 15 minutes per email
        const loginRateCheck = await rateLimit(`login:${email.toLowerCase()}`, AUTH_RATE_LIMIT);
        if (!loginRateCheck.success) {
          authLogger.warn({ email }, "Login rate limit exceeded");
          throw new Error("Zu viele Anmeldeversuche. Bitte warten Sie 15 Minuten.");
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              tenant: true,
              userTenantMemberships: {
                where: { isPrimary: true, status: "ACTIVE" },
                include: { tenant: true },
                take: 1,
              },
            },
          });

          if (!user || user.status !== "ACTIVE") {
            return null;
          }

          const passwordMatch = await bcrypt.compare(password, user.passwordHash);

          if (!passwordMatch) {
            return null;
          }

          // Resolve active tenant: prefer primary membership, fall back to user.tenantId
          const primaryMembership = user.userTenantMemberships[0];
          const activeTenant = primaryMembership?.tenant ?? user.tenant;

          // Fetch role hierarchy scoped to the active tenant
          const roleHierarchy = await getRoleHierarchyForTenant(user.id, activeTenant.id);

          // Update last login
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
            roleHierarchy,
            tenantId: activeTenant.id,
            tenantName: activeTenant.name,
            tenantSlug: activeTenant.slug,
            tenantLogoUrl: activeTenant.logoUrl,
          };
        } catch (error) {
          authLogger.error({ err: error }, "Authentication failed");
          return null;
        }
      },
    }),
  ],
});
