"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wind, Menu, X } from "lucide-react";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#showcase", label: "Produkt" },
  { href: "#workflow", label: "Workflow" },
  { href: "#pricing", label: "Preise" },
];

export function MarketingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-[hsl(var(--m-border))] shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto flex h-16 items-center px-4 md:px-6">
        {/* Logo */}
        <Link
          className="mr-8 flex items-center gap-2.5"
          href="/"
        >
          <Wind
            className={`h-5 w-5 transition-colors duration-300 ${
              scrolled ? "text-[hsl(var(--m-primary))]" : "text-blue-400"
            }`}
            aria-hidden="true"
          />
          <span className="flex items-baseline gap-1.5">
            <span
              className={`font-serif text-lg tracking-tight transition-colors duration-300 ${
                scrolled ? "text-foreground" : "text-white"
              }`}
            >
              WPM
            </span>
            <span
              className={`hidden sm:inline text-sm font-medium tracking-wide transition-colors duration-300 ${
                scrolled ? "text-muted-foreground" : "text-slate-400"
              }`}
            >
              WindparkManager
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center space-x-1 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative px-3 py-2 rounded-md transition-colors ${
                scrolled
                  ? "text-muted-foreground hover:text-foreground hover:bg-accent"
                  : "text-slate-400 hover:text-white"
              } after:absolute after:bottom-0.5 after:left-3 after:right-3 after:h-px after:bg-[hsl(var(--m-primary))] after:scale-x-0 after:transition-transform after:duration-300 hover:after:scale-x-100`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <nav className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className={`font-medium ${
                scrolled ? "" : "text-slate-300 hover:text-white hover:bg-white/10"
              }`}
              asChild
            >
              <Link href="/login">Login</Link>
            </Button>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-[hsl(var(--m-primary))] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition-all shadow-sm hover:shadow-md hover:shadow-[hsl(var(--m-primary)/0.25)]"
            >
              Demo anfordern
            </Link>
          </nav>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="sm"
            className={`md:hidden ${scrolled ? "" : "text-white hover:bg-white/10"}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav
          id="mobile-nav"
          className="md:hidden border-t border-[hsl(var(--m-border))] bg-background/95 backdrop-blur-xl px-4 py-4 space-y-1 shadow-lg"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-accent transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-3 mt-2 border-t border-[hsl(var(--m-border))]">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-[hsl(var(--m-primary))] px-4 py-2 text-sm font-semibold text-white"
            >
              Demo anfordern
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
