"use client";

import { AnimatedCounter } from "@/components/marketing/ui/animated-counter";

// ============================================================================
// StatsSection -- Dark section with 4 animated stat counters.
// Client Component (requires AnimatedCounter with IntersectionObserver).
// ============================================================================

const stats = [
  { end: 50, suffix: "+", label: "Windparks" },
  { end: 200, suffix: "+", label: "Anlagen" },
  { end: 500, suffix: "+", label: "Gesellschafter" },
  { end: 25, prefix: "\u20AC", suffix: "M+", label: "abgerechnet" },
] as const;

export function StatsSection() {
  return (
    <section className="relative py-16 md:py-24 bg-slate-900">
      {/* Decorative blur circles */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <AnimatedCounter
                end={stat.end}
                suffix={stat.suffix}
                prefix={"prefix" in stat ? stat.prefix : undefined}
                className="text-4xl md:text-5xl font-bold gradient-text"
              />
              <p className="text-sm md:text-base text-slate-400 mt-2">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
