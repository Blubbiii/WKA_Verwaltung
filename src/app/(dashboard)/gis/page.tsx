import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfigBoolean } from "@/lib/config";
import { GISPageClient } from "./GISPageClient";

export default async function GISPage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId ?? null;
  const gisEnabled = await getConfigBoolean("gis.enabled", tenantId, false);
  if (!gisEnabled) notFound();

  return <GISPageClient />;
}
