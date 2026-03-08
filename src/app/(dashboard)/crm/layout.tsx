import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("crm:read");
  return <>{children}</>;
}
