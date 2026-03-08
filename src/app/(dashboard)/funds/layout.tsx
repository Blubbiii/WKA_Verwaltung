import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function FundsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("funds:read");
  return <>{children}</>;
}
