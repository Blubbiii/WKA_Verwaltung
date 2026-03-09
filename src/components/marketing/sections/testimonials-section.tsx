import type { TestimonialConfig } from "@/lib/marketing/types";

const DEFAULT_TESTIMONIALS: TestimonialConfig[] = [
  { initials: "TM", name: "Thomas M\u00fcller", role: "Gesch\u00e4ftsf\u00fchrer", company: "Windpark Nordsee GmbH", quote: "WindparkManager hat unsere Pachtabrechnung von 3 Tagen auf 30 Minuten reduziert." },
  { initials: "SW", name: "Sabine Weber", role: "Kaufm. Leitung", company: "Energiepark Mittelland", quote: "Endlich eine Software, die von Windpark-Praktikern entwickelt wurde." },
  { initials: "KB", name: "Dr. Klaus Bergmann", role: "Vorstand", company: "Wind Invest AG", quote: "Die SCADA-Integration gibt uns volle Transparenz \u00fcber alle 12 Parks \u2014 in Echtzeit." },
];

interface TestimonialsSectionProps {
  title?: string;
  items?: TestimonialConfig[];
}

export function TestimonialsSection({ title, items }: TestimonialsSectionProps) {
  const testimonials = items && items.length > 0 ? items : DEFAULT_TESTIMONIALS;
  const heading = title || "Was unsere Kunden sagen";

  return (
    <section id="testimonials" className="py-20 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight text-center mb-16">
          {heading}
        </h2>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map((t) => (
            <div
              key={t.initials + t.name}
              className="group rounded-2xl bg-card p-6 h-full shadow-sm border border-border/50 border-l-[3px] border-l-[hsl(var(--m-primary))]/40 transition-all duration-300 hover:shadow-lg hover:shadow-[hsl(var(--m-primary))]/5 hover:-translate-y-0.5"
            >
              <p
                className="text-5xl font-serif leading-none mb-3 select-none"
                style={{ color: "hsl(var(--m-primary) / 0.2)" }}
                aria-hidden="true"
              >
                &ldquo;
              </p>
              <p className="text-sm text-[hsl(var(--m-text-muted))] leading-relaxed mb-6">
                {t.quote}
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm"
                  style={{ backgroundColor: "hsl(var(--m-primary-light))", color: "hsl(var(--m-primary))" }}
                >
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-[hsl(var(--m-text-muted))]">
                    {t.role}, <span className="font-mono">{t.company}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
