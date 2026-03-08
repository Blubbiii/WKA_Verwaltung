import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function LeasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("leases:read");
  return <>{children}</>;
}
