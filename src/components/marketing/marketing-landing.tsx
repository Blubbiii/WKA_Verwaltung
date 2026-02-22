import { PriceCalculator } from "@/components/marketing/pricing-calculator";
import { WindTurbineAnimation } from "@/components/marketing/wind-turbine";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { MarketingConfig } from "@/lib/marketing/types";

// ============================================================================
// Icon mapping: string key -> inline SVG (no external icon library needed)
// ============================================================================
const iconMap: Record<string, React.ReactNode> = {
  activity: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  "credit-card": (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  ),
  users: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  "check-square": (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  layers: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  ),
  "bar-chart": (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  ),
};

// ============================================================================
// Default features (used when no config is provided from the database)
// ============================================================================
const defaultFeatures: Array<{ title: string; description: string; icon: string }> = [
  {
    title: "SCADA-Integration",
    description: "Automatischer Import von Enercon-Betriebsdaten mit Anomalie-Erkennung und Leistungsanalyse.",
    icon: "activity",
  },
  {
    title: "Automatisierte Abrechnung",
    description: "XRechnung/ZUGFeRD-konforme Rechnungen, Mahnwesen und Skonto -- alles vollautomatisch.",
    icon: "credit-card",
  },
  {
    title: "Gesellschafter-Portal",
    description: "Transparente Beteiligungsuebersicht, Abstimmungen und Dokumentenmanagement fuer Ihre Investoren.",
    icon: "users",
  },
  {
    title: "GoBD-konformes Archiv",
    description: "Revisionssichere Archivierung mit SHA-256 Hash-Chain und 10 Jahre Aufbewahrung.",
    icon: "check-square",
  },
  {
    title: "Multi-Mandanten",
    description: "Verwalten Sie mehrere Parks und Gesellschaften mit strikter Datentrennung und Rollenkonzept.",
    icon: "layers",
  },
  {
    title: "Dashboard & Reporting",
    description: "19 konfigurierbare Widgets, automatische Berichte und DATEV-Export fuer Ihre Steuerberatung.",
    icon: "bar-chart",
  },
];

// ============================================================================
// Fallback icon for unknown icon keys
// ============================================================================
function getIcon(iconKey: string): React.ReactNode {
  return iconMap[iconKey] ?? iconMap["activity"];
}

// ============================================================================
// MarketingLanding component (reusable, not a Next.js page)
// ============================================================================
interface MarketingLandingProps {
  config?: MarketingConfig;
}

export function MarketingLanding({ config }: MarketingLandingProps) {
  const heroTitle = config?.hero?.title ?? "Die Zukunft der Windpark-Verwaltung";
  const heroSubtitle = config?.hero?.subtitle ?? "Optimieren Sie Ihre Ertraege mit AI-gestuetzter Wartung, automatisierter Abrechnung und transparenter Buergerbeteiligung.";
  const features = config?.features ?? defaultFeatures;
  const ctaTitle = config?.cta?.title ?? "Bereit fuer die Zukunft?";
  const ctaSubtitle = config?.cta?.subtitle ?? "WindparkManager wurde von Windpark-Betreibern fuer Windpark-Betreiber entwickelt. Ueber 7 Phasen hinweg entstanden -- von Foundation bis SCADA-Integration.";
  const pricingConfig = config?.pricing;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-gradient-to-b from-background to-muted/20 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px] items-center">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none text-primary">
                  {heroTitle}
                </h1>
                <p className="max-w-[600px] text-muted-foreground md:text-xl">
                  {heroSubtitle}
                </p>
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <Button size="lg" className="px-8" asChild>
                  <Link href="/register">Kostenlos testen</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="#features">Funktionen ansehen</Link>
                </Button>
              </div>
            </div>

            <div
              className="flex items-center justify-center lg:justify-end"
              aria-hidden="true"
            >
              <WindTurbineAnimation />
            </div>
          </div>
        </div>

        {/* Decorative Background */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />
      </section>

      {/* Features Section */}
      <section id="features" className="w-full py-12 md:py-24 lg:py-32">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">
              Alles, was Sie brauchen
            </h2>
            <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed">
              Von der Betriebsdatenerfassung bis zur Gutschrift -- eine Plattform
              fuer den gesamten Windpark-Lebenszyklus.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col gap-2 rounded-lg border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {getIcon(feature.icon)}
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="w-full py-12 md:py-24 lg:py-32 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">
              Transparente Preise
            </h2>
            <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed">
              Skalierbar fuer jede Parkgroesse. Keine versteckten Kosten.
            </p>
          </div>

          <div className="flex justify-center">
            <PriceCalculator pricingConfig={pricingConfig} />
          </div>
        </div>
      </section>

      {/* About / CTA Section */}
      <section id="about" className="w-full py-12 md:py-24 lg:py-32">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-6 text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">
              {ctaTitle}
            </h2>
            <p className="text-muted-foreground md:text-xl/relaxed">
              {ctaSubtitle}
            </p>
            <div className="flex flex-col gap-2 min-[400px]:flex-row">
              <Button size="lg" className="px-8" asChild>
                <Link href="/register">Demo anfordern</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Einloggen</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
