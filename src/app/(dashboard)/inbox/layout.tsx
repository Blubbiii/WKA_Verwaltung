import { requirePagePermission } from "@/lib/auth/withPermission";

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePagePermission("inbox:read");
  return <>{children}</>;
}
