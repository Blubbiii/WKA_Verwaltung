import { DefaultSession, DefaultUser } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string; // Legacy UserRole enum value (kept for backward compatibility)
      roleHierarchy: number; // Highest hierarchy level from assigned roles (new system)
      tenantId: string;
      tenantName: string;
      tenantSlug: string;
      tenantLogoUrl: string | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: string; // Legacy UserRole enum value
    roleHierarchy: number; // Highest hierarchy level from assigned roles
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    tenantLogoUrl: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: string; // Legacy UserRole enum value
    roleHierarchy: number; // Highest hierarchy level from assigned roles
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    tenantLogoUrl: string | null;
  }
}
