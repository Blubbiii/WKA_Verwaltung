import { Upload, Calculator, Send } from "lucide-react";

// ============================================================================
// WorkflowSection -- 3-step workflow with connecting gradient line.
// Server Component (no client-side interactivity needed).
// ============================================================================

const steps = [
  {
    icon: Upload,
    color: "blue",
    step: "Schritt 1",
    title: "Daten importieren",
    description:
      "SCADA-Daten, Energieabrechnungen und Vertragsdaten automatisch einlesen.",
  },
  {
    icon: Calculator,
    color: "cyan",
    step: "Schritt 2",
    title: "Automatisch berechnen",
    description:
      "Pachtanteile, Gutschriften und Verteilungen werden sofort berechnet.",
  },
  {
    icon: Send,
    color: "emerald",
    step: "Schritt 3",
    title: "Gutschriften versenden",
    description:
      "ZUGFeRD-konforme Gutschriften per E-Mail oder im Portal bereitstellen.",
  },
] as const;

const colorMap = {
  blue: {
    circle: "bg-blue-500/10 border-blue-500",
    icon: "text-blue-500",
    label: "text-blue-500",
  },
  cyan: {
    circle: "bg-cyan-500/10 border-cyan-500",
    icon: "text-cyan-500",
    label: "text-cyan-500",
  },
  emerald: {
    circle: "bg-emerald-500/10 border-emerald-500",
    icon: "text-emerald-500",
    label: "text-emerald-500",
  },
} as const;

export function WorkflowSection() {
  return (
    <section id="workflow" className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            So einfach funktioniert es
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Von der Datenerfassung bis zur Gutschrift in drei Schritten.
          </p>
        </div>

        {/* Steps */}
        <div className="relative flex flex-col md:flex-row items-center md:items-start justify-between gap-12 md:gap-8 max-w-4xl mx-auto">
          {/* Connecting line -- desktop (horizontal) */}
          <div
            className="hidden md:block absolute top-8 left-[calc(16.67%+16px)] right-[calc(16.67%+16px)] h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500"
            aria-hidden="true"
          />

          {/* Connecting line -- mobile (vertical) */}
          <div
            className="md:hidden absolute top-8 bottom-8 left-8 w-0.5 bg-gradient-to-b from-blue-500 via-cyan-500 to-emerald-500"
            aria-hidden="true"
          />

          {steps.map((s) => {
            const colors = colorMap[s.color];
            const Icon = s.icon;

            return (
              <div
                key={s.step}
                className="flex-1 text-center md:text-center relative z-10"
              >
                {/* Icon circle */}
                <div
                  className={`mx-auto w-16 h-16 rounded-full border-2 flex items-center justify-center mb-4 ${colors.circle}`}
                >
                  <Icon className={`h-7 w-7 ${colors.icon}`} />
                </div>

                {/* Step label */}
                <p className={`text-xs font-medium mb-1 ${colors.label}`}>
                  {s.step}
                </p>

                {/* Title */}
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>

                {/* Description */}
                <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">
                  {s.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
