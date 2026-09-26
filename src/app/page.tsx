import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MarketingLanding } from "@/components/marketing/marketing-landing";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { oeffentlicheEinstellungen } from "@/lib/marketing/oeffentlicher-mandant";
import type { MarketingConfig } from "@/lib/marketing/types";
import { videoQuelle } from "@/lib/marketing/video-quelle";
import { oeffentlicheTarife } from "@/lib/marketing/oeffentliche-tarife";

export default async function Home() {
  const session = await auth();

  // Logged-in users go to dashboard (also handled by middleware)
  if (session?.user) {
    redirect("/dashboard");
  }

  // Inhalte des Betreibers, nicht des erstbesten Mandanten — siehe
  // oeffentlicher-mandant.ts.
  const settings = (await oeffentlicheEinstellungen()) ?? {};
  const gespeichert = settings.marketing as MarketingConfig | undefined;
  // An uploaded video is stored as a storage key; the page plays it through
  // /api/marketing/video (lib/marketing/video-quelle).
  const marketingConfig = gespeichert?.showcase
    ? { ...gespeichert, showcase: { ...gespeichert.showcase, videoUrl: videoQuelle(gespeichert.showcase.videoUrl) } }
    : gespeichert;

  // Show marketing page with header/footer for unauthenticated users
  return (
    <>
      <MarketingHeader />
      <main className="flex-1">
        <MarketingLanding config={marketingConfig} tarife={await oeffentlicheTarife()} />
      </main>
      <MarketingFooter />
    </>
  );
}
