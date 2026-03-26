import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfigBoolean } from "@/lib/config";

const GISClient = dynamic(
  () => import("@/components/gis/GISClient").then((m) => m.GISClient),
  { ssr: false }
);

export default async function GISPage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId ?? null;
  const gisEnabled = await getConfigBoolean("gis.enabled", tenantId, false);
  if (!gisEnabled) notFound();

  return (
    <div className="-mx-6 -my-6 overflow-hidden">
      <GISClient />
    </div>
  );
}
