// ============================================================================
// TestimonialsSection -- 3 testimonial cards with gradient border effect.
// Server Component (no "use client" directive).
// ============================================================================

const testimonials = [
  {
    initials: "TM",
    name: "Thomas Mueller",
    role: "Geschaeftsfuehrer, Windpark Nordsee GmbH",
    quote:
      "WindparkManager hat unsere Pachtabrechnung von 3 Tagen auf 30 Minuten reduziert. Die automatische Flurstueck-Zuordnung ist ein Gamechanger.",
  },
  {
    initials: "SW",
    name: "Sabine Weber",
    role: "Kaufm. Leitung, Energiepark Mittelland",
    quote:
      "Endlich eine Software, die von Windpark-Praktikern entwickelt wurde. Besonders das Gesellschafter-Portal spart uns unzaehlige Rueckfragen.",
  },
  {
    initials: "KB",
    name: "Dr. Klaus Bergmann",
    role: "Vorstand, Wind Invest AG",
    quote:
      "Die SCADA-Integration und das automatische Reporting geben uns volle Transparenz ueber alle 12 Parks -- in Echtzeit.",
  },
] as const;

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        {/* Heading */}
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-16">
          Was unsere Kunden sagen
        </h2>

        {/* Testimonial grid */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.initials}
              className="relative rounded-2xl p-[1px] bg-gradient-to-br from-blue-500/20 via-cyan-500/20 to-emerald-500/20"
            >
              <div className="rounded-2xl bg-card p-6 h-full">
                {/* Quote icon */}
                <p
                  className="text-4xl text-primary/20 font-serif leading-none mb-2"
                  aria-hidden="true"
                >
                  &ldquo;
                </p>

                {/* Quote text */}
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 italic">
                  {testimonial.quote}
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                    {testimonial.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.role}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
