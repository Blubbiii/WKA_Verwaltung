import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function ContractsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("contracts:read");
  return <>{children}</>;
}
