import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WindparkManager — Die Zukunft der Windpark-Verwaltung",
  description:
    "Optimieren Sie Ihre Ertraege mit AI-gestuetzter Wartung, automatisierter Abrechnung und transparenter Buergerbeteiligung.",
};

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
