import { DefaultSession, DefaultUser } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roleHierarchy: number; // Highest hierarchy level from assigned roles (0=none, 40=viewer, 60=manager, 80=admin, 100=superadmin)
      tenantId: string;
      tenantName: string;
      tenantSlug: string;
      tenantLogoUrl: string | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    roleHierarchy: number;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    tenantLogoUrl: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    roleHierarchy: number;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    tenantLogoUrl: string | null;
  }
}
