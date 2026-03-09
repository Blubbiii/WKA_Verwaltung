import {
  Upload, Calculator, Send, Download, FileCheck, BarChart3,
  Mail, Shield, Zap, Settings, Eye, RefreshCw,
} from "lucide-react";
import type { WorkflowStepConfig } from "@/lib/marketing/types";

const ICON_MAP: Record<string, React.ElementType> = {
  upload: Upload, calculator: Calculator, send: Send, download: Download,
  "file-check": FileCheck, "bar-chart": BarChart3, mail: Mail,
  shield: Shield, zap: Zap, settings: Settings, eye: Eye, "refresh-cw": RefreshCw,
};

const DEFAULT_STEPS: WorkflowStepConfig[] = [
  { icon: "upload", title: "Daten importieren", description: "SCADA-Daten, Energieabrechnungen und Vertragsdaten automatisch einlesen." },
  { icon: "calculator", title: "Automatisch berechnen", description: "Pachtanteile, Gutschriften und Verteilungen werden sofort berechnet." },
  { icon: "send", title: "Gutschriften versenden", description: "ZUGFeRD-konforme Gutschriften per E-Mail oder im Portal bereitstellen." },
];

interface WorkflowSectionProps {
  title?: string;
  subtitle?: string;
  steps?: WorkflowStepConfig[];
}

export function WorkflowSection({ title, subtitle, steps }: WorkflowSectionProps) {
  const workflowSteps = steps && steps.length > 0 ? steps : DEFAULT_STEPS;
  const heading = title || "So einfach funktioniert es";
  const subheading = subtitle || "Von der Datenerfassung bis zur Gutschrift in drei Schritten.";

  return (
    <section id="workflow" className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight">
            {heading}
          </h2>
          <p className="mt-4 text-[hsl(var(--m-text-muted))] max-w-2xl mx-auto">
            {subheading}
          </p>
        </div>

        <div className="relative flex flex-col md:flex-row items-center md:items-start justify-between gap-12 md:gap-8 max-w-4xl mx-auto">
          <div
            className="hidden md:block absolute top-8 left-[calc(16.67%+16px)] right-[calc(16.67%+16px)] h-px"
            aria-hidden="true"
          >
            <div className="h-full w-full bg-gradient-to-r from-[hsl(var(--m-primary))]/50 via-[hsl(var(--m-primary))]/30 to-[hsl(var(--m-primary))]/50" />
          </div>
          <div
            className="md:hidden absolute top-8 bottom-8 left-8 w-px bg-gradient-to-b from-[hsl(var(--m-primary))]/50 via-[hsl(var(--m-primary))]/30 to-[hsl(var(--m-primary))]/50"
            aria-hidden="true"
          />

          {workflowSteps.map((s, idx) => {
            const Icon = ICON_MAP[s.icon] || Upload;
            const step = String(idx + 1).padStart(2, "0");

            return (
              <div key={step} className="flex-1 text-center relative z-10 group">
                <div
                  className="mx-auto w-16 h-16 rounded-full border-2 flex items-center justify-center mb-4 transition-shadow duration-300 group-hover:animate-glow-pulse"
                  style={{ borderColor: "hsl(var(--m-primary))", backgroundColor: "hsl(var(--m-primary) / 0.08)" }}
                >
                  <Icon className="h-7 w-7" style={{ color: "hsl(var(--m-primary))" }} />
                </div>
                <p className="font-mono text-xs font-medium mb-1" style={{ color: "hsl(var(--m-primary))" }}>
                  {step}
                </p>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
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
