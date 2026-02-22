import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Server-side guard for all /admin/* routes.
 * Ensures only users with at least ADMIN-level access can view admin pages.
 * This is a defense-in-depth measure — the middleware also checks this,
 * but the layout provides an additional server-side barrier.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const roleHierarchy = session.user.roleHierarchy ?? 0;
  const legacyRole = session.user.role ?? "";
  const isAdmin =
    roleHierarchy >= 80 || ["ADMIN", "SUPERADMIN"].includes(legacyRole);

  if (!isAdmin) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
