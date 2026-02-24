import { Upload, Calculator, Send } from "lucide-react";

// ============================================================================
// WorkflowSection -- 3-step workflow with teal accent circles.
// Server Component.
// ============================================================================

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Daten importieren",
    description:
      "SCADA-Daten, Energieabrechnungen und Vertragsdaten automatisch einlesen.",
  },
  {
    icon: Calculator,
    step: "02",
    title: "Automatisch berechnen",
    description:
      "Pachtanteile, Gutschriften und Verteilungen werden sofort berechnet.",
  },
  {
    icon: Send,
    step: "03",
    title: "Gutschriften versenden",
    description:
      "ZUGFeRD-konforme Gutschriften per E-Mail oder im Portal bereitstellen.",
  },
] as const;

export function WorkflowSection() {
  return (
    <section id="workflow" className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight">
            So einfach funktioniert es
          </h2>
          <p className="mt-4 text-[hsl(var(--m-text-muted))] max-w-2xl mx-auto">
            Von der Datenerfassung bis zur Gutschrift in drei Schritten.
          </p>
        </div>

        {/* Steps */}
        <div className="relative flex flex-col md:flex-row items-center md:items-start justify-between gap-12 md:gap-8 max-w-4xl mx-auto">
          {/* Connecting line -- desktop */}
          <div
            className="hidden md:block absolute top-8 left-[calc(16.67%+16px)] right-[calc(16.67%+16px)] h-px"
            aria-hidden="true"
          >
            <div className="h-full w-full bg-gradient-to-r from-[hsl(var(--m-primary))]/50 via-[hsl(var(--m-primary))]/30 to-[hsl(var(--m-primary))]/50" />
          </div>

          {/* Connecting line -- mobile */}
          <div
            className="md:hidden absolute top-8 bottom-8 left-8 w-px bg-gradient-to-b from-[hsl(var(--m-primary))]/50 via-[hsl(var(--m-primary))]/30 to-[hsl(var(--m-primary))]/50"
            aria-hidden="true"
          />

          {steps.map((s) => {
            const Icon = s.icon;

            return (
              <div
                key={s.step}
                className="flex-1 text-center relative z-10 group"
              >
                {/* Icon circle */}
                <div
                  className="mx-auto w-16 h-16 rounded-full border-2 flex items-center justify-center mb-4 transition-shadow duration-300 group-hover:animate-glow-pulse"
                  style={{
                    borderColor: "hsl(var(--m-primary))",
                    backgroundColor: "hsl(var(--m-primary) / 0.08)",
                  }}
                >
                  <Icon
                    className="h-7 w-7"
                    style={{ color: "hsl(var(--m-primary))" }}
                  />
                </div>

                {/* Step number */}
                <p
                  className="font-mono text-xs font-medium mb-1"
                  style={{ color: "hsl(var(--m-primary))" }}
                >
                  {s.step}
                </p>

                {/* Title */}
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>

                {/* Description */}
                <p className="text-sm text-[hsl(var(--m-text-muted))] max-w-[220px] mx-auto">
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
