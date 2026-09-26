import { Check } from "lucide-react";
import type { OeffentlicherTarif } from "@/lib/marketing/types";

interface PricingSectionProps {
  tarife: OeffentlicherTarif[];
}

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** What a tariff covers, in the words of the licence (null = unlimited). */
function umfang(t: OeffentlicherTarif): string[] {
  const zeile = (n: number | null, einzahl: string, mehrzahl: string) =>
    n === null ? `Unbegrenzt ${mehrzahl}` : `${n} ${n === 1 ? einzahl : mehrzahl}`;
  return [
    zeile(t.maxFirmen, "Firma", "Firmen"),
    ...(t.maxUmspannwerke === 0 ? [] : [zeile(t.maxUmspannwerke, "Umspannwerk", "Umspannwerke")]),
    zeile(t.maxWea, "WEA", "WEA"),
    zeile(t.maxBenutzer, "Benutzer", "Benutzer"),
  ];
}

/**
 * Tariffs of the platform (2026-09) — maintained in the marketing
 * settings, enforced as the customers' licence. Replaces the former price
 * calculator: what is advertised here is exactly what is booked.
 */
export function PricingSection({ tarife }: PricingSectionProps) {
  return (
    <section id="pricing" className="py-20 md:py-32 bg-muted/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight">Transparente Preise</h2>
          <p className="max-w-2xl text-[hsl(var(--m-text-muted))] md:text-lg">
            Skalierbar für jede Parkgröße. Nur beteiligte Gesellschaften und Portal-Zugänge der Gesellschafter zählen nicht.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tarife.map((t) => (
            <div
              key={t.id}
              className={`flex flex-col rounded-2xl border bg-background p-6 ${
                t.hervorgehoben ? "border-primary shadow-lg ring-1 ring-primary" : "border-border/50"
              }`}
            >
              <h3 className="text-xl font-semibold">{t.name}</h3>
              {t.beschreibung && <p className="mt-1 text-sm text-[hsl(var(--m-text-muted))]">{t.beschreibung}</p>}
              <p className="mt-4 text-3xl font-bold">
                {t.preisMonatEur === null ? "Auf Anfrage" : euro.format(t.preisMonatEur)}
                {t.preisMonatEur !== null && <span className="text-base font-normal"> / Monat</span>}
              </p>
              {t.preisHinweis && <p className="text-xs text-[hsl(var(--m-text-muted))]">{t.preisHinweis}</p>}
              <ul className="mt-6 space-y-2 text-sm">
                {[...umfang(t), ...t.leistungen].map((punkt) => (
                  <li key={punkt} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {punkt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
