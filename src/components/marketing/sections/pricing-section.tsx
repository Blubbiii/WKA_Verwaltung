import { PriceCalculator } from "@/components/marketing/pricing-calculator";
import type { PricingConfig } from "@/lib/marketing/types";

interface PricingSectionProps {
  pricingConfig?: PricingConfig;
}

export function PricingSection({ pricingConfig }: PricingSectionProps) {
  return (
    <section id="pricing" className="py-20 md:py-32 bg-muted/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight">
            Transparente Preise
          </h2>
          <p className="max-w-2xl text-[hsl(var(--m-text-muted))] md:text-lg">
            Skalierbar für jede Parkgröße. Keine versteckten Kosten, keine langen Vertragslaufzeiten.
          </p>
        </div>

        <div className="flex justify-center">
          <PriceCalculator pricingConfig={pricingConfig} />
        </div>
      </div>
    </section>
  );
}
