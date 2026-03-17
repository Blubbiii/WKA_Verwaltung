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

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials, request) {
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
