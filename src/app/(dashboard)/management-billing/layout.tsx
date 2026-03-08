import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function ManagementBillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("management-billing:read");
  return <>{children}</>;
}
