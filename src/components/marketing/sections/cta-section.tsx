import Link from "next/link";

// ============================================================================
// CtaSection -- Full-width gradient CTA with decorative blur elements.
// Server Component (no "use client" directive).
// ============================================================================

export function CtaSection() {
  return (
    <section className="relative py-20 md:py-32 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 overflow-hidden">
      {/* Decorative blur elements */}
      <div aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto relative z-10">
          {/* Headline */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            Bereit für die Zukunft der Windpark-Verwaltung?
          </h2>

          {/* Subtitle */}
          <p className="text-lg text-blue-100 mt-6 max-w-xl mx-auto">
            Starten Sie noch heute und erleben Sie, wie WindparkManager Ihren
            Arbeitsalltag transformiert.
          </p>

          {/* CTAs */}
          <div className="flex justify-center gap-4 mt-10">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl bg-white text-blue-700 font-semibold px-8 py-3 hover:bg-blue-50 transition-colors"
            >
              Kostenlos testen
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center justify-center rounded-xl border-2 border-white/30 text-white font-semibold px-8 py-3 hover:bg-white/10 transition-colors"
            >
              Demo ansehen
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
