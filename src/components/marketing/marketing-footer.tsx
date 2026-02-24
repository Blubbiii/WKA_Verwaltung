import Link from "next/link";
import { Wind } from "lucide-react";

const productLinks = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Preise" },
  { href: "#showcase", label: "SCADA-Integration" },
  { href: "#workflow", label: "Workflow" },
];

const companyLinks = [
  { href: "#testimonials", label: "Referenzen" },
  { href: "#workflow", label: "So funktioniert es" },
];

const legalLinks = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
];

export function MarketingFooter() {
  return (
    <footer className="bg-[hsl(var(--m-bg))] border-t border-[hsl(var(--m-border))]">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Wind className="h-5 w-5 text-[hsl(var(--m-primary))]" aria-hidden="true" />
              <span className="font-serif text-lg text-foreground tracking-tight">WPM</span>
              <span className="text-sm font-medium text-muted-foreground">WindparkManager</span>
            </Link>
            <p className="text-sm leading-relaxed text-[hsl(var(--m-text-muted))] mb-4">
              Die moderne Plattform für professionelle Windpark-Verwaltung.
            </p>
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--m-text-muted))]">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Made in Germany
            </div>
          </div>

          {/* Produkt */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-4">Produkt</h3>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[hsl(var(--m-text-muted))] hover:text-[hsl(var(--m-primary))] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Unternehmen */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-4">Unternehmen</h3>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[hsl(var(--m-text-muted))] hover:text-[hsl(var(--m-primary))] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Rechtliches */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-4">Rechtliches</h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[hsl(var(--m-text-muted))] hover:text-[hsl(var(--m-primary))] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-[hsl(var(--m-border))] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[hsl(var(--m-text-muted))]">
            &copy; {new Date().getFullYear()} WindparkManager. Alle Rechte vorbehalten.
          </p>
          <p className="text-xs font-mono text-[hsl(var(--m-text-muted))] opacity-60">
            Windpark-Management neu gedacht.
          </p>
        </div>
      </div>
    </footer>
  );
}
