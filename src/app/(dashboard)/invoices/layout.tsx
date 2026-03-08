import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function InvoicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("invoices:read");
  return <>{children}</>;
}
