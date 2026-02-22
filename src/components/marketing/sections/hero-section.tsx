import Link from "next/link";
import { ChevronDown } from "lucide-react";

// ============================================================================
// HeroSection -- Premium dark hero for the WindparkManager marketing page.
// Server Component (no "use client" directive).
// ============================================================================

interface HeroSectionProps {
  config?: {
    title?: string;
    subtitle?: string;
  };
}

export function HeroSection({ config }: HeroSectionProps) {
  const defaultTitle = {
    line1: "Die Zukunft der",
    line2: "Windpark-Verwaltung",
  };

  const subtitle =
    config?.subtitle ??
    "Optimieren Sie Ihre Windpark-Verwaltung mit intelligenter Betriebsdatenerfassung, automatisierter Abrechnung und transparentem Reporting -- alles in einer Plattform.";

  return (
    <section className="relative min-h-screen flex items-center bg-slate-950">
      {/* Dot pattern overlay */}
      <div className="absolute inset-0 dot-pattern" aria-hidden="true" />

      {/* Subtle radial glow behind content */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          {/* ----------------------------------------------------------------
              Left side: Text content + CTAs
          ---------------------------------------------------------------- */}
          <div className="flex flex-col gap-8">
            {/* Badge / Pill */}
            <div className="flex">
              <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 px-4 py-1.5 text-sm font-medium text-slate-300">
                Windpark-Management Software
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {config?.title ? (
                <span className="gradient-text">{config.title}</span>
              ) : (
                <>
                  <span className="text-white">{defaultTitle.line1}</span>
                  <br />
                  <span className="gradient-text">{defaultTitle.line2}</span>
                </>
              )}
            </h1>

            {/* Subtitle */}
            <p className="max-w-lg text-lg text-slate-400 leading-relaxed">
              {subtitle}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:brightness-110 hover:shadow-blue-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Kostenlos testen
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-8 py-3 text-base font-semibold text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Funktionen ansehen
              </Link>
            </div>

            {/* Trust badge */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full bg-green-500"
                aria-hidden="true"
              />
              <span className="text-sm text-slate-500">
                Bereits 50+ Windparks verwaltet
              </span>
            </div>
          </div>

          {/* ----------------------------------------------------------------
              Right side: CSS-Art Dashboard Mockup
          ---------------------------------------------------------------- */}
          <div
            className="hidden lg:flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="animate-float w-full max-w-lg">
              {/* Browser chrome frame */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl shadow-blue-500/10">
                {/* Title bar */}
                <div className="flex h-8 items-center bg-slate-800 px-3 gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#eab308]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                </div>

                {/* Content area */}
                <div className="p-4 space-y-3">
                  {/* Top row: 3 stat cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-slate-800 p-3">
                      <div className="mb-2 h-1 w-full rounded-full bg-blue-500" />
                      <div className="h-2 w-3/4 rounded bg-slate-700" />
                      <div className="mt-1.5 h-4 w-1/2 rounded bg-slate-700" />
                    </div>
                    <div className="rounded-lg bg-slate-800 p-3">
                      <div className="mb-2 h-1 w-full rounded-full bg-cyan-500" />
                      <div className="h-2 w-3/4 rounded bg-slate-700" />
                      <div className="mt-1.5 h-4 w-1/2 rounded bg-slate-700" />
                    </div>
                    <div className="rounded-lg bg-slate-800 p-3">
                      <div className="mb-2 h-1 w-full rounded-full bg-emerald-500" />
                      <div className="h-2 w-3/4 rounded bg-slate-700" />
                      <div className="mt-1.5 h-4 w-1/2 rounded bg-slate-700" />
                    </div>
                  </div>

                  {/* Middle: Chart placeholder */}
                  <div className="rounded-lg bg-slate-800 p-4">
                    <div className="mb-3 h-2 w-1/3 rounded bg-slate-700" />
                    <div className="flex items-end gap-2 h-20">
                      <div className="flex-1 rounded-t bg-blue-500/60 h-[45%]" />
                      <div className="flex-1 rounded-t bg-cyan-500/60 h-[70%]" />
                      <div className="flex-1 rounded-t bg-blue-500/60 h-[55%]" />
                      <div className="flex-1 rounded-t bg-emerald-500/60 h-[85%]" />
                      <div className="flex-1 rounded-t bg-cyan-500/60 h-[60%]" />
                      <div className="flex-1 rounded-t bg-blue-500/60 h-[75%]" />
                      <div className="flex-1 rounded-t bg-emerald-500/60 h-[50%]" />
                      <div className="flex-1 rounded-t bg-cyan-500/60 h-[90%]" />
                    </div>
                  </div>

                  {/* Bottom: Two medium boxes side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-800 p-3">
                      <div className="h-2 w-2/3 rounded bg-slate-700" />
                      <div className="mt-2 space-y-1.5">
                        <div className="h-1.5 w-full rounded bg-slate-700" />
                        <div className="h-1.5 w-5/6 rounded bg-slate-700" />
                        <div className="h-1.5 w-4/6 rounded bg-slate-700" />
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-800 p-3">
                      <div className="h-2 w-2/3 rounded bg-slate-700" />
                      <div className="mt-2 space-y-1.5">
                        <div className="h-1.5 w-full rounded bg-slate-700" />
                        <div className="h-1.5 w-3/4 rounded bg-slate-700" />
                        <div className="h-1.5 w-5/6 rounded bg-slate-700" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <ChevronDown
          className="h-6 w-6 text-slate-600 animate-bounce-slow"
          aria-hidden="true"
        />
      </div>
    </section>
  );
}
