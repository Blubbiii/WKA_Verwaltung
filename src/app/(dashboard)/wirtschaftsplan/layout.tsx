import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function WirtschaftsplanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("wirtschaftsplan:read");
  return <>{children}</>;
}
