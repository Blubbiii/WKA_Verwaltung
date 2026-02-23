import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authConfig } from "./config";
import { prisma } from "@/lib/prisma";
import { authLogger } from "@/lib/logger";
import { rateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

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
        const loginRateCheck = rateLimit(`login:${email.toLowerCase()}`, AUTH_RATE_LIMIT);
        if (!loginRateCheck.success) {
          authLogger.warn({ email }, "Login rate limit exceeded");
          throw new Error("Zu viele Anmeldeversuche. Bitte warten Sie 15 Minuten.");
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
            include: { tenant: true },
          });

          if (!user || user.status !== "ACTIVE") {
            return null;
          }

          const passwordMatch = await bcrypt.compare(password, user.passwordHash);

          if (!passwordMatch) {
            return null;
          }

          // Fetch highest role hierarchy from UserRoleAssignment
          const roleAssignments = await prisma.userRoleAssignment.findMany({
            where: { userId: user.id },
            include: { role: { select: { hierarchy: true } } },
          });
          const roleHierarchy = roleAssignments.length > 0
            ? Math.max(0, ...roleAssignments.map(a => a.role.hierarchy))
            : 0;

          // Update last login
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
            role: user.role, // Legacy enum value (kept for backward compat)
            roleHierarchy, // New hierarchy level from assigned roles
            tenantId: user.tenantId,
            tenantName: user.tenant.name,
            tenantSlug: user.tenant.slug,
            tenantLogoUrl: user.tenant.logoUrl,
          };
        } catch (error) {
          authLogger.error({ err: error }, "Authentication failed");
          return null;
        }
      },
    }),
  ],
});
