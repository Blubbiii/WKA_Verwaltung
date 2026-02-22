import {
  Activity,
  CreditCard,
  Users,
  ShieldCheck,
  Layers,
  BarChart3,
  FileText,
  Upload,
} from "lucide-react";

// ============================================================================
// BentoFeatures -- Asymmetric bento-grid features section for marketing page.
// Server Component (no "use client" directive).
// ============================================================================

interface BentoFeaturesProps {
  features?: Array<{ title: string; description: string; icon: string }>;
}

// ---------------------------------------------------------------------------
// Icon mapping: string key -> Lucide component
// ---------------------------------------------------------------------------
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  activity: Activity,
  "credit-card": CreditCard,
  users: Users,
  "check-square": ShieldCheck,
  layers: Layers,
  "bar-chart": BarChart3,
  "file-text": FileText,
  upload: Upload,
};

// ---------------------------------------------------------------------------
// Default feature definitions (German)
// ---------------------------------------------------------------------------
const defaultFeatures: Array<{
  title: string;
  description: string;
  icon: string;
  gridClass: string;
  isLarge?: boolean;
  visualType?: "chart" | "invoice";
}> = [
  {
    title: "SCADA-Integration",
    description:
      "Automatischer Import von Enercon-Betriebsdaten mit Echtzeit-Monitoring, Anomalie-Erkennung und detaillierter Leistungsanalyse.",
    icon: "activity",
    gridClass: "lg:col-span-2 lg:row-span-2",
    isLarge: true,
    visualType: "chart",
  },
  {
    title: "Automatisierte Pachtabrechnung",
    description:
      "XRechnung/ZUGFeRD-konforme Gutschriften, automatische Flurstueck-Zuordnung und Vorschuss-Verrechnung.",
    icon: "credit-card",
    gridClass: "lg:col-span-2 lg:row-span-1",
    isLarge: true,
    visualType: "invoice",
  },
  {
    title: "Gesellschafter-Portal",
    description:
      "Transparente Beteiligungsuebersicht, digitale Abstimmungen und sicherer Dokumentenzugang fuer Ihre Investoren.",
    icon: "users",
    gridClass: "lg:col-span-1",
  },
  {
    title: "GoBD-konformes Archiv",
    description:
      "Revisionssichere Archivierung mit SHA-256 Hash-Chain und 10 Jahre Aufbewahrung.",
    icon: "check-square",
    gridClass: "lg:col-span-1",
  },
  {
    title: "Multi-Mandanten",
    description:
      "Verwalten Sie mehrere Parks und Gesellschaften mit strikter Datentrennung.",
    icon: "layers",
    gridClass: "lg:col-span-1",
  },
  {
    title: "Dashboard & Reporting",
    description:
      "19 konfigurierbare Dashboard-Widgets, automatische Berichte und DATEV-Export.",
    icon: "bar-chart",
    gridClass: "lg:col-span-1",
  },
  {
    title: "Vertragsmanagement",
    description:
      "Zentrale Vertragsverwaltung mit Laufzeit-Tracking und automatischen Erinnerungen.",
    icon: "file-text",
    gridClass: "lg:col-span-1",
  },
  {
    title: "Energiedaten-Import",
    description:
      "Flexible Import-Formate fuer Netzbetreiber-Abrechnungen und Direktvermarkter-Daten.",
    icon: "upload",
    gridClass: "lg:col-span-1",
  },
];

// ---------------------------------------------------------------------------
// Mini CSS-art visuals for large cards
// ---------------------------------------------------------------------------
function ChartVisual() {
  return (
    <div className="mt-6 flex items-end gap-1.5 h-20" aria-hidden="true">
      <div className="flex-1 rounded-t bg-blue-500/70 h-[40%] transition-all duration-500 group-hover:h-[50%]" />
      <div className="flex-1 rounded-t bg-cyan-500/70 h-[70%] transition-all duration-500 group-hover:h-[80%]" />
      <div className="flex-1 rounded-t bg-blue-500/70 h-[55%] transition-all duration-500 group-hover:h-[65%]" />
      <div className="flex-1 rounded-t bg-emerald-500/70 h-[85%] transition-all duration-500 group-hover:h-[95%]" />
      <div className="flex-1 rounded-t bg-cyan-500/70 h-[45%] transition-all duration-500 group-hover:h-[55%]" />
    </div>
  );
}

function InvoiceVisual() {
  return (
    <div className="mt-6 space-y-2.5" aria-hidden="true">
      <div className="h-2 w-full rounded-full bg-muted/80" />
      <div className="h-2 w-4/5 rounded-full bg-muted/60" />
      <div className="h-2 w-3/5 rounded-full bg-muted/40" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function BentoFeatures({ features }: BentoFeaturesProps) {
  // When custom features are passed, render them without bento grid placements
  const useDefaults = !features;
  const items = useDefaults ? defaultFeatures : features;

  return (
    <section id="features" className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Alles, was Sie brauchen
          </h2>
          <p className="mt-4 text-muted-foreground md:text-lg max-w-2xl mx-auto">
            Von der Betriebsdatenerfassung bis zur Gutschrift -- eine Plattform
            fuer den gesamten Windpark-Lebenszyklus.
          </p>
        </div>

        {/* Bento Grid */}
        <div
          className={
            useDefaults
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-3 gap-4"
              : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          }
        >
          {items.map((feature) => {
            const IconComponent = iconMap[feature.icon] ?? iconMap["activity"];
            const isDefault = useDefaults;
            const defaultItem = isDefault
              ? (feature as (typeof defaultFeatures)[number])
              : null;
            const isLarge = defaultItem?.isLarge ?? false;

            return (
              <div
                key={feature.title}
                className={[
                  "group relative rounded-2xl border border-border/50 bg-card p-6",
                  "transition-all duration-300",
                  "hover:shadow-xl hover:shadow-blue-500/5 hover:border-border hover:-translate-y-0.5",
                  defaultItem?.gridClass ?? "",
                ].join(" ")}
              >
                {/* Icon */}
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <IconComponent className="h-6 w-6" aria-hidden="true" />
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>

                {/* Large card visuals */}
                {isLarge && defaultItem?.visualType === "chart" && (
                  <ChartVisual />
                )}
                {isLarge && defaultItem?.visualType === "invoice" && (
                  <InvoiceVisual />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
