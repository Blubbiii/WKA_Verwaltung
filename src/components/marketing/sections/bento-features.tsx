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
// BentoFeatures -- Asymmetric bento-grid with teal accent + numbering.
// Server Component.
// ============================================================================

interface BentoFeaturesProps {
  features?: Array<{ title: string; description: string; icon: string }>;
}

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
      "XRechnung/ZUGFeRD-konforme Gutschriften, automatische Flurstück-Zuordnung und Vorschuss-Verrechnung.",
    icon: "credit-card",
    gridClass: "lg:col-span-2 lg:row-span-1",
    isLarge: true,
    visualType: "invoice",
  },
  {
    title: "Gesellschafter-Portal",
    description:
      "Transparente Beteiligungsübersicht, digitale Abstimmungen und sicherer Dokumentenzugang für Ihre Investoren.",
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
      "Flexible Import-Formate für Netzbetreiber-Abrechnungen und Direktvermarkter-Daten.",
    icon: "upload",
    gridClass: "lg:col-span-1",
  },
];

function ChartVisual() {
  return (
    <div className="mt-6 flex items-end gap-1.5 h-20" aria-hidden="true">
      {[40, 70, 55, 85, 45, 75, 60].map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t transition-all duration-500 group-hover:opacity-80"
          style={{
            height: `${h}%`,
            backgroundColor: "hsl(var(--m-primary) / 0.25)",
          }}
        />
      ))}
    </div>
  );
}

function InvoiceVisual() {
  return (
    <div className="mt-6 space-y-2.5" aria-hidden="true">
      {[100, 80, 60].map((w, i) => (
        <div
          key={i}
          className="h-2 rounded-full"
          style={{
            width: `${w}%`,
            backgroundColor: `hsl(var(--m-primary) / ${0.15 - i * 0.04})`,
          }}
        />
      ))}
    </div>
  );
}

export function BentoFeatures({ features }: BentoFeaturesProps) {
  const useDefaults = !features;
  const items = useDefaults ? defaultFeatures : features;

  return (
    <section id="features" className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight">
            Alles, was Sie brauchen
          </h2>
          <p className="mt-4 text-[hsl(var(--m-text-muted))] md:text-lg max-w-2xl mx-auto">
            Von der Betriebsdatenerfassung bis zur Gutschrift — eine Plattform
            für den gesamten Windpark-Lebenszyklus.
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
          {items.map((feature, index) => {
            const IconComponent = iconMap[feature.icon] ?? iconMap["activity"];
            const isDefault = useDefaults;
            const defaultItem = isDefault
              ? (feature as (typeof defaultFeatures)[number])
              : null;
            const isLarge = defaultItem?.isLarge ?? false;
            const num = String(index + 1).padStart(2, "0");

            return (
              <div
                key={feature.title}
                className={[
                  "group relative rounded-2xl bg-card p-6 feature-card",
                  defaultItem?.gridClass ?? "",
                ].join(" ")}
              >
                {/* Number + Icon row */}
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: "hsl(var(--m-primary-light))",
                      color: "hsl(var(--m-primary))",
                    }}
                  >
                    <IconComponent className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="font-mono text-xs opacity-30">
                    {num}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>

                {/* Description */}
                <p className="text-sm text-[hsl(var(--m-text-muted))] leading-relaxed">
                  {feature.description}
                </p>

                {/* Large card visuals */}
                {isLarge && defaultItem?.visualType === "chart" && <ChartVisual />}
                {isLarge && defaultItem?.visualType === "invoice" && <InvoiceVisual />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
