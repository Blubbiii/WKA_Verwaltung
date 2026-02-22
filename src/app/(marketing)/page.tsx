import { prisma } from "@/lib/prisma";
import { MarketingLanding } from "@/components/marketing/marketing-landing";
import type { MarketingConfig } from "@/lib/marketing/types";

export default async function MarketingPage() {
  // Load marketing config from tenant settings (dynamic content)
  const tenant = await prisma.tenant.findFirst({
    where: { status: "ACTIVE" },
    select: { settings: true },
  });
  const settings = (tenant?.settings as Record<string, unknown>) || {};
  const marketingConfig = settings.marketing as MarketingConfig | undefined;

  return <MarketingLanding config={marketingConfig} />;
}
