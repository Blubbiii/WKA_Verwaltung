import Link from "next/link";

// ============================================================================
// CtaSection -- Dark navy CTA with topo pattern and teal glow.
// Server Component.
// ============================================================================

export function CtaSection() {
  return (
    <section className="relative py-20 md:py-32 bg-slate-950 overflow-hidden">
      {/* Topo pattern */}
      <div className="absolute inset-0 topo-pattern opacity-50" aria-hidden="true" />

      {/* Teal glow elements */}
      <div aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-500/8 rounded-full blur-[120px]" />
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto relative z-10">
          {/* Headline */}
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight text-white">
            Bereit für die Zukunft der Windpark-Verwaltung?
          </h2>

          {/* Subtitle */}
          <p className="text-lg text-slate-400 mt-6 max-w-xl mx-auto">
            Starten Sie noch heute und erleben Sie, wie WindparkManager Ihren
            Arbeitsalltag transformiert.
          </p>

          {/* CTAs */}
          <div className="flex justify-center gap-4 mt-10">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl px-8 py-3.5 font-semibold text-white transition-all shadow-lg hover:brightness-110 animate-glow-pulse"
              style={{ backgroundColor: "hsl(var(--m-primary))" }}
            >
              Kostenlos testen
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center justify-center rounded-xl border-2 border-slate-600 text-slate-300 font-medium px-8 py-3.5 hover:bg-slate-800/50 hover:border-slate-500 transition-all"
            >
              Demo ansehen
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
