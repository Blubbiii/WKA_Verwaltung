import Link from "next/link";

// ============================================================================
// HeroSection -- Premium marketing hero with "Precision Engineering" aesthetic.
// Server Component (no "use client" directive).
// ============================================================================

interface HeroSectionProps {
  config?: {
    title?: string;
    subtitle?: string;
  };
}

export function HeroSection({ config }: HeroSectionProps) {
  const subtitle =
    config?.subtitle ??
    "Optimieren Sie Ihre Windpark-Verwaltung mit intelligenter Betriebsdatenerfassung, automatisierter Abrechnung und transparentem Reporting — alles in einer Plattform.";

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-slate-950">
      {/* Topographic pattern overlay */}
      <div className="absolute inset-0 topo-pattern opacity-40" aria-hidden="true" />

      {/* Radial teal glow */}
      <div
        className="absolute top-1/3 left-1/3 w-[800px] h-[600px] bg-teal-500/8 rounded-full blur-[120px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-teal-600/5 rounded-full blur-[100px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 md:px-6 relative z-10 pt-24 pb-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-20 items-center">
          {/* Left: Text content */}
          <div className="flex flex-col gap-8">
            {/* Badge */}
            <div className="flex">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/5 px-4 py-1.5 text-sm font-medium text-teal-300">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-glow-pulse" />
                Windpark-Management Software
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl tracking-tight leading-[1.1]">
              {config?.title ? (
                <span className="font-serif gradient-text-marketing">{config.title}</span>
              ) : (
                <>
                  <span className="font-serif text-white">Die Zukunft der</span>
                  <br />
                  <span className="font-serif gradient-text-marketing">Windpark-Verwaltung</span>
                </>
              )}
            </h1>

            {/* Subtitle */}
            <p className="max-w-xl text-lg text-slate-400 leading-relaxed">
              {subtitle}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl bg-[hsl(var(--m-primary))] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:brightness-110 hover:shadow-teal-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Kostenlos testen
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-8 py-3.5 text-base font-medium text-slate-300 transition-all hover:bg-slate-800/50 hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Funktionen ansehen
              </Link>
            </div>

            {/* Stats line */}
            <div className="flex items-center gap-6 pt-2">
              {[
                { value: "50+", label: "Windparks" },
                { value: "500+", label: "Turbinen" },
                { value: "99,8%", label: "Uptime" },
              ].map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-3">
                  {i > 0 && <span className="h-4 w-px bg-slate-700" aria-hidden="true" />}
                  <div>
                    <span className="font-mono text-sm font-medium text-teal-400">{stat.value}</span>
                    <span className="ml-1.5 text-xs text-slate-500">{stat.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Dashboard mockup with perspective */}
          <div
            className="hidden lg:flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="w-full max-w-lg" style={{ perspective: "1200px" }}>
              <div
                className="animate-float"
                style={{ transform: "rotateY(-6deg) rotateX(2deg)" }}
              >
                {/* Browser frame */}
                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/90 overflow-hidden shadow-2xl shadow-teal-500/5">
                  {/* Title bar */}
                  <div className="flex h-9 items-center bg-slate-800/80 px-4 gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
                    <div className="ml-3 flex-1 h-4 rounded bg-slate-700/50 max-w-[200px]" />
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    {/* KPI cards */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { color: "bg-teal-500", width: "w-2/3" },
                        { color: "bg-teal-400", width: "w-3/4" },
                        { color: "bg-amber-500", width: "w-1/2" },
                      ].map((card, i) => (
                        <div key={i} className="rounded-lg bg-slate-800/60 p-3">
                          <div className={`mb-2 h-1 w-full rounded-full ${card.color}/40`} />
                          <div className={`h-2 ${card.width} rounded bg-slate-700/60`} />
                          <div className="mt-1.5 h-4 w-1/2 rounded bg-slate-700/60" />
                        </div>
                      ))}
                    </div>

                    {/* Chart area */}
                    <div className="rounded-lg bg-slate-800/60 p-4">
                      <div className="mb-3 h-2 w-1/3 rounded bg-slate-700/60" />
                      <div className="flex items-end gap-1.5 h-20">
                        {[45, 70, 55, 85, 60, 75, 50, 90, 65, 80].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-t bg-teal-500/30"
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Bottom panels */}
                    <div className="grid grid-cols-2 gap-3">
                      {[0, 1].map((i) => (
                        <div key={i} className="rounded-lg bg-slate-800/60 p-3">
                          <div className="h-2 w-2/3 rounded bg-slate-700/60" />
                          <div className="mt-2 space-y-1.5">
                            <div className="h-1.5 w-full rounded bg-slate-700/40" />
                            <div className="h-1.5 w-5/6 rounded bg-slate-700/40" />
                            <div className="h-1.5 w-4/6 rounded bg-slate-700/40" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator - animated line */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-600">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-teal-500/50 to-transparent animate-bounce-slow" />
      </div>
    </section>
  );
}
