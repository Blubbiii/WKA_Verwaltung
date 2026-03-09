import {
  Calculator, FolderSync, Inbox, ContactRound, Mail, ScanLine,
  FileBarChart, Briefcase, Zap, Shield, BarChart3, Settings,
  Activity, CreditCard, Users, LayoutDashboard, Receipt, Building2,
} from "lucide-react";
import type { ModuleConfig } from "@/lib/marketing/types";

const ICON_MAP: Record<string, React.ElementType> = {
  calculator: Calculator, "folder-sync": FolderSync, inbox: Inbox,
  "contact-round": ContactRound, mail: Mail, scan: ScanLine,
  "file-bar-chart": FileBarChart, briefcase: Briefcase, zap: Zap,
  shield: Shield, "bar-chart": BarChart3, settings: Settings,
  activity: Activity, "credit-card": CreditCard, users: Users,
  "layout-dashboard": LayoutDashboard, receipt: Receipt, building: Building2,
};

interface ModulesSectionProps {
  title?: string;
  subtitle?: string;
  items?: ModuleConfig[];
}

export function ModulesSection({ title, subtitle, items }: ModulesSectionProps) {
  if (!items || items.length === 0) return null;

  const heading = title || "Flexible Module f\u00fcr Ihre Anforderungen";
  const subheading = subtitle || "Aktivieren Sie nur die Funktionen, die Sie brauchen.";

  return (
    <section id="modules" className="py-20 md:py-32 bg-muted/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight">
            {heading}
          </h2>
          <p className="mt-4 text-[hsl(var(--m-text-muted))] max-w-2xl mx-auto md:text-lg">
            {subheading}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {items.map((mod) => {
            const Icon = ICON_MAP[mod.icon] || Zap;

            return (
              <div
                key={mod.id}
                className="group relative rounded-2xl border border-border/50 bg-card p-5 transition-all duration-300 hover:shadow-lg hover:shadow-[hsl(var(--m-primary))]/5 hover:-translate-y-0.5"
              >
                {mod.badge && (
                  <span
                    className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "hsl(var(--m-primary) / 0.1)",
                      color: "hsl(var(--m-primary))",
                    }}
                  >
                    {mod.badge}
                  </span>
                )}

                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors"
                  style={{
                    backgroundColor: "hsl(var(--m-primary) / 0.08)",
                  }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "hsl(var(--m-primary))" }}
                  />
                </div>

                <h3 className="text-sm font-semibold mb-1">{mod.title}</h3>
                <p className="text-xs text-[hsl(var(--m-text-muted))] leading-relaxed">
                  {mod.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
