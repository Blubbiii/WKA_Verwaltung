import {
  Wind,
  Zap,
  Sun,
  Building2,
  BarChart3,
  Shield,
  Globe,
  Leaf,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const items: Array<{ icon: LucideIcon; label: string }> = [
  { icon: Wind, label: "Windenergie" },
  { icon: Zap, label: "Stromhandel" },
  { icon: Sun, label: "Solarparks" },
  { icon: Building2, label: "Betreiber" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Shield, label: "Compliance" },
  { icon: Globe, label: "International" },
  { icon: Leaf, label: "Erneuerbare" },
];

// Duplicate for seamless infinite loop
const allItems = [...items, ...items];

export function TrustBar() {
  return (
    <section className="bg-muted/20 border-y border-border/40 py-6">
      <p className="text-center text-sm text-muted-foreground font-medium uppercase tracking-wider mb-6">
        Vertraut von fuehrenden Windpark-Betreibern
      </p>

      <div
        className="overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        }}
      >
        <div
          className="flex animate-scroll-left"
          style={{ width: "max-content" }}
        >
          {allItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={`${item.label}-${index}`}
                className="flex items-center gap-2 px-8 shrink-0 text-muted-foreground/60"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
