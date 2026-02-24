// ============================================================================
// TrustBar -- Minimal trust indicator with partner placeholders.
// Server Component.
// ============================================================================

export function TrustBar() {
  return (
    <section className="py-10 border-y border-[hsl(var(--m-border))]">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center gap-6">
          <p className="text-sm font-medium text-[hsl(var(--m-text-muted))] uppercase tracking-wider">
            Vertraut von führenden Windpark-Betreibern
          </p>

          {/* Partner logo placeholders */}
          <div className="flex items-center gap-8 md:gap-12 flex-wrap justify-center">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-8 w-20 md:w-24 rounded border border-dashed border-[hsl(var(--m-border))] bg-[hsl(var(--m-primary-light))] flex items-center justify-center"
              >
                <span className="text-[10px] font-mono text-[hsl(var(--m-text-muted))] opacity-50">
                  Partner {i}
                </span>
              </div>
            ))}
          </div>

          {/* Stat line */}
          <div className="flex items-center gap-2 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="font-mono text-[hsl(var(--m-primary))]">50+</span>
            <span className="text-[hsl(var(--m-text-muted))]">Windparks werden aktiv verwaltet</span>
          </div>
        </div>
      </div>
    </section>
  );
}
