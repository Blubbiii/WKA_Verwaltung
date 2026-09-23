import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MarketingLanding } from "@/components/marketing/marketing-landing";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { oeffentlicheEinstellungen } from "@/lib/marketing/oeffentlicher-mandant";
import type { MarketingConfig } from "@/lib/marketing/types";

export default async function Home() {
  const session = await auth();

  // Logged-in users go to dashboard (also handled by middleware)
  if (session?.user) {
    redirect("/dashboard");
  }

  // Inhalte des Betreibers, nicht des erstbesten Mandanten — siehe
  // oeffentlicher-mandant.ts.
  const settings = (await oeffentlicheEinstellungen()) ?? {};
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
