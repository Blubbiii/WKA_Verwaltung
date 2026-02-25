"use client";

import { AnimatedCounter } from "@/components/marketing/ui/animated-counter";

// ============================================================================
// StatsSection -- Full-width band with topo pattern and monospace numbers.
// ============================================================================

const stats = [
  { end: 50, suffix: "+", label: "Windparks" },
  { end: 200, suffix: "+", label: "Anlagen" },
  { end: 500, suffix: "+", label: "Gesellschafter" },
  { end: 25, prefix: "\u20AC", suffix: "M+", label: "abgerechnet" },
] as const;

export function StatsSection() {
  return (
    <section className="relative py-16 md:py-24 bg-slate-950 overflow-hidden">
      {/* Topo pattern */}
      <div className="absolute inset-0 topo-pattern opacity-60" aria-hidden="true" />

      {/* Teal glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {stats.map((stat, i) => (
            <div key={stat.label} className="text-center relative">
              {/* Divider on non-first items (desktop only) */}
              {i > 0 && (
                <div
                  className="hidden md:block absolute left-0 top-1/2 -translate-y-1/2 w-px h-12 bg-slate-700"
                  aria-hidden="true"
                />
              )}

              <AnimatedCounter
                end={stat.end}
                suffix={stat.suffix}
                prefix={"prefix" in stat ? stat.prefix : undefined}
                className="text-4xl md:text-5xl font-mono font-medium gradient-text-marketing"
              />
              <p className="text-xs md:text-sm text-slate-400 mt-2 uppercase tracking-wider font-medium">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
