import { requirePageAdmin } from "@/lib/auth/withPermission";

/**
 * Server-side guard for all /admin/* routes.
 * Ensures only users with at least ADMIN-level access can view admin pages.
 * This is a defense-in-depth measure — the sidebar also hides these links,
 * but the layout provides an additional server-side barrier.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAdmin();
  return <>{children}</>;
}
