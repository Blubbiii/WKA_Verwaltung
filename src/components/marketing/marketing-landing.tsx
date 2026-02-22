import type { MarketingConfig } from "@/lib/marketing/types";
import { HeroSection } from "@/components/marketing/sections/hero-section";
import { TrustBar } from "@/components/marketing/sections/trust-bar";
import { BentoFeatures } from "@/components/marketing/sections/bento-features";
import { ProductShowcase } from "@/components/marketing/sections/product-showcase";
import { StatsSection } from "@/components/marketing/sections/stats-section";
import { WorkflowSection } from "@/components/marketing/sections/workflow-section";
import { PricingSection } from "@/components/marketing/sections/pricing-section";
import { TestimonialsSection } from "@/components/marketing/sections/testimonials-section";
import { CtaSection } from "@/components/marketing/sections/cta-section";
import { ScrollReveal } from "@/components/marketing/ui/scroll-reveal";

interface MarketingLandingProps {
  config?: MarketingConfig;
}

export function MarketingLanding({ config }: MarketingLandingProps) {
  return (
    <div className="flex flex-col">
      <HeroSection config={config?.hero} />
      <TrustBar />
      <ScrollReveal>
        <BentoFeatures features={config?.features} />
      </ScrollReveal>
      <ScrollReveal>
        <ProductShowcase />
      </ScrollReveal>
      <ScrollReveal>
        <StatsSection />
      </ScrollReveal>
      <ScrollReveal>
        <WorkflowSection />
      </ScrollReveal>
      <ScrollReveal>
        <PricingSection pricingConfig={config?.pricing} />
      </ScrollReveal>
      <ScrollReveal>
        <TestimonialsSection />
      </ScrollReveal>
      <CtaSection />
    </div>
  );
}
