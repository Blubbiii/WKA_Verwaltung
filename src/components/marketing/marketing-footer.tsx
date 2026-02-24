import Link from "next/link";
import { Wind } from "lucide-react";

const productLinks = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Preise" },
  { href: "#showcase", label: "SCADA-Integration" },
  { href: "#workflow", label: "Workflow" },
];

const companyLinks = [
  { href: "#about", label: "Über uns" },
  { href: "#testimonials", label: "Referenzen" },
];

const legalLinks = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
];

export function MarketingFooter() {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-800">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg text-white mb-4">
              <Wind className="h-5 w-5 text-blue-400" aria-hidden="true" />
              WindparkManager
            </Link>
            <p className="text-sm leading-relaxed mb-4">
              Die moderne Plattform für professionelle Windpark-Verwaltung.
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Made in Germany
            </div>
          </div>

          {/* Produkt */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Produkt</h3>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Unternehmen */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Unternehmen</h3>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Rechtliches */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Rechtliches</h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} WindparkManager. Alle Rechte vorbehalten.
          </p>
          <p className="text-xs text-slate-600">
            Windpark-Management neu gedacht.
          </p>
        </div>
      </div>
    </footer>
  );
}
