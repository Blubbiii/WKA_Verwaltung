import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MarketingLanding } from "@/components/marketing/marketing-landing";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { prisma } from "@/lib/prisma";
import type { MarketingConfig } from "@/lib/marketing/types";

export default async function Home() {
  const session = await auth();

  // Logged-in users go to dashboard (also handled by middleware)
  if (session?.user) {
    redirect("/dashboard");
  }

  // Load marketing config from tenant settings (dynamic content)
  const tenant = await prisma.tenant.findFirst({
    where: { status: "ACTIVE" },
    select: { settings: true },
  });
  const settings = (tenant?.settings as Record<string, unknown>) || {};
  const marketingConfig = settings.marketing as MarketingConfig | undefined;

  // Show marketing page with header/footer for unauthenticated users
  return (
    <>
      <MarketingHeader />
      <main className="flex-1">
        <MarketingLanding config={marketingConfig} />
      </main>
      <MarketingFooter />
    </>
  );
}
