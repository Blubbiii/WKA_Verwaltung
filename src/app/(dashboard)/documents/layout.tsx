import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("documents:read");
  return <>{children}</>;
}
