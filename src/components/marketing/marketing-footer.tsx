import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t py-6 md:py-0">
      <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 md:h-24 md:flex-row md:px-6">
        <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
          &copy; {new Date().getFullYear()} WindparkManager. Alle Rechte
          vorbehalten.
        </p>
        <nav className="flex gap-4" aria-label="Footer-Navigation">
          <Link
            href="/impressum"
            className="text-sm font-medium underline underline-offset-4 hover:text-foreground text-muted-foreground"
          >
            Impressum
          </Link>
          <Link
            href="/datenschutz"
            className="text-sm font-medium underline underline-offset-4 hover:text-foreground text-muted-foreground"
          >
            Datenschutz
          </Link>
        </nav>
      </div>
    </footer>
  );
}
